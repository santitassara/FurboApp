# Resultados de Partido — Diseño

## 1. Contexto y objetivo

Hoy un partido queda en estado `abierto` hasta que un admin lo elimina manualmente. No existe cierre automático ni registro de lo que pasó durante el partido (marcador, goles, rendimiento, sanciones en cancha, jugador destacado).

Este diseño agrega:
1. Cierre automático del partido cuando se cumple su fecha (`abierto` → `cerrado`).
2. Carga de resultados por parte del admin (`cerrado` → `jugado`).
3. En el inicio (Home), mientras el partido está `cerrado` sin resultado, la caja de tarjeta+cancha se muestra blureada con el texto "Esperando resultados". Una vez cargado el resultado, se muestra el resultado en su lugar.

## 2. Modelo de datos

`Partidos.estado` ya soporta `'abierto' | 'cerrado' | 'jugado'` (sin cambios en el schema de esa tabla).

Tablas nuevas (`backend/src/db/schema.sql`, con `ALTER TABLE`-guard en `db.js` si hiciera falta migrar en caliente igual que el resto de columnas del proyecto):

```sql
CREATE TABLE IF NOT EXISTS Resultados (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL UNIQUE REFERENCES Partidos(id),
  jugadorDestacadoId TEXT REFERENCES Usuarios(uid),
  fechaCarga TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Goles (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  asistenciaUsuarioId TEXT REFERENCES Usuarios(uid),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  minuto INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS RendimientosJugador (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  puntaje INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS SancionesPartido (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  motivo TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goles_partido ON Goles (partidoId);
CREATE INDEX IF NOT EXISTS idx_rendimientos_partido ON RendimientosJugador (partidoId);
CREATE INDEX IF NOT EXISTS idx_sanciones_partido_partido ON SancionesPartido (partidoId);
```

Decisiones de modelado:
- El marcador (goles por equipo) **no se guarda**; se deriva contando filas de `Goles` agrupadas por `equipo`. Evita inconsistencia entre marcador guardado y goles cargados.
- `SancionesPartido` es puramente informativa: **no** toca `Usuarios.estaSancionado`. Es un registro histórico del partido (ej. tarjeta roja), separado del mecanismo de sanción por baja/inasistencia que ya existe.
- `RendimientosJugador.puntaje`: entero 1-10, sin comentario libre.
- `Resultados.jugadorDestacadoId`: un solo jugador, nullable (el admin puede no elegir ninguno).
- Borrado de un partido (`eliminarPartido`) debe también borrar sus filas en estas 4 tablas nuevas, igual que ya hace con `Inscripciones`.

## 3. Elegibilidad de jugadores

Un jugador es elegible para goles/asistencias/rendimiento/sanción/destacado de un partido si:
```sql
SELECT usuarioId FROM Inscripciones
WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL
```
Es decir: titulares con formación guardada (tienen `equipo` asignado). Si el admin no guardó la formación, no hay elegibles y la carga de resultado se rechaza con 400 ("Debés guardar la formación antes de cargar el resultado").

## 4. Cierre automático (abierto → cerrado)

Mecanismo: **cron / interval** en el backend (no lazy-on-read), corriendo en `backend/server.js`.

```js
const INTERVALO_CIERRE_MS = 60_000;
partidosService.cerrarPartidosVencidos(); // al arrancar
setInterval(() => partidosService.cerrarPartidosVencidos(), INTERVALO_CIERRE_MS);
```

Nueva función en `partidosService.js`:
```js
function cerrarPartidosVencidos() {
  db.prepare(
    "UPDATE Partidos SET estado = 'cerrado' WHERE estado = 'abierto' AND fecha <= ?"
  ).run(new Date().toISOString());
}
```
Síncrona (better-sqlite3 es síncrona), sin necesidad de manejo de errores especial más allá de que una excepción no debe tirar abajo el proceso — se envuelve en try/catch dentro del interval callback y se loguea.

## 5. Visibilidad de partidos (GET /api/partidos)

Cambia de "solo abiertos" a "abiertos + el cerrado/jugado más reciente" (si existe). Nueva función reemplaza `listarPartidosAbiertos`:

```js
function listarPartidosVisibles() {
  const abiertos = db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto'").all();
  const ultimoNoAbierto = db
    .prepare("SELECT * FROM Partidos WHERE estado IN ('cerrado','jugado') ORDER BY fecha DESC LIMIT 1")
    .get();
  return ultimoNoAbierto ? [...abiertos, ultimoNoAbierto] : abiertos;
}
```
El controller (`partidosController.listar`) sigue igual (agrega `ocupados` por partido con `inscripcionesService.contarOcupados`), solo cambia la fuente de partidos.

## 6. API de resultados

Nuevas rutas en `partidosRoutes.js`:
```
GET /api/partidos/:partidoId/resultado        (cualquier usuario autenticado)
PUT /api/partidos/:partidoId/resultado         (solo admin)
```

### GET resultado
- Si no existe fila en `Resultados` para el partido → `200` con `null` (aún no cargado; el frontend interpreta esto junto con `partido.estado` para decidir "esperando resultados").
- Si existe → arma y devuelve:
```json
{
  "marcador": { "A": 3, "B": 2 },
  "goles": [
    { "usuarioId": "...", "nombre": "...", "equipo": "A", "minuto": 12,
      "asistenciaUsuarioId": "...", "asistenciaNombre": "..." }
  ],
  "rendimientos": [{ "usuarioId": "...", "nombre": "...", "puntaje": 8 }],
  "sanciones": [{ "usuarioId": "...", "nombre": "...", "motivo": "Tarjeta roja" }],
  "jugadorDestacado": { "usuarioId": "...", "nombre": "..." } | null,
  "fechaCarga": "..."
}
```
Goles ordenados por `minuto` ascendente.

### PUT resultado (solo admin)
Body:
```json
{
  "goles": [{ "usuarioId": "...", "equipo": "A", "minuto": 12, "asistenciaUsuarioId": "..." | null }],
  "rendimientos": [{ "usuarioId": "...", "puntaje": 8 }],
  "sanciones": [{ "usuarioId": "...", "motivo": "Tarjeta roja" }],
  "jugadorDestacadoId": "..." | null
}
```

Validaciones (`resultadosService.guardarResultado`):
- Partido debe existir y estado debe ser `'cerrado'` o `'jugado'` (permite recargar/corregir un resultado ya cargado; rechaza mientras está `'abierto'` con 400).
- Debe haber al menos un elegible (formación guardada) — si no, 400.
- Cada `usuarioId`/`asistenciaUsuarioId`/`jugadorDestacadoId` referenciado debe pertenecer al conjunto de elegibles (400 si no).
- `equipo` ∈ {'A','B'}; `minuto` entero ≥ 0; `puntaje` entero 1-10.
- `asistenciaUsuarioId` no puede ser igual al `usuarioId` del mismo gol (un jugador no se asiste a sí mismo).

Efecto (transacción):
1. Borra filas previas de `Goles`, `RendimientosJugador`, `SancionesPartido`, `Resultados` para el partido.
2. Inserta las nuevas.
3. Inserta/actualiza fila en `Resultados` (`jugadorDestacadoId`, `fechaCarga = now`).
4. `UPDATE Partidos SET estado = 'jugado' WHERE id = ?`.

Devuelve el mismo shape que el GET.

## 7. Frontend

### Home (`pages/Home.jsx`)
- `cargarPartidos` sigue pidiendo `/partidos` (ahora puede traer un partido no-abierto al final) y sus inscripciones/formación como hoy.
- Para el partido cuyo `estado !== 'abierto'`, además pedir `GET /partidos/:id/resultado`.
- Nuevo componente `PartidoConEstado` envuelve la caja actual (tarjeta + `MapaCancha`, cuando corresponde) y decide:
  - `estado === 'abierto'` → renderiza igual que hoy.
  - `estado === 'cerrado'` → renderiza la misma caja con `filter: blur(...)` + overlay centrado "Esperando resultados" (el admin es quien debe cargarlos).
  - `estado === 'jugado'` → en vez de tarjeta+cancha, renderiza `ResultadoPartido` con los datos de `/resultado`.

### `components/ResultadoPartido.jsx` (nuevo)
Muestra: marcador grande (A vs B), línea de tiempo de goles (minuto, autor, equipo, asistencia si hay), tabla de rendimiento por jugador, jugador destacado resaltado, lista de sanciones informativas (si hay).

### AdminPanel (`pages/AdminPanel.jsx`)
- Nueva sección "Cargar resultado": lista partidos en estado `cerrado` (y los `jugado` para poder corregir), con botón que abre `ModalCargarResultado`.

### `components/ModalCargarResultado.jsx` (nuevo)
Formulario sobre la lista de elegibles (`GET /partidos/:id/inscripciones` filtrado a titulares con `equipo`, o se agrega ese filtro en el propio modal):
- Filas de gol dinámicas (agregar/quitar): select jugador (autor), equipo se autocompleta según el jugador, minuto (number), select asistencia (opcional, excluye al autor).
- Tabla de rendimiento: un input puntaje (1-10) por elegible.
- Filas de sanción dinámicas: select jugador + texto motivo.
- Select único de jugador destacado (opcional).
- Al confirmar: `PUT /partidos/:id/resultado`.

## 8. Manejo de errores

- Backend: mismos patrones existentes (`crearError(mensaje, status)`, 400/403/404), capturado por `manejadorErrores` vía `envolverAsync`.
- Cron de cierre: try/catch alrededor de `cerrarPartidosVencidos()` en el `setInterval`, logueando el error sin tirar el proceso.
- Frontend: mismo patrón de `setError(err.message)` que ya usan `Home` y `AdminPanel`.

## 9. Testing

- `backend/tests/services/partidosService.test.js`: agregar casos para `cerrarPartidosVencidos` (cierra vencidos, no toca futuros ni ya cerrados/jugados) y `listarPartidosVisibles` (abiertos + último no-abierto).
- Nuevo `backend/tests/services/resultadosService.test.js`: validaciones (estado inválido, sin elegibles, usuario no elegible, puntaje fuera de rango, autor=asistencia), transacción de reemplazo (recargar resultado borra lo previo), transición a `'jugado'`.
- Sin tests de frontend (no hay suite frontend en el repo hoy).
