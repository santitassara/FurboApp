# Chat "Mi Equipo" — Diseño

Fecha: 2026-08-25

## 1. Problema

Cuando la votación de formaciones de un partido cierra (`Partidos.votacionEquiposCerrada = 1`), los jugadores anotados con un `equipo` asignado (A o B) no tienen forma de comunicarse solo con sus compañeros de equipo dentro de la app. Se pide:

1. Un botón "Mi equipo" en el Home, junto a la zona donde hoy se muestra la formación/equipos.
2. Al hacer click, navegar a una sección nueva "Mi equipo" con la lista de compañeros de ese equipo y un chat exclusivo entre ellos.

## 2. Alcance

- Chat por partido: cada partido tiene su propio chat de equipo (no persiste entre partidos aunque se repita la misma gente).
- Participan solo titulares. **Corrección post-exploración de código:** el sistema actual de formación/votación (`guardarFormacion`, `generarFormacionAutomatica`, `aplicarGanadora` en `formacionesPropuestasService.js`) solo asigna la columna `equipo` a titulares — los suplentes nunca la reciben. Extender esa asignación a suplentes es un cambio de alcance mayor (toca tres flujos existentes) y queda fuera de este spec; puede evaluarse como proyecto aparte si se necesita después.
- Botón/sección visibles solo cuando la votación de formaciones está cerrada (`votacionEquiposCerrada = 1`) y el usuario tiene inscripción `anotado`, `tipo = 'titular'` y `equipo` no nulo en ese partido.
- Mensajes persistidos en SQLite (historial completo, sobrevive reinicio del backend).
- Actualización en tiempo real vía WebSocket (socket.io).
- Miembros del chat se calculan en vivo desde `Inscripciones` (no hay snapshot congelado) — si cambia el roster después del cierre, el chat refleja el estado actual.

Fuera de alcance: edición/borrado de mensajes, notificaciones push de mensajes nuevos, indicadores de "leído", chat entre equipos rivales, historial cross-partido.

## 3. Modelo de datos

Tabla nueva `MensajesEquipo`, agregada vía `CREATE TABLE IF NOT EXISTS` idempotente en `backend/src/config/db.js`, siguiendo el patrón existente del proyecto (no hay sistema de migrations formal):

```sql
CREATE TABLE IF NOT EXISTS MensajesEquipo (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  equipo TEXT NOT NULL CHECK (equipo IN ('A','B')),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  texto TEXT NOT NULL,
  fechaEnvio TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mensajes_equipo ON MensajesEquipo(partidoId, equipo, fechaEnvio);
```

No se crea tabla de "miembros de equipo": la membresía se deriva en cada consulta desde `Inscripciones` (`estado = 'anotado' AND equipo IS NOT NULL`), igual que ya hacen `EquiposPosibles`/`MapaCancha`.

## 4. Backend

### 4.1 Validación de acceso (compartida)

Nueva función en `inscripcionesService.js` (o servicio nuevo `miEquipoService.js`), reutilizada por REST y por el handshake de socket:

```
obtenerAccesoEquipo(partidoId, usuarioId) →
  - Partido debe existir y tener votacionEquiposCerrada = 1, si no: null (sin acceso)
  - Inscripción del usuario en ese partido debe existir con estado='anotado' y equipo no nulo, si no: null
  - devuelve { equipo: 'A'|'B' }
```

### 4.2 Rutas REST

Anidadas en `backend/src/routes/partidosRoutes.js` (mismo router con `mergeParams: true`, mismo patrón `verificarToken, verificarMiembroGrupo(), envolverAsync(...)`):

- `GET /:partidoId/mi-equipo`
  - 403 si `obtenerAccesoEquipo` devuelve null.
  - Devuelve `{ equipo, companeros: [{ uid, nombre }], mensajes: [...] }` — los últimos 50 mensajes (los más recientes, no los primeros 50 insertados), devueltos en orden ascendente para mostrar (todos titulares, ya que solo ellos tienen `equipo` asignado).
  - `companeros` = jugadores de `Inscripciones` con mismo `partidoId` y `equipo`, join `Usuarios` para `nombre`.

- `POST /:partidoId/mi-equipo/mensajes` — body `{ texto }`
  - 403 si `obtenerAccesoEquipo` devuelve null.
  - Valida `texto` no vacío (trim), longitud máxima razonable (500 caracteres) → 400 si inválido.
  - Inserta en `MensajesEquipo` (`id` = `crypto.randomUUID()`, `fechaEnvio` = `new Date().toISOString()`).
  - Emite por socket: `io.to(`equipo:${partidoId}:${equipo}`).emit('nuevoMensaje', mensaje)`.
  - Responde con el mensaje creado.

### 4.3 Socket.io

- `backend/src/server.js`: se agrega `socket.io` sobre el mismo `http.Server` que ya usa Express (no puerto nuevo). Se guarda la instancia `io` para que los controllers la usen (ej. `app.set('io', io)` o módulo exportado `backend/src/config/socket.js`).
- Refactor puntual: extraer de `backend/src/middlewares/verificarToken.js` la lógica de verificación (Firebase `admin.auth().verifyIdToken` + JWT propio) a una función pura `verificarTokenValor(token) → usuario | null`, reusada por el middleware Express existente y por el handshake del socket. El middleware actual pasa a ser un wrapper delgado sobre esa función.
- Evento `unirse` — payload `{ grupoId, partidoId, token }`:
  - Verifica token con `verificarTokenValor`.
  - Verifica membresía en el grupo (reusa lógica de `verificarMiembroGrupo` extraída a función pura si hace falta) + `obtenerAccesoEquipo(partidoId, usuario.uid)`.
  - Si todo ok: `socket.join(`equipo:${partidoId}:${equipo}`)`, guarda `{ partidoId, equipo }` en `socket.data`.
  - Si falla: `socket.emit('error', { mensaje })` + `socket.disconnect()`.
- No hay evento de envío por socket — el envío es siempre vía `POST /mi-equipo/mensajes`; el socket solo empuja `nuevoMensaje` a los conectados del room.

### 4.4 Dependencia nueva

`backend/package.json`: agregar `socket.io`. `frontend/package.json`: agregar `socket.io-client`.

## 5. Frontend

### 5.1 Botón en Home

`frontend/src/pages/Home.jsx`, junto al bloque donde hoy se renderiza `MapaCancha`/`EquiposPosibles` (líneas ~183-221): agregar botón "Mi equipo" visible cuando:
- `propuestasPorPartido[partido.id]?.votacionEquiposCerrada` es true (ya viene en el payload de `GET .../formaciones-propuestas`, cargado en `propuestasPorPartido`), y
- la inscripción del usuario actual en ese partido es titular y tiene `equipo` asignado (se deriva de `formacionesPorPartido[partido.id].jugadores`, filtrando por `perfil.uid` — ese array ya solo contiene titulares).

Click navega con `react-router-dom` (`useNavigate`) a `/mi-equipo/${partido.id}`.

### 5.2 Ruta y página nueva

**Corrección post-exploración de código:** el router del frontend (`App.jsx`) no anida rutas bajo `/grupos/:grupoId/...` — el grupo activo siempre sale del contexto `useGrupo()`, nunca de la URL (mismo patrón que `/jugadores/:uid` con `PerfilJugador.jsx`). La ruta nueva sigue esa convención:

- Nueva ruta en el router principal: `/mi-equipo/:partidoId` → `frontend/src/pages/MiEquipo.jsx`, que obtiene `grupoId` de `useGrupo().grupoActivo.id` y `partidoId` de `useParams()`.
- Al montar:
  1. `GET .../mi-equipo` (vía `api.js`, mismo interceptor de auth existente) para bootstrap: `equipo`, `companeros`, `mensajes` iniciales.
  2. Conecta `socket.io-client` contra el mismo host del backend, emite `unirse` con `{ grupoId, partidoId, token }` (mismo token que usa el interceptor de axios: Firebase `getIdToken()` o JWT propio de `localStorage`).
  3. Escucha `nuevoMensaje` → apenda al estado de mensajes.
- UI: lista de compañeros arriba (nombre), debajo lista de mensajes (autor + texto + hora) con auto-scroll al último, e input + botón enviar que hace `POST .../mi-equipo/mensajes` y limpia el input (el mensaje propio se agrega al llegar por socket, no de forma optimista, para mantener una sola fuente de verdad).
- Al desmontar: `socket.disconnect()`.

### 5.3 Error/edge cases

- Si `GET .../mi-equipo` devuelve 403 (por ejemplo, el usuario navegó a la URL directamente sin cumplir condiciones): mostrar mensaje "No tenés acceso a este chat" y botón volver al Home.
- Si el socket se desconecta (ej. reconexión de red), `socket.io-client` reconecta el transporte solo, pero la membresía al room (`socket.join`) no sobrevive la reconexión: el cliente debe volver a emitir `unirse` en cada evento `connect` (incluyendo reconexiones), no solo una vez al montar, para restaurar el acceso al chat. Además, como el token de Firebase expira, conviene obtener uno fresco en cada `connect` en lugar de reusar el capturado al montar.

## 6. Testing

Sin tests automáticos salvo que se pidan explícitamente (según preferencia registrada del usuario). Verificación manual:
- Cerrar votación de un partido de prueba, confirmar que aparece "Mi equipo" solo para inscritos con equipo asignado.
- Abrir el chat en dos sesiones (dos equipos A y B) y confirmar aislamiento: mensajes de equipo A no llegan a equipo B.
- Enviar mensaje desde una pestaña, confirmar llegada en tiempo real en otra pestaña del mismo equipo.
- Refrescar la página y confirmar que el historial persiste (viene de SQLite, no de memoria).
