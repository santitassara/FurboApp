# Sanción manual por admin — Diseño

Fecha: 2026-08-10

## 1. Contexto y objetivo

FurboApp ya sanciona automáticamente a un titular que se da de baja de un partido (`estaSancionado: true`), y el admin ya puede revocar esa sanción con "Perdonar" (`POST /api/usuarios/:uid/perdonar`).

Falta cubrir el caso en que un jugador titular no puede darse de baja por sí mismo (por el motivo que sea) y sigue apareciendo anotado. El admin necesita poder sancionarlo manualmente desde el listado de jugadores de un partido, logrando el mismo resultado que si el jugador se hubiera bajado solo: pierde su lugar en el partido y queda sancionado.

## 2. Alcance de esta spec

Solo la acción de sanción manual por admin sobre un titular anotado en un partido puntual. No incluye historial de sanciones, motivos/razones de sanción, ni cambios al flujo de "Perdonar" (que ya cubre la revocación).

## 3. Decisiones clave (resueltas en brainstorming)

- **Efecto sobre la inscripción**: sancionar manualmente da de baja al jugador del partido (`estado: "dado_de_baja"`) **y** setea `estaSancionado: true`. Mismo resultado final que una baja normal de un titular.
- **Alcance del botón**: solo disponible para **titulares** anotados, igual que la regla de sanción automática (los suplentes que se bajan nunca se sancionan). No se muestra para suplentes.
- **Confirmación**: se agrega un modal de confirmación nuevo y específico para esta acción (no se reutiliza/generaliza `ModalConfirmacionSancion`, que queda intacto para el flujo de autobaja del jugador).
- **Reutilización del flujo existente**: no se reutiliza `bajarse` (esa ruta es para que el propio jugador se baje); se agrega una función de servicio nueva, admin-only, con su propia ruta.

## 4. Backend

### Servicio (`inscripcionesService.js`)

Nueva función `sancionarManualmente(partidoId, usuarioId)`:

1. Busca la inscripción activa con `obtenerInscripcionActiva(partidoId, usuarioId)`. Si no existe → error 404 ("El jugador no está anotado en este partido").
2. Si `inscripcion.tipo !== 'titular'` → error 400 ("Solo se puede sancionar a jugadores titulares").
3. Actualiza la inscripción: `estado: 'dado_de_baja'`.
4. Llama a `usuariosService.sancionar(usuarioId)`.
5. Devuelve `{ ...inscripcion, estado: 'dado_de_baja' }` (mismo shape que devuelve `bajarse`).

### Controller (`inscripcionesController.js`)

Nuevo handler `sancionarManualmente(req, res)`:
```js
async function sancionarManualmente(req, res) {
  const inscripcion = await inscripcionesService.sancionarManualmente(req.params.partidoId, req.params.usuarioId);
  res.json(inscripcion);
}
```

### Ruta (`partidosRoutes.js`)

```
POST /api/partidos/:partidoId/sancionar/:usuarioId
```
Protegida con `verificarToken` + `verificarAdmin` (mismo patrón que `promover`).

### Tests (`inscripcionesService.test.js`)

Casos nuevos bajo `describe('inscripcionesService.sancionarManualmente')`, siguiendo el estilo de los tests existentes de `bajarse`/`promover`:
- Rechaza con 404 si no hay inscripción activa.
- Rechaza con 400 si el jugador es suplente.
- Da de baja la inscripción y llama a `usuariosService.sancionar` si el jugador es titular.

## 5. Frontend

### `ListaJugadores.jsx`

Nueva prop opcional `onSancionar`. En la lista de titulares, si la prop está presente, se agrega un botón "Sancionar" (variante `peligro`) junto al nombre de cada titular — simétrico al botón "Promover" que ya tienen los suplentes.

### `ModalConfirmacionSancionAdmin.jsx` (nuevo componente)

Modal de confirmación, mismo patrón visual que `ModalConfirmacionSancion.jsx`:
- Título: "¿Seguro que querés sancionar a {nombre}?"
- Mensaje: explica que quedará dado de baja del partido y sancionado hasta que un admin lo perdone.
- Botones: "Cancelar" (ghost) / "Sí, sancionar" (peligro), con estado `procesando`.

### `AdminPanel.jsx`

- Nuevo estado para el jugador seleccionado a sancionar (partidoId, usuarioId, nombre).
- Nueva función `sancionar(partidoId, usuarioId)`: llama a `POST /partidos/:partidoId/sancionar/:usuarioId`, recarga todo con `cargarTodo()`, maneja error/mensaje/loading igual que `perdonar` y `promover`.
- Al hacer clic en "Sancionar" desde `ListaJugadores`, se abre `ModalConfirmacionSancionAdmin`; al confirmar, se ejecuta `sancionar`.
- Se pasa `onSancionar` a cada `ListaJugadores` renderizada en el panel.

## 6. No incluido (fuera de alcance)

- Historial o motivo de sanciones.
- Cambios al botón "Perdonar" existente.
- Sanción manual de suplentes.
- Tests de frontend (el proyecto no los tiene en esta etapa, según la spec original).
