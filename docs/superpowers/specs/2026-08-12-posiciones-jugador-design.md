# Posición del jugador (principal y secundaria) — Diseño

Fecha: 2026-08-12

## 1. Contexto y objetivo

Al anotarse a un partido, el jugador hoy no indica en qué posición va a jugar. Se necesita capturar dos datos por jugador: la posición principal en la cancha y una posición secundaria (útil para casos como un arquero que eventualmente quiere rotar a jugar de otro puesto, o un defensor que también puede cubrir el mediocampo). Ambos datos se piden con un modal obligatorio, en dos momentos: la primera vez que el jugador entra a la app (para fijar su posición "default") y cada vez que se anota a un partido puntual (para confirmar o ajustar esa posición solo para ese partido).

## 2. Alcance de esta spec

Cubre: catálogo de posiciones, columnas nuevas en `Usuarios` e `Inscripciones`, endpoint para fijar el default del perfil, cambios al endpoint de `anotarse` para exigir y guardar la posición de esa inscripción, exposición de la posición en el listado de inscripciones, y los dos modales del frontend (setup post-login y confirmación al anotarse) más su reflejo en el roster (`ListaJugadores`).

No cubre: pantalla para editar el default del perfil fuera del flujo de anotarse, historial de cambios de posición, ni que la posición influya en la lógica de cupos/titular-suplente (sigue siendo puramente informativa). Tampoco incluye tests automatizados (por preferencia ya establecida del usuario para este proyecto).

## 3. Decisiones clave (resueltas en brainstorming)

- **Alcance del dato**: híbrido. `Usuarios` guarda un default (`posicionPrincipal`, `posicionSecundaria`) que se pide una sola vez, obligatoriamente, la primera vez que el perfil no lo tiene. `Inscripciones` guarda el valor real usado en cada partido, prellenado desde el default pero editable puntualmente sin pisar el default del perfil.
- **Catálogo**: 4 posiciones clásicas — `arquero`, `defensor`, `mediocampista`, `delantero`.
- **Secundaria obligatoria**: igual que la principal, debe completarse y debe ser distinta de la principal.
- **Visibilidad**: la posición de cada jugador anotado se muestra en el roster (`ListaJugadores`), junto al nombre, tanto en Titulares como en Suplentes.
- **Sin impacto en cupos**: la posición no cambia la asignación de titular/suplente ni ninguna otra regla existente.

## 4. Backend

### Catálogo compartido (`backend/src/constants/posiciones.js`, nuevo)

```js
const POSICIONES = ['arquero', 'defensor', 'mediocampista', 'delantero'];

function sonPosicionesValidas(principal, secundaria) {
  return (
    POSICIONES.includes(principal) &&
    POSICIONES.includes(secundaria) &&
    principal !== secundaria
  );
}

module.exports = { POSICIONES, sonPosicionesValidas };
```

Usado por `usuariosService` (setup de perfil) e `inscripcionesService` (anotarse) para no duplicar la regla de validación.

### Esquema (`schema.sql` + migración en `db.js`)

`Usuarios` gana:
```sql
posicionPrincipal TEXT,
posicionSecundaria TEXT
```

`Inscripciones` gana:
```sql
posicionPrincipal TEXT,
posicionSecundaria TEXT
```

Ambas nullable (sin `NOT NULL`/`CHECK` a nivel SQL, igual que `passwordHash`): la obligatoriedad se controla a nivel aplicación, no en el esquema, para no romper filas históricas. En `db.js`, siguiendo el patrón ya usado para `passwordHash`, se detectan con `PRAGMA table_info` y se agregan con `ALTER TABLE ... ADD COLUMN` si faltan, para ambas tablas.

### `usuariosService.js`

Nueva función `actualizarPosiciones(uid, { posicionPrincipal, posicionSecundaria })`:
1. Valida con `sonPosicionesValidas` → si no, error 400 ("Posiciones inválidas").
2. `UPDATE Usuarios SET posicionPrincipal = ?, posicionSecundaria = ? WHERE uid = ?`.
3. Devuelve el usuario actualizado (mismo shape que `obtenerUsuario`).

`filaAUsuario` no necesita cambios: ya hace spread de todas las columnas de la fila, así que `posicionPrincipal`/`posicionSecundaria` viajan solas en cualquier respuesta de usuario (`/auth/sync`, `/auth/login`, etc.).

### `usuariosController.js` + `usuariosRoutes.js`

Nuevo handler `actualizarMisPosiciones(req, res)`:
```js
async function actualizarMisPosiciones(req, res) {
  const usuario = await usuariosService.actualizarPosiciones(req.usuario.uid, req.body);
  res.json(usuario);
}
```
Nueva ruta:
```
PATCH /api/usuarios/me/posiciones
```
Protegida solo con `verificarToken` (cualquier usuario autenticado sobre sí mismo, no requiere `verificarAdmin`).

### `inscripcionesService.js`

`anotarse(partidoId, usuarioId, { posicionPrincipal, posicionSecundaria })`:
- Se agrega la validación con `sonPosicionesValidas` al principio (antes de tocar sanción/cupos) → error 400 si inválidas.
- El resto de la lógica (sanción, partido abierto, inscripción activa, cupos) no cambia.
- `nuevaInscripcion` incluye `posicionPrincipal`/`posicionSecundaria` y el `INSERT` los persiste.

`listarActivas` no cambia (sigue trayendo `SELECT *`, que ya incluye las columnas nuevas).

### `inscripcionesController.js`

- `anotarse(req, res)` pasa `req.body` (`{ posicionPrincipal, posicionSecundaria }`) al service.
- `listarPorPartido` agrega ambos campos al objeto que arma por jugador:
```js
return {
  usuarioId: inscripcion.usuarioId,
  nombre: usuario?.nombre || 'Jugador',
  tipo: inscripcion.tipo,
  posicionPrincipal: inscripcion.posicionPrincipal,
  posicionSecundaria: inscripcion.posicionSecundaria,
};
```

## 5. Frontend

### Catálogo compartido (`frontend/src/constants/posiciones.js`, nuevo)

```js
export const POSICIONES = [
  { valor: 'arquero', etiqueta: 'Arquero' },
  { valor: 'defensor', etiqueta: 'Defensor' },
  { valor: 'mediocampista', etiqueta: 'Mediocampista' },
  { valor: 'delantero', etiqueta: 'Delantero' },
];

export function etiquetaPosicion(valor) {
  return POSICIONES.find((p) => p.valor === valor)?.etiqueta || 'Sin posición';
}
```

### `ModalPosicion.jsx` (nuevo, reutilizable)

Mismo patrón visual que `ModalConfirmacionSancion.jsx` (overlay fijo `bg-black/70`, tarjeta centrada). Dos `<select>` (principal / secundaria) poblados desde `POSICIONES`.

Props:
- `abierto`, `procesando`
- `posicionPrincipalInicial`, `posicionSecundariaInicial` (prellenan los selects; `null`/`undefined` deja el select en blanco)
- `permitirCancelar` (bool)
- `onConfirmar(posicionPrincipal, posicionSecundaria)`
- `onCancelar` (solo se usa/renderiza si `permitirCancelar`)

El botón de confirmar está deshabilitado mientras no haya ambas posiciones elegidas y sean distintas (mismo mensaje de error inline si coinciden).

### `AuthContext.jsx`

Sin cambios de estructura: `perfil.posicionPrincipal`/`posicionSecundaria` ya viajan solos porque el backend los incluye en la respuesta de `/auth/sync` (ver arriba). Se agrega un método `actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria)` que llama a `PATCH /usuarios/me/posiciones` y hace `setPerfil(data)` con la respuesta (evita depender de `refrescarPerfil` + espera de red extra).

### `Home.jsx`

**Trigger 1 — setup obligatorio post-login:**
Si `perfil` está cargado y `!perfil.posicionPrincipal`, se renderiza `ModalPosicion` con `permitirCancelar={false}`, sin datos iniciales, por encima de todo el contenido de Home (Home queda no interactuable detrás, mismo z-index/overlay que ya usa `ModalConfirmacionSancion`). Al confirmar, llama a `actualizarPosicionesPerfil`; el modal se cierra solo porque `perfil.posicionPrincipal` deja de ser falsy.

**Trigger 2 — confirmación al anotarse:**
- Nuevo estado `partidoParaAnotarse` (id del partido cuyo modal de posición está abierto).
- El `onAnotarse` que se le pasa a `TarjetaPartido` ya no llama a la API directo: hace `setPartidoParaAnotarse(partido.id)`.
- Se agrega un `ModalPosicion` con `permitirCancelar={true}`, `posicionPrincipalInicial={perfil?.posicionPrincipal}`, `posicionSecundariaInicial={perfil?.posicionSecundaria}`.
- Al confirmar: llama a `POST /partidos/:id/anotarse` con `{ posicionPrincipal, posicionSecundaria }` (la función `anotarse` existente se extiende para aceptar estos dos parámetros y mandarlos en el body), luego `cargarPartidos()`, luego cierra el modal.
- Al cancelar: solo cierra el modal, no pega a la API (igual que ya pasa con la baja).

### `ListaJugadores.jsx`

Cada `<li>` de titulares y suplentes agrega, debajo o al lado del nombre, un texto secundario con la posición: `{etiquetaPosicion(jugador.posicionPrincipal)}` y, más chico, la secundaria. Si `posicionPrincipal` es `null` (fila histórica pre-feature), `etiquetaPosicion` ya devuelve "Sin posición".

## 6. No incluido (fuera de alcance)

- Pantalla dedicada para editar el default de posición del perfil fuera del flujo de anotarse.
- Historial de cambios de posición.
- Cualquier efecto de la posición sobre cupos, armado de equipos o algoritmos de asignación.
- Tests automatizados (por preferencia ya establecida del usuario para este proyecto).
