# Votación de Valoraciones y MVP — Diseño

## 1. Contexto y objetivo

Hoy (`docs/superpowers/specs/2026-08-15-resultados-partido-design.md`) el admin carga, en un solo formulario (`ModalCargarResultado` → `PUT /partidos/:id/resultado`), goles, sanciones, **rendimiento (puntaje 1-10) de cada jugador** y **jugador destacado (MVP)**. Ese guardado reemplaza (borra e inserta) todas las filas de golpe.

Este diseño cambia quién define rendimiento y MVP: en vez de un solo valor puesto por el admin, **cada jugador elegible vota** a los demás elegibles (puntaje 1-10 por jugador + un MVP), y el resumen muestra el **promedio** de los puntajes y el/los jugador(es) con más votos MVP. El admin deja de cargar rendimiento y MVP; solo conserva goles y sanciones.

## 2. Elegibilidad (sin cambios)

Se reutiliza la definición existente (`resultadosService.obtenerElegibles`): titulares con `equipo` asignado en la formación guardada del partido. Es el mismo pool que vota y que puede ser votado.

Reglas de elegibilidad para votar:
- El votante debe estar en el pool de elegibles del partido.
- El partido debe estar en estado `'jugado'` (el admin ya cargó goles/sanciones).
- Un jugador no puede votarse a sí mismo (ni puntaje ni MVP): se excluye del listado de objetivos.

## 3. Modelo de datos

`RendimientosJugador` pasa de "un valor por jugador" a "un voto por votante hacia un jugador":

```sql
-- ALTER TABLE en caliente (mismo patrón que el resto de columnas en db.js):
ALTER TABLE RendimientosJugador RENAME COLUMN usuarioId TO jugadorId;
ALTER TABLE RendimientosJugador ADD COLUMN votanteId TEXT REFERENCES Usuarios(uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico
  ON RendimientosJugador (partidoId, jugadorId, votanteId);
```

Nueva tabla para el voto de MVP (independiente del puntaje, un voto por votante y partido):

```sql
CREATE TABLE IF NOT EXISTS VotosMvp (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  votanteId TEXT NOT NULL REFERENCES Usuarios(uid),
  jugadorId TEXT NOT NULL REFERENCES Usuarios(uid)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_mvp_unico ON VotosMvp (partidoId, votanteId);
CREATE INDEX IF NOT EXISTS idx_votos_mvp_partido ON VotosMvp (partidoId);
```

Decisiones de modelado:
- `Resultados.jugadorDestacadoId` **deja de escribirse**. Se mantiene la columna (nullable, no rompe nada) pero el MVP mostrado en el resumen se calcula on-the-fly desde `VotosMvp`, no se persiste. Evita una migración de drop column sobre una tabla con FK.
- Sin límite de tiempo para votar: mientras el partido siga `'jugado'`, cualquier elegible puede votar o re-votar.
- Re-votar es un **upsert**: mismo `(partidoId, jugadorId, votanteId)` en `RendimientosJugador` reemplaza el puntaje anterior; mismo `(partidoId, votanteId)` en `VotosMvp` reemplaza el MVP elegido anteriormente.
- Borrado de partido (`resultadosService.eliminarPorPartido`) agrega borrado de `VotosMvp` junto a las tablas que ya limpia.

## 4. API

### Admin: `PUT /api/partidos/:partidoId/resultado` (sin cambios de auth, cambia el body)

Pierde `rendimientos` y `jugadorDestacadoId`. Queda:
```json
{
  "goles": [{ "usuarioId": "...", "equipo": "A", "minuto": 12, "asistenciaUsuarioId": "..." | null }],
  "sanciones": [{ "usuarioId": "...", "motivo": "Tarjeta roja" }]
}
```
Mismas validaciones de elegibilidad/rango que hoy para goles y sanciones. Sigue disparando `estado = 'jugado'`.

### Nuevo: `POST /api/partidos/:partidoId/votos` (cualquier autenticado, self-service — sin `verificarAdmin`, mismo patrón que `anotarse`/`bajarse`)

Body:
```json
{
  "valoraciones": [{ "jugadorId": "...", "puntaje": 8 }],
  "mvpId": "..." | null
}
```

Validaciones (`resultadosService.guardarVotos` o servicio nuevo `votosService`):
- Partido debe existir y `estado === 'jugado'` (400 si no).
- `req.usuario.uid` debe estar en el conjunto de elegibles del partido (403 si no).
- Cada `jugadorId` en `valoraciones` y el `mvpId` (si no es null) deben estar en elegibles y ser distintos del votante (400 si no).
- `puntaje` entero 1-10.
- No es necesario votar a todos los elegibles en un mismo submit ni votar MVP — cada `valoracion` y el `mvpId` se upsertean independientemente; el jugador puede completar su voto en más de un envío.

Efecto (transacción): upsert de cada fila de `valoraciones` en `RendimientosJugador` (por `votanteId+jugadorId`) y upsert de `mvpId` en `VotosMvp` (por `votanteId`) si viene informado.

### Nuevo: `GET /api/partidos/:partidoId/votos/mios` (autenticado)

Devuelve los votos ya emitidos por `req.usuario.uid` en ese partido, para precargar el formulario:
```json
{ "valoraciones": [{ "jugadorId": "...", "puntaje": 8 }], "mvpId": "..." | null }
```

### `GET /api/partidos/:partidoId/resultado` (sin cambios de auth)

`rendimientos` y `jugadorDestacado` cambian de shape:
```json
{
  "marcador": { "A": 3, "B": 2 },
  "goles": [ ... ],
  "rendimientos": [
    { "usuarioId": "...", "nombre": "...", "promedio": 7.5, "votos": 4 }
  ],
  "sanciones": [ ... ],
  "jugadorDestacado": {
    "jugadores": [{ "usuarioId": "...", "nombre": "..." }],
    "votos": 3,
    "totalElegibles": 10
  },
  "fechaCarga": "..."
}
```
- `promedio`: `AVG(puntaje)` de `RendimientosJugador` por `jugadorId`, redondeado a 1 decimal. Si un jugador no recibió votos → `promedio: null, votos: 0` (frontend lo muestra como "sin votos").
- `jugadorDestacado.jugadores`: todos los que empatan en máximo de votos en `VotosMvp`. Si nadie votó MVP todavía → `{ jugadores: [], votos: 0, totalElegibles: N }`.

## 5. Frontend

### `components/ModalCargarResultado.jsx`
Se elimina la sección de rendimiento por jugador (input 1-10) y el select de jugador destacado. Queda solo goles + sanciones.

### Nuevo `components/ModalVotarValoraciones.jsx`
- Se abre desde `ItemHistorialPartido.jsx` con un botón "Calificar jugadores", visible solo si el usuario actual está en los elegibles del partido y el partido está `jugado`.
- Al abrir: `GET /votos/mios` para precargar; si ya votó a alguien, se ve su puntaje actual (edita, no empieza de cero).
- Lista los elegibles menos el usuario actual: input/slider 1-10 por jugador + un único selector (radio) de MVP entre esos mismos jugadores.
- Confirmar → `POST /votos`. Puede guardar parcial (no obliga a completar todos antes de poder enviar).

### `components/ResultadoPartido.jsx`
- Panel de rendimiento: muestra `promedio` (o "Sin votos" si `votos === 0`) y `(N votos)` junto a la barra existente.
- Jugador destacado: si `jugadorDestacado.jugadores.length > 1`, muestra el trofeo/badge repetido para cada uno (empate); si `0`, no muestra sección de destacado.

### `components/ItemHistorialPartido.jsx`
Agrega el botón que abre `ModalVotarValoraciones`, condicionado a elegibilidad del usuario actual (nuevo campo o endpoint liviano que informe si el usuario logueado es elegible en ese partido — se resuelve reutilizando la lista de elegibles ya expuesta o agregando `soyElegible: boolean` a la respuesta de `/resultado`).

## 6. Manejo de errores

Mismos patrones existentes: `crearError(mensaje, status)` + `envolverAsync` + `manejadorErrores`. Frontend: mismo patrón `setError(err.message)`.

## 7. Testing

- `backend/tests/services/resultadosService.test.js`: ajustar casos existentes de `guardarResultado` que ya no incluyen `rendimientos`/`jugadorDestacadoId`.
- Nuevo `backend/tests/services/votosService.test.js`:
  - Rechaza voto si partido no está `jugado`.
  - Rechaza voto si votante no es elegible (403).
  - Rechaza `jugadorId`/`mvpId` no elegible o igual al votante (400).
  - Rechaza `puntaje` fuera de 1-10.
  - Re-enviar el mismo `(votante, jugador)` reemplaza el puntaje anterior (upsert), no duplica filas.
  - Promedio correcto con múltiples votantes; jugador sin votos → `promedio: null, votos: 0`.
  - Empate de MVP devuelve todos los empatados.
- Sin tests de frontend (no hay suite frontend en el repo hoy).
