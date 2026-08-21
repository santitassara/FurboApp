# Resultados de Partido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar automáticamente los partidos al cumplirse su fecha, permitir que el admin cargue el resultado (marcador derivado de goles, asistencias, rendimiento, sanciones en cancha, jugador destacado), y mostrar en el inicio la caja del partido blureada con "Esperando resultados" hasta que el admin cargue el resultado.

**Architecture:** 3 tablas nuevas (`Goles`, `RendimientosJugador`, `SancionesPartido`) más `Resultados` (una fila por partido con el jugador destacado y fecha de carga); el marcador se deriva contando `Goles`, no se guarda. Un cron de 60s en `server.js` cierra partidos vencidos (`abierto` → `cerrado`). El admin carga el resultado vía `PUT /partidos/:id/resultado`, lo que pasa el partido a `jugado`. El frontend decide qué mostrar según `partido.estado`: `abierto` = como hoy, `cerrado` = caja blureada, `jugado` = componente de resultado.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React/Tailwind (frontend), Jest (tests backend, sin suite de tests en frontend).

**Spec:** `docs/superpowers/specs/2026-08-15-resultados-partido-design.md`

## Global Constraints

- Elegibles para goles/asistencia/rendimiento/sanción/destacado = titulares con `equipo` asignado en `Inscripciones` (formación guardada). Sin elegibles, la carga de resultado rechaza con 400.
- El marcador **no se guarda**; se deriva contando `Goles` agrupados por `equipo`.
- `SancionesPartido` es solo informativa: nunca toca `Usuarios.estaSancionado`.
- `RendimientosJugador.puntaje` es un entero 1-10, sin comentario libre.
- `Resultados.jugadorDestacadoId` es un único jugador, nullable.
- Auto-cierre es un cron (`setInterval`, 60s) en `server.js`, no chequeo perezoso en el GET.
- `GET /api/partidos` devuelve los `abierto` más el `cerrado`/`jugado` más reciente (uno solo), no todo el historial.
- Recargar un resultado (`PUT` de nuevo) reemplaza el anterior por completo (borra e inserta), no acumula.
- Eliminar un partido (`eliminarPartido`) debe borrar también sus filas de `Goles`, `RendimientosJugador`, `SancionesPartido` y `Resultados`.

---

### Task 1: Cierre automático de partidos vencidos

**Files:**
- Modify: `backend/src/services/partidosService.js`
- Modify: `backend/server.js`
- Test: `backend/tests/services/partidosService.test.js`

**Interfaces:**
- Produces: `partidosService.cerrarPartidosVencidos(): void` — usado por `server.js` y por tareas futuras.

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `backend/tests/services/partidosService.test.js`:

```js
describe('partidosService.cerrarPartidosVencidos', () => {
  it('cierra los partidos abiertos cuya fecha ya pasó', async () => {
    const vencido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb.prepare("UPDATE Partidos SET fecha = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(vencido.id);

    partidosService.cerrarPartidosVencidos();

    const actualizado = await partidosService.obtenerPartido(vencido.id);
    expect(actualizado.estado).toBe('cerrado');
  });

  it('no toca partidos abiertos con fecha futura', async () => {
    const futuro = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    partidosService.cerrarPartidosVencidos();

    const actual = await partidosService.obtenerPartido(futuro.id);
    expect(actual.estado).toBe('abierto');
  });

  it('no toca partidos ya cerrados o jugados', async () => {
    const vencido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb
      .prepare("UPDATE Partidos SET fecha = '2020-01-01T00:00:00.000Z', estado = 'jugado' WHERE id = ?")
      .run(vencido.id);

    partidosService.cerrarPartidosVencidos();

    const actual = await partidosService.obtenerPartido(vencido.id);
    expect(actual.estado).toBe('jugado');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/services/partidosService.test.js -t cerrarPartidosVencidos`
Expected: FAIL con `partidosService.cerrarPartidosVencidos is not a function`.

- [ ] **Step 3: Implementar**

En `backend/src/services/partidosService.js`, agregar la función y exportarla:

```js
function cerrarPartidosVencidos() {
  db.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE estado = 'abierto' AND fecha <= ?").run(
    new Date().toISOString()
  );
}
```

Actualizar `module.exports` para incluir `cerrarPartidosVencidos`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/services/partidosService.test.js -t cerrarPartidosVencidos`
Expected: PASS (3 tests).

- [ ] **Step 5: Conectar el cron en `server.js`**

Reemplazar el contenido de `backend/server.js`:

```js
require('dotenv').config();
const app = require('./src/app');
const partidosService = require('./src/services/partidosService');

const PORT = process.env.PORT || 4000;
const INTERVALO_CIERRE_MS = 60_000;

function cerrarPartidosVencidosSeguro() {
  try {
    partidosService.cerrarPartidosVencidos();
  } catch (error) {
    console.error('Error cerrando partidos vencidos:', error);
  }
}

cerrarPartidosVencidosSeguro();
setInterval(cerrarPartidosVencidosSeguro, INTERVALO_CIERRE_MS);

app.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
```

- [ ] **Step 6: Verificar sintaxis**

Run: `cd backend && node -c server.js`
Expected: sin salida (sin errores de sintaxis).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/partidosService.js backend/server.js backend/tests/services/partidosService.test.js
git commit -m "feat(backend): cierre automatico de partidos vencidos via cron"
```

---

### Task 2: Home muestra abiertos + el último cerrado/jugado

**Files:**
- Modify: `backend/src/services/partidosService.js`
- Modify: `backend/src/controllers/partidosController.js`
- Test: `backend/tests/services/partidosService.test.js`

**Interfaces:**
- Consumes: nada nuevo (usa `db` ya importado en el archivo).
- Produces: `partidosService.listarPartidosVisibles(): Partido[]` — reemplaza a `listarPartidosAbiertos`; usado por `partidosController.listar`.

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/services/partidosService.test.js`, **reemplazar** el bloque `describe('partidosService.listarPartidosAbiertos', ...)` completo por:

```js
describe('partidosService.listarPartidosVisibles', () => {
  it('devuelve los partidos abiertos cuando no hay ningún cerrado ni jugado', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    const partidos = await partidosService.listarPartidosVisibles();

    expect(partidos).toEqual([abierto]);
  });

  it('agrega el partido cerrado o jugado más reciente al final', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-03-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    const viejoJugado = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    const recienCerrado = await partidosService.crearPartido({
      fecha: '2099-02-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(viejoJugado.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(recienCerrado.id);

    const partidos = await partidosService.listarPartidosVisibles();

    expect(partidos.map((p) => p.id)).toEqual([abierto.id, recienCerrado.id]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/services/partidosService.test.js -t listarPartidosVisibles`
Expected: FAIL con `partidosService.listarPartidosVisibles is not a function`.

- [ ] **Step 3: Implementar**

En `backend/src/services/partidosService.js`, reemplazar `listarPartidosAbiertos` por:

```js
function listarPartidosVisibles() {
  const abiertos = db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto'").all();
  const ultimoNoAbierto = db
    .prepare("SELECT * FROM Partidos WHERE estado IN ('cerrado','jugado') ORDER BY fecha DESC LIMIT 1")
    .get();
  return ultimoNoAbierto ? [...abiertos, ultimoNoAbierto] : abiertos;
}
```

Actualizar `module.exports` (quitar `listarPartidosAbiertos`, agregar `listarPartidosVisibles`).

En `backend/src/controllers/partidosController.js`, cambiar la función `listar`:

```js
async function listar(req, res) {
  const partidos = await partidosService.listarPartidosVisibles();
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
    }))
  );
  res.json(partidosConCupos);
}
```

- [ ] **Step 4: Correr todos los tests del archivo y verificar que pasan**

Run: `cd backend && npx jest tests/services/partidosService.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/partidosService.js backend/src/controllers/partidosController.js backend/tests/services/partidosService.test.js
git commit -m "feat(backend): listar partidos abiertos junto al ultimo cerrado o jugado"
```

---

### Task 3: `resultadosService.obtenerElegibles`

**Files:**
- Create: `backend/src/services/resultadosService.js`
- Test: `backend/tests/services/resultadosService.test.js`

**Interfaces:**
- Consumes: tabla `Inscripciones` (columnas `usuarioId`, `estado`, `tipo`, `equipo` ya existentes).
- Produces: `resultadosService.obtenerElegibles(partidoId: string): Promise<string[]>` — array de `usuarioId`. Usado por `guardarResultado` (Task 4).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/services/resultadosService.test.js`:

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');

async function crearUsuario(overrides = {}) {
  return usuariosService.sincronizarUsuario({
    uid: 'u1',
    email: 'u1@gmail.com',
    nombre: 'Usuario Uno',
    ...overrides,
  });
}

async function crearPartido(overrides = {}) {
  const admin = await crearUsuario({ uid: 'admin-1', email: 'admin@gmail.com' });
  return partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 1,
    creadoPor: admin.uid,
    ...overrides,
  });
}

function insertarInscripcion({ id, partidoId, usuarioId, tipo = 'titular', equipo = null }) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
       VALUES (@id, @partidoId, @usuarioId, 'anotado', @tipo, 0, '2026-01-01T00:00:00.000Z', @equipo)`
    )
    .run({ id, partidoId, usuarioId, tipo, equipo });
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
});

describe('resultadosService.obtenerElegibles', () => {
  it('devuelve solo titulares con equipo asignado', async () => {
    const partido = await crearPartido();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await crearUsuario({ uid: 'u3', email: 'u3@gmail.com' });
    insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });
    insertarInscripcion({ id: 'i2', partidoId: partido.id, usuarioId: 'u2', tipo: 'titular', equipo: null });
    insertarInscripcion({ id: 'i3', partidoId: partido.id, usuarioId: 'u3', tipo: 'suplente', equipo: null });

    const elegibles = await resultadosService.obtenerElegibles(partido.id);

    expect(elegibles).toEqual(['u1']);
  });

  it('devuelve arreglo vacío si nadie tiene equipo asignado', async () => {
    const partido = await crearPartido();

    const elegibles = await resultadosService.obtenerElegibles(partido.id);

    expect(elegibles).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/services/resultadosService.test.js`
Expected: FAIL con `Cannot find module '../../src/services/resultadosService'`.

- [ ] **Step 3: Implementar**

Crear `backend/src/services/resultadosService.js`:

```js
const { db } = require('../config/db');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerElegibles(partidoId) {
  const filas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL`
    )
    .all(partidoId);
  return filas.map((fila) => fila.usuarioId);
}

module.exports = { obtenerElegibles };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/services/resultadosService.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/resultadosService.js backend/tests/services/resultadosService.test.js
git commit -m "feat(backend): calcular jugadores elegibles para el resultado de un partido"
```

---

### Task 4: Tablas de resultado + `guardarResultado` + `obtenerResultado`

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/services/resultadosService.js`
- Test: `backend/tests/services/resultadosService.test.js`

**Interfaces:**
- Consumes: `partidosService.obtenerPartido(id)` (existente), `resultadosService.obtenerElegibles(id)` (Task 3), `usuariosService.obtenerUsuario(uid)` (existente).
- Produces:
  - `resultadosService.guardarResultado(partidoId: string, payload: { goles?: Array<{usuarioId, equipo, minuto, asistenciaUsuarioId?}>, rendimientos?: Array<{usuarioId, puntaje}>, sanciones?: Array<{usuarioId, motivo}>, jugadorDestacadoId?: string|null }): Promise<Resultado>`
  - `resultadosService.obtenerResultado(partidoId: string): Promise<Resultado|null>` donde `Resultado = { marcador: {A, B}, goles: [...], rendimientos: [...], sanciones: [...], jugadorDestacado: {usuarioId, nombre}|null, fechaCarga }`
  - Ambas usadas por `resultadosController` (Task 6) y por la UI.

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/tests/services/resultadosService.test.js`, reemplazar el `beforeEach` existente por:

```js
beforeEach(() => {
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
});
```

Agregar debajo de `insertarInscripcion` (antes del primer `describe`):

```js
async function crearPartidoConElegibles() {
  const partido = await crearPartido();
  await crearUsuario({ uid: 'u1', email: 'u1@gmail.com', nombre: 'Jugador Uno' });
  await crearUsuario({ uid: 'u2', email: 'u2@gmail.com', nombre: 'Jugador Dos' });
  insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });
  insertarInscripcion({ id: 'i2', partidoId: partido.id, usuarioId: 'u2', tipo: 'titular', equipo: 'B' });
  return partido;
}
```

Agregar al final del archivo:

```js
describe('resultadosService.guardarResultado', () => {
  it('rechaza con 400 si el partido está abierto', async () => {
    const partido = await crearPartidoConElegibles();

    await expect(resultadosService.guardarResultado(partido.id, {})).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si no hay elegibles (formación no guardada)', async () => {
    const partido = await crearPartido();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(resultadosService.guardarResultado(partido.id, {})).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza un gol de un jugador no elegible', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(
      resultadosService.guardarResultado(partido.id, {
        goles: [{ usuarioId: 'no-elegible', equipo: 'A', minuto: 10 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza un puntaje de rendimiento fuera de rango', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(
      resultadosService.guardarResultado(partido.id, {
        rendimientos: [{ usuarioId: 'u1', puntaje: 11 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza si el autor y la asistencia son el mismo jugador', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(
      resultadosService.guardarResultado(partido.id, {
        goles: [{ usuarioId: 'u1', equipo: 'A', minuto: 5, asistenciaUsuarioId: 'u1' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('guarda el resultado completo y pasa el partido a jugado', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    const resultado = await resultadosService.guardarResultado(partido.id, {
      goles: [
        { usuarioId: 'u1', equipo: 'A', minuto: 10, asistenciaUsuarioId: 'u2' },
        { usuarioId: 'u2', equipo: 'B', minuto: 20 },
      ],
      rendimientos: [
        { usuarioId: 'u1', puntaje: 8 },
        { usuarioId: 'u2', puntaje: 6 },
      ],
      sanciones: [{ usuarioId: 'u2', motivo: 'Tarjeta roja' }],
      jugadorDestacadoId: 'u1',
    });

    expect(resultado.marcador).toEqual({ A: 1, B: 1 });
    expect(resultado.goles).toHaveLength(2);
    expect(resultado.goles[0]).toMatchObject({ usuarioId: 'u1', minuto: 10, asistenciaNombre: 'Jugador Dos' });
    expect(resultado.rendimientos).toEqual(
      expect.arrayContaining([{ usuarioId: 'u1', nombre: 'Jugador Uno', puntaje: 8 }])
    );
    expect(resultado.sanciones).toEqual([{ usuarioId: 'u2', nombre: 'Jugador Dos', motivo: 'Tarjeta roja' }]);
    expect(resultado.jugadorDestacado).toEqual({ usuarioId: 'u1', nombre: 'Jugador Uno' });

    const partidoActualizado = await partidosService.obtenerPartido(partido.id);
    expect(partidoActualizado.estado).toBe('jugado');
  });

  it('al recargar reemplaza el resultado anterior en vez de acumularlo', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await resultadosService.guardarResultado(partido.id, {
      goles: [{ usuarioId: 'u1', equipo: 'A', minuto: 10 }],
    });
    const segundo = await resultadosService.guardarResultado(partido.id, {
      goles: [{ usuarioId: 'u2', equipo: 'B', minuto: 5 }],
    });

    expect(segundo.goles).toHaveLength(1);
    expect(segundo.goles[0]).toMatchObject({ usuarioId: 'u2' });
  });
});

describe('resultadosService.obtenerResultado', () => {
  it('devuelve null si todavía no se cargó', async () => {
    const partido = await crearPartidoConElegibles();

    const resultado = await resultadosService.obtenerResultado(partido.id);

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npx jest tests/services/resultadosService.test.js`
Expected: FAIL — tablas `Goles`/`Resultados`/etc. no existen y `guardarResultado`/`obtenerResultado` no son funciones.

- [ ] **Step 3: Agregar las tablas al schema**

En `backend/src/db/schema.sql`, agregar al final:

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

- [ ] **Step 4: Implementar `guardarResultado` y `obtenerResultado`**

Reemplazar `backend/src/services/resultadosService.js` completo por:

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerElegibles(partidoId) {
  const filas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL`
    )
    .all(partidoId);
  return filas.map((fila) => fila.usuarioId);
}

async function guardarResultado(partidoId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado === 'abierto') throw crearError('El partido todavía no cerró', 400);

  const elegibles = await obtenerElegibles(partidoId);
  if (elegibles.length === 0) {
    throw crearError('Debés guardar la formación antes de cargar el resultado', 400);
  }
  const elegiblesSet = new Set(elegibles);

  const goles = Array.isArray(payload.goles) ? payload.goles : [];
  const rendimientos = Array.isArray(payload.rendimientos) ? payload.rendimientos : [];
  const sanciones = Array.isArray(payload.sanciones) ? payload.sanciones : [];
  const jugadorDestacadoId = payload.jugadorDestacadoId || null;

  for (const gol of goles) {
    if (!elegiblesSet.has(gol.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (gol.equipo !== 'A' && gol.equipo !== 'B') throw crearError('equipo debe ser "A" o "B"', 400);
    if (!Number.isInteger(gol.minuto) || gol.minuto < 0) {
      throw crearError('minuto debe ser un entero mayor o igual a 0', 400);
    }
    if (gol.asistenciaUsuarioId) {
      if (gol.asistenciaUsuarioId === gol.usuarioId) {
        throw crearError('La asistencia no puede ser del mismo jugador que anotó el gol', 400);
      }
      if (!elegiblesSet.has(gol.asistenciaUsuarioId)) {
        throw crearError('Jugador no elegible para el resultado', 400);
      }
    }
  }
  for (const rendimiento of rendimientos) {
    if (!elegiblesSet.has(rendimiento.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (!Number.isInteger(rendimiento.puntaje) || rendimiento.puntaje < 1 || rendimiento.puntaje > 10) {
      throw crearError('puntaje debe ser un entero entre 1 y 10', 400);
    }
  }
  for (const sancion of sanciones) {
    if (!elegiblesSet.has(sancion.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (!sancion.motivo || typeof sancion.motivo !== 'string') {
      throw crearError('motivo es requerido', 400);
    }
  }
  if (jugadorDestacadoId && !elegiblesSet.has(jugadorDestacadoId)) {
    throw crearError('Jugador no elegible para el resultado', 400);
  }

  const guardar = db.transaction(() => {
    db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
    db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
    db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
    db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);

    for (const gol of goles) {
      db.prepare(
        `INSERT INTO Goles (id, partidoId, usuarioId, asistenciaUsuarioId, equipo, minuto)
         VALUES (@id, @partidoId, @usuarioId, @asistenciaUsuarioId, @equipo, @minuto)`
      ).run({
        id: crypto.randomUUID(),
        partidoId,
        usuarioId: gol.usuarioId,
        asistenciaUsuarioId: gol.asistenciaUsuarioId || null,
        equipo: gol.equipo,
        minuto: gol.minuto,
      });
    }
    for (const rendimiento of rendimientos) {
      db.prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, usuarioId, puntaje)
         VALUES (@id, @partidoId, @usuarioId, @puntaje)`
      ).run({ id: crypto.randomUUID(), partidoId, usuarioId: rendimiento.usuarioId, puntaje: rendimiento.puntaje });
    }
    for (const sancion of sanciones) {
      db.prepare(
        `INSERT INTO SancionesPartido (id, partidoId, usuarioId, motivo)
         VALUES (@id, @partidoId, @usuarioId, @motivo)`
      ).run({ id: crypto.randomUUID(), partidoId, usuarioId: sancion.usuarioId, motivo: sancion.motivo });
    }
    db.prepare(
      `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, fechaCarga)
       VALUES (@id, @partidoId, @jugadorDestacadoId, @fechaCarga)`
    ).run({ id: crypto.randomUUID(), partidoId, jugadorDestacadoId, fechaCarga: new Date().toISOString() });
    db.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partidoId);
  });
  guardar();

  return obtenerResultado(partidoId);
}

async function obtenerResultado(partidoId) {
  const resultado = db.prepare('SELECT * FROM Resultados WHERE partidoId = ?').get(partidoId);
  if (!resultado) return null;

  const filasGoles = db.prepare('SELECT * FROM Goles WHERE partidoId = ? ORDER BY minuto ASC').all(partidoId);
  const goles = await Promise.all(
    filasGoles.map(async (gol) => {
      const autor = await usuariosService.obtenerUsuario(gol.usuarioId);
      const asistente = gol.asistenciaUsuarioId
        ? await usuariosService.obtenerUsuario(gol.asistenciaUsuarioId)
        : null;
      return {
        usuarioId: gol.usuarioId,
        nombre: autor?.nombre || 'Jugador',
        equipo: gol.equipo,
        minuto: gol.minuto,
        asistenciaUsuarioId: gol.asistenciaUsuarioId,
        asistenciaNombre: asistente?.nombre || null,
      };
    })
  );

  const marcador = { A: 0, B: 0 };
  for (const gol of filasGoles) marcador[gol.equipo] += 1;

  const filasRendimientos = db.prepare('SELECT * FROM RendimientosJugador WHERE partidoId = ?').all(partidoId);
  const rendimientos = await Promise.all(
    filasRendimientos.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', puntaje: fila.puntaje };
    })
  );

  const filasSanciones = db.prepare('SELECT * FROM SancionesPartido WHERE partidoId = ?').all(partidoId);
  const sanciones = await Promise.all(
    filasSanciones.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', motivo: fila.motivo };
    })
  );

  let jugadorDestacado = null;
  if (resultado.jugadorDestacadoId) {
    const usuario = await usuariosService.obtenerUsuario(resultado.jugadorDestacadoId);
    jugadorDestacado = { usuarioId: resultado.jugadorDestacadoId, nombre: usuario?.nombre || 'Jugador' };
  }

  return { marcador, goles, rendimientos, sanciones, jugadorDestacado, fechaCarga: resultado.fechaCarga };
}

module.exports = { obtenerElegibles, guardarResultado, obtenerResultado };
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest tests/services/resultadosService.test.js`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.sql backend/src/services/resultadosService.js backend/tests/services/resultadosService.test.js
git commit -m "feat(backend): guardar y leer resultados de partido (goles, rendimiento, sanciones, destacado)"
```

---

### Task 5: Borrar resultado al eliminar un partido

**Files:**
- Modify: `backend/src/services/resultadosService.js`
- Modify: `backend/src/services/partidosService.js`
- Test: `backend/tests/services/partidosService.test.js`

**Interfaces:**
- Produces: `resultadosService.eliminarPorPartido(partidoId: string): void` — llamado desde `partidosService.eliminarPartido`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/tests/services/partidosService.test.js`:

```js
describe('partidosService.eliminarPartido', () => {
  it('rechaza con 403 si quien elimina no es el creador', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    await expect(partidosService.eliminarPartido(partido.id, 'otro-admin')).rejects.toMatchObject({ status: 403 });
  });

  it('borra también los goles, rendimientos, sanciones y resultado asociados', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb
      .prepare(
        `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
         VALUES ('i1', ?, 'admin-1', 'anotado', 'titular', 0, '2026-01-01T00:00:00.000Z', 'A')`
      )
      .run(partido.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    const resultadosService = require('../../src/services/resultadosService');
    await resultadosService.guardarResultado(partido.id, {
      goles: [{ usuarioId: 'admin-1', equipo: 'A', minuto: 5 }],
      rendimientos: [{ usuarioId: 'admin-1', puntaje: 7 }],
      sanciones: [{ usuarioId: 'admin-1', motivo: 'Tarjeta amarilla' }],
      jugadorDestacadoId: 'admin-1',
    });

    await partidosService.eliminarPartido(partido.id, 'admin-1');

    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM Goles WHERE partidoId = ?').get(partido.id).n).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM RendimientosJugador WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM SancionesPartido WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM Resultados WHERE partidoId = ?').get(partido.id).n).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/services/partidosService.test.js -t eliminarPartido`
Expected: FAIL en el segundo test — las filas de `Goles`/`RendimientosJugador`/`SancionesPartido`/`Resultados` siguen existiendo tras eliminar.

- [ ] **Step 3: Implementar**

En `backend/src/services/resultadosService.js`, agregar:

```js
function eliminarPorPartido(partidoId) {
  db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);
}
```

Actualizar el `module.exports` de `resultadosService.js` para incluir `eliminarPorPartido`.

En `backend/src/services/partidosService.js`, modificar `eliminarPartido`:

```js
async function eliminarPartido(partidoId, uid) {
  const partido = await obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.creadoPor !== uid) {
    throw crearError('Solo el admin que creó el partido puede eliminarlo', 403);
  }

  const inscripcionesService = require('./inscripcionesService');
  const resultadosService = require('./resultadosService');
  const eliminar = db.transaction(() => {
    resultadosService.eliminarPorPartido(partidoId);
    inscripcionesService.eliminarPorPartido(partidoId);
    db.prepare('DELETE FROM Partidos WHERE id = ?').run(partidoId);
  });
  eliminar();
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest tests/services/partidosService.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/resultadosService.js backend/src/services/partidosService.js backend/tests/services/partidosService.test.js
git commit -m "fix(backend): borrar goles, rendimientos, sanciones y resultado al eliminar un partido"
```

---

### Task 6: Rutas de resultado

**Files:**
- Create: `backend/src/controllers/resultadosController.js`
- Modify: `backend/src/routes/partidosRoutes.js`

**Interfaces:**
- Consumes: `resultadosService.obtenerResultado`, `resultadosService.guardarResultado` (Task 4).
- Produces: `GET /api/partidos/:partidoId/resultado`, `PUT /api/partidos/:partidoId/resultado` — usadas por el frontend (Tasks 8, 9, 10).

- [ ] **Step 1: Crear el controller**

Crear `backend/src/controllers/resultadosController.js`:

```js
const resultadosService = require('../services/resultadosService');

async function obtener(req, res) {
  const resultado = await resultadosService.obtenerResultado(req.params.partidoId);
  res.json(resultado);
}

async function guardar(req, res) {
  const resultado = await resultadosService.guardarResultado(req.params.partidoId, req.body);
  res.json(resultado);
}

module.exports = { obtener, guardar };
```

- [ ] **Step 2: Agregar las rutas**

En `backend/src/routes/partidosRoutes.js`, agregar el require junto a los otros controllers:

```js
const resultadosController = require('../controllers/resultadosController');
```

Y agregar las rutas antes de `module.exports = router;`:

```js
router.get('/:partidoId/resultado', verificarToken, envolverAsync(resultadosController.obtener));
router.put(
  '/:partidoId/resultado',
  verificarToken,
  verificarAdmin,
  envolverAsync(resultadosController.guardar)
);
```

- [ ] **Step 3: Verificar sintaxis y que el resto de los tests siguen pasando**

Run: `cd backend && node -c src/controllers/resultadosController.js && node -c src/routes/partidosRoutes.js && npx jest`
Expected: sin errores de sintaxis, todos los tests de Jest en verde.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/resultadosController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): exponer GET/PUT /partidos/:id/resultado"
```

---

### Task 7: Utilidad de fecha compartida + `ResultadoPartido`

**Files:**
- Create: `frontend/src/utils/fecha.js`
- Modify: `frontend/src/components/TarjetaPartido.jsx`
- Create: `frontend/src/components/ResultadoPartido.jsx`

**Interfaces:**
- Produces: `formatearFechaPartido(fechaISO: string): string`; componente `<ResultadoPartido partido={{fecha}} resultado={{marcador, goles, rendimientos, sanciones, jugadorDestacado, fechaCarga}} />`.

- [ ] **Step 1: Extraer `formatearFecha` a un util compartido**

Crear `frontend/src/utils/fecha.js`:

```js
export function formatearFechaPartido(fechaISO) {
  return new Date(fechaISO).toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

En `frontend/src/components/TarjetaPartido.jsx`, quitar la función local `formatearFecha` y su uso, reemplazando por el import:

```js
import { formatearFechaPartido } from '../utils/fecha';
```

y cambiar `formatearFecha(partido.fecha)` por `formatearFechaPartido(partido.fecha)` en el JSX.

- [ ] **Step 2: Crear `ResultadoPartido`**

Crear `frontend/src/components/ResultadoPartido.jsx`:

```jsx
import { formatearFechaPartido } from '../utils/fecha';

export default function ResultadoPartido({ partido, resultado }) {
  if (!resultado) {
    return (
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        Cargando resultado…
      </div>
    );
  }

  const { marcador, goles, rendimientos, sanciones, jugadorDestacado } = resultado;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-1 text-lg font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</h3>
      <p className="mb-4 text-xs uppercase tracking-wide text-pasto-500">Resultado final</p>

      <div className="mb-5 flex items-center justify-center gap-4 text-4xl font-display font-bold text-white">
        <span>{marcador.A}</span>
        <span className="text-white/40">-</span>
        <span>{marcador.B}</span>
      </div>

      {jugadorDestacado && (
        <p className="mb-4 text-center text-sm">
          <span className="text-white/60">Destacado: </span>
          <span className="font-bold text-pasto-500">{jugadorDestacado.nombre}</span>
        </p>
      )}

      <div className="mb-4">
        <h4 className="mb-2 text-xs font-bold uppercase text-white/40">Goles</h4>
        {goles.length === 0 ? (
          <p className="text-sm text-white/50">Sin goles.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {goles.map((gol, indice) => (
              <li key={indice} className="text-sm text-white/90">
                <span className="font-bold text-white/60">{gol.minuto}&apos;</span>{' '}
                {gol.nombre} <span className="text-white/40">(Equipo {gol.equipo})</span>
                {gol.asistenciaNombre && <span className="text-white/50"> — asistencia de {gol.asistenciaNombre}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4">
        <h4 className="mb-2 text-xs font-bold uppercase text-white/40">Rendimiento</h4>
        {rendimientos.length === 0 ? (
          <p className="text-sm text-white/50">Sin cargar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rendimientos.map((rendimiento) => (
              <li key={rendimiento.usuarioId} className="flex justify-between text-sm text-white/90">
                <span>{rendimiento.nombre}</span>
                <span className="font-bold">{rendimiento.puntaje}/10</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sanciones.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase text-white/40">Sanciones en cancha</h4>
          <ul className="flex flex-col gap-1">
            {sanciones.map((sancion, indice) => (
              <li key={indice} className="text-sm text-sancion">
                {sancion.nombre} — {sancion.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/fecha.js frontend/src/components/TarjetaPartido.jsx frontend/src/components/ResultadoPartido.jsx
git commit -m "feat(frontend): componente ResultadoPartido y util de formato de fecha compartido"
```

---

### Task 8: `PartidoConEstado` + integración en Home

**Files:**
- Create: `frontend/src/components/PartidoConEstado.jsx`
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `ResultadoPartido` (Task 7), `GET /partidos/:id/resultado` (Task 6).
- Produces: componente `<PartidoConEstado partido={partido} resultado={resultado}>{children}</PartidoConEstado>` usado en `Home.jsx`.

- [ ] **Step 1: Crear `PartidoConEstado`**

Crear `frontend/src/components/PartidoConEstado.jsx`:

```jsx
import ResultadoPartido from './ResultadoPartido';

export default function PartidoConEstado({ partido, resultado, children }) {
  if (partido.estado === 'jugado') {
    return <ResultadoPartido partido={partido} resultado={resultado} />;
  }

  if (partido.estado === 'cerrado') {
    return (
      <div className="relative">
        <div className="pointer-events-none blur-sm">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-cancha-900/60">
          <p className="rounded-lg bg-black/70 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">
            Esperando resultados
          </p>
        </div>
      </div>
    );
  }

  return children;
}
```

- [ ] **Step 2: Integrar en `Home.jsx`**

Agregar el import junto a los otros:

```js
import PartidoConEstado from '../components/PartidoConEstado';
```

Agregar estado nuevo junto a `formacionesPorPartido`:

```js
const [resultadosPorPartido, setResultadosPorPartido] = useState({});
```

En `cargarPartidos`, después de armar `entradasFormacion`/`setFormacionesPorPartido`, agregar:

```js
const entradasResultado = await Promise.all(
  partidosAbiertos
    .filter((partido) => partido.estado === 'jugado')
    .map(async (partido) => {
      const { data } = await api.get(`/partidos/${partido.id}/resultado`);
      return [partido.id, data];
    })
);
setResultadosPorPartido(Object.fromEntries(entradasResultado));
```

En el `.map` de `partidos` que arma la lista, envolver el `<div>` existente (el que agrupa `MapaCancha` + `TarjetaPartido`) con `PartidoConEstado`:

```jsx
{partidos.map((partido) => (
  <PartidoConEstado key={partido.id} partido={partido} resultado={resultadosPorPartido[partido.id]}>
    <div
      className={formacionesPorPartido[partido.id] ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : ''}
    >
      {formacionesPorPartido[partido.id] && (
        <MapaCancha
          partidoId={partido.id}
          formacion={formacionesPorPartido[partido.id]}
          esAdmin={esAdmin}
          onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
        />
      )}
      <TarjetaPartido
        partido={partido}
        inscripcionUsuario={inscripcionDelUsuario(partido.id)}
        estaSancionado={estaSancionado}
        procesando={partidoEnProceso === partido.id}
        onAnotarse={() => setPartidoParaAnotarse(partido.id)}
        onSolicitarBaja={() => solicitarBaja(partido)}
        jugadores={inscripcionesPorPartido[partido.id] || []}
        formacion={formacionesPorPartido[partido.id]}
      />
    </div>
  </PartidoConEstado>
))}
```

(quitar el `key={partido.id}` del `<div>` interno ya que ahora está en `PartidoConEstado`; el resto del JSX de ese `<div>` queda igual que antes).

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PartidoConEstado.jsx frontend/src/pages/Home.jsx
git commit -m "feat(frontend): mostrar partido cerrado blureado y resultado jugado en el inicio"
```

---

### Task 9: `ModalCargarResultado`

**Files:**
- Create: `frontend/src/components/ModalCargarResultado.jsx`

**Interfaces:**
- Consumes: `formatearFechaPartido` (Task 7).
- Produces: `<ModalCargarResultado abierto partido elegibles procesando error onConfirmar onCancelar />` donde `elegibles: Array<{usuarioId, nombre, equipo}>` y `onConfirmar(payload)` recibe el shape que espera `PUT /partidos/:id/resultado` (Task 6). Usado por `AdminPanel.jsx` (Task 10).

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/components/ModalCargarResultado.jsx`:

```jsx
import { useEffect, useState } from 'react';
import Boton from './Boton';
import { formatearFechaPartido } from '../utils/fecha';

function golVacio() {
  return { usuarioId: '', equipo: 'A', minuto: '', asistenciaUsuarioId: '' };
}

function sancionVacia() {
  return { usuarioId: '', motivo: '' };
}

export default function ModalCargarResultado({
  abierto,
  partido,
  elegibles,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  const [goles, setGoles] = useState([]);
  const [rendimientos, setRendimientos] = useState({});
  const [sanciones, setSanciones] = useState([]);
  const [jugadorDestacadoId, setJugadorDestacadoId] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setGoles([]);
    setSanciones([]);
    setJugadorDestacadoId('');
    setRendimientos(Object.fromEntries(elegibles.map((jugador) => [jugador.usuarioId, 5])));
  }, [abierto, elegibles]);

  if (!abierto) return null;

  function actualizarGol(indice, campo, valor) {
    setGoles((anterior) => anterior.map((gol, i) => (i === indice ? { ...gol, [campo]: valor } : gol)));
  }

  function actualizarSancion(indice, campo, valor) {
    setSanciones((anterior) => anterior.map((sancion, i) => (i === indice ? { ...sancion, [campo]: valor } : sancion)));
  }

  function confirmar() {
    const payload = {
      goles: goles
        .filter((gol) => gol.usuarioId && gol.minuto !== '')
        .map((gol) => ({
          usuarioId: gol.usuarioId,
          equipo: gol.equipo,
          minuto: Number(gol.minuto),
          asistenciaUsuarioId: gol.asistenciaUsuarioId || null,
        })),
      rendimientos: Object.entries(rendimientos).map(([usuarioId, puntaje]) => ({
        usuarioId,
        puntaje: Number(puntaje),
      })),
      sanciones: sanciones.filter((sancion) => sancion.usuarioId && sancion.motivo.trim()),
      jugadorDestacadoId: jugadorDestacadoId || null,
    };
    onConfirmar(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-cancha-800 p-6">
        <h2 className="mb-4 text-lg font-bold capitalize text-white">
          Cargar resultado — {formatearFechaPartido(partido.fecha)}
        </h2>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase text-white/70">Goles</h3>
            <Boton variante="ghost" className="px-3 py-1 text-xs" onClick={() => setGoles((a) => [...a, golVacio()])}>
              + Agregar gol
            </Boton>
          </div>
          {goles.map((gol, indice) => (
            <div key={indice} className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={gol.usuarioId}
                onChange={(e) => actualizarGol(indice, 'usuarioId', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={j.usuarioId} value={j.usuarioId}>
                    {j.nombre} ({j.equipo})
                  </option>
                ))}
              </select>
              <select
                value={gol.equipo}
                onChange={(e) => actualizarGol(indice, 'equipo', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="A">Equipo A</option>
                <option value="B">Equipo B</option>
              </select>
              <input
                type="number"
                min="0"
                placeholder="Minuto"
                value={gol.minuto}
                onChange={(e) => actualizarGol(indice, 'minuto', e.target.value)}
                className="w-20 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
              <select
                value={gol.asistenciaUsuarioId}
                onChange={(e) => actualizarGol(indice, 'asistenciaUsuarioId', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Sin asistencia</option>
                {elegibles
                  .filter((j) => j.usuarioId !== gol.usuarioId)
                  .map((j) => (
                    <option key={j.usuarioId} value={j.usuarioId}>
                      {j.nombre}
                    </option>
                  ))}
              </select>
              <Boton
                variante="ghost"
                className="px-2 py-1 text-xs text-sancion"
                onClick={() => setGoles((a) => a.filter((_, i) => i !== indice))}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Rendimiento (1-10)</h3>
          {elegibles.map((jugador) => (
            <div key={jugador.usuarioId} className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm text-white/90">
                {jugador.nombre} ({jugador.equipo})
              </span>
              <input
                type="number"
                min="1"
                max="10"
                value={rendimientos[jugador.usuarioId] ?? 5}
                onChange={(e) =>
                  setRendimientos((anterior) => ({ ...anterior, [jugador.usuarioId]: e.target.value }))
                }
                className="w-16 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
            </div>
          ))}
        </section>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase text-white/70">Sanciones en cancha</h3>
            <Boton
              variante="ghost"
              className="px-3 py-1 text-xs"
              onClick={() => setSanciones((a) => [...a, sancionVacia()])}
            >
              + Agregar sanción
            </Boton>
          </div>
          {sanciones.map((sancion, indice) => (
            <div key={indice} className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={sancion.usuarioId}
                onChange={(e) => actualizarSancion(indice, 'usuarioId', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={j.usuarioId} value={j.usuarioId}>
                    {j.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Motivo (ej: Tarjeta roja)"
                value={sancion.motivo}
                onChange={(e) => actualizarSancion(indice, 'motivo', e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
              <Boton
                variante="ghost"
                className="px-2 py-1 text-xs text-sancion"
                onClick={() => setSanciones((a) => a.filter((_, i) => i !== indice))}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Jugador destacado</h3>
          <select
            value={jugadorDestacadoId}
            onChange={(e) => setJugadorDestacadoId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
          >
            <option value="">Sin destacado</option>
            {elegibles.map((j) => (
              <option key={j.usuarioId} value={j.usuarioId}>
                {j.nombre} ({j.equipo})
              </option>
            ))}
          </select>
        </section>

        {error && <p className="mb-4 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

        <div className="flex justify-end gap-3">
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={confirmar} disabled={procesando}>
            {procesando ? 'Guardando…' : 'Guardar resultado'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ModalCargarResultado.jsx
git commit -m "feat(frontend): modal de carga de resultado para el admin"
```

---

### Task 10: Integrar carga de resultado en `AdminPanel`

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx`

**Interfaces:**
- Consumes: `ModalCargarResultado` (Task 9), `GET /partidos/:id/formacion` (existente), `PUT /partidos/:id/resultado` (Task 6).

- [ ] **Step 1: Agregar imports y estado**

En `frontend/src/pages/AdminPanel.jsx`, agregar el import:

```js
import ModalCargarResultado from '../components/ModalCargarResultado';
```

Agregar estado nuevo junto a los existentes:

```js
const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
const [partidoParaResultado, setPartidoParaResultado] = useState(null);
```

- [ ] **Step 2: Cargar formaciones de los partidos no abiertos**

En `cargarTodo`, después de armar `entradas`/`setInscripcionesPorPartido`, agregar:

```js
const entradasFormacion = await Promise.all(
  partidosAbiertos
    .filter((partido) => partido.estado !== 'abierto')
    .map(async (partido) => {
      const { data } = await api.get(`/partidos/${partido.id}/formacion`);
      return [partido.id, data];
    })
);
setFormacionesPorPartido(Object.fromEntries(entradasFormacion));
```

- [ ] **Step 3: Agregar la función de guardado**

Agregar junto a las otras funciones (`promover`, `eliminarPartido`, etc.):

```js
async function guardarResultado(payload) {
  setError('');
  setMensaje('');
  setAccionEnCurso(true);
  try {
    await api.put(`/partidos/${partidoParaResultado.id}/resultado`, payload);
    setMensaje('Resultado cargado con éxito.');
    setPartidoParaResultado(null);
    await cargarTodo();
  } catch (err) {
    setError(err.message);
  } finally {
    setAccionEnCurso(false);
  }
}
```

- [ ] **Step 4: Reemplazar la sección "Partidos abiertos" por "Partidos"**

Reemplazar la sección completa:

```jsx
<section className="flex flex-col gap-4">
  <h2 className="text-lg font-bold text-white">Partidos abiertos</h2>
  {partidos.length === 0 ? (
    <p className="text-sm text-white/50">No hay partidos abiertos.</p>
  ) : (
    partidos.map((partido) => (
      <div key={partido.id} className="rounded-xl border border-white/10 bg-cancha-800 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">{new Date(partido.fecha).toLocaleString('es-AR')}</h3>
          <Boton
            variante="ghost"
            className="px-3 py-1 text-xs text-sancion"
            onClick={() => eliminarPartido(partido.id)}
            disabled={accionEnCurso}
          >
            Eliminar
          </Boton>
        </div>
        <ListaJugadores
          jugadores={inscripcionesPorPartido[partido.id] || []}
          onPromover={(usuarioId) => promover(partido.id, usuarioId)}
          onSancionar={(usuarioId) => {
            setError('');
            const jugador = (inscripcionesPorPartido[partido.id] || []).find((j) => j.usuarioId === usuarioId);
            setJugadorASancionar({ partidoId: partido.id, usuarioId, nombre: jugador?.nombre || 'este jugador' });
          }}
          deshabilitado={accionEnCurso}
        />
      </div>
    ))
  )}
</section>
```

por:

```jsx
<section className="flex flex-col gap-4">
  <h2 className="text-lg font-bold text-white">Partidos</h2>
  {partidos.length === 0 ? (
    <p className="text-sm text-white/50">No hay partidos abiertos.</p>
  ) : (
    partidos.map((partido) => (
      <div key={partido.id} className="rounded-xl border border-white/10 bg-cancha-800 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">
            {new Date(partido.fecha).toLocaleString('es-AR')}{' '}
            <span className="ml-2 text-xs font-normal uppercase text-white/40">{partido.estado}</span>
          </h3>
          <div className="flex gap-2">
            {partido.estado === 'cerrado' && (
              <Boton
                variante="primario"
                className="px-3 py-1 text-xs"
                onClick={() => setPartidoParaResultado(partido)}
                disabled={accionEnCurso}
              >
                Cargar resultado
              </Boton>
            )}
            {partido.estado === 'abierto' && (
              <Boton
                variante="ghost"
                className="px-3 py-1 text-xs text-sancion"
                onClick={() => eliminarPartido(partido.id)}
                disabled={accionEnCurso}
              >
                Eliminar
              </Boton>
            )}
          </div>
        </div>
        <ListaJugadores
          jugadores={inscripcionesPorPartido[partido.id] || []}
          onPromover={partido.estado === 'abierto' ? (usuarioId) => promover(partido.id, usuarioId) : undefined}
          onSancionar={
            partido.estado === 'abierto'
              ? (usuarioId) => {
                  setError('');
                  const jugador = (inscripcionesPorPartido[partido.id] || []).find((j) => j.usuarioId === usuarioId);
                  setJugadorASancionar({ partidoId: partido.id, usuarioId, nombre: jugador?.nombre || 'este jugador' });
                }
              : undefined
          }
          deshabilitado={accionEnCurso}
        />
      </div>
    ))
  )}
</section>
```

- [ ] **Step 5: Agregar el modal al final del componente**

Agregar junto a `<ModalConfirmacionSancionAdmin ... />`:

```jsx
<ModalCargarResultado
  abierto={Boolean(partidoParaResultado)}
  partido={partidoParaResultado}
  elegibles={(formacionesPorPartido[partidoParaResultado?.id]?.jugadores || []).filter((j) => j.equipo)}
  procesando={accionEnCurso}
  error={error}
  onConfirmar={guardarResultado}
  onCancelar={() => {
    setPartidoParaResultado(null);
    setError('');
  }}
/>
```

- [ ] **Step 6: Verificar que compila**

Run: `cd frontend && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AdminPanel.jsx
git commit -m "feat(frontend): seccion de admin para cargar el resultado de un partido cerrado"
```

---

### Task 11: Verificación end-to-end manual

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Correr toda la suite de backend**

Run: `cd backend && npm test`
Expected: todos los tests en verde.

- [ ] **Step 2: Levantar backend y frontend**

Run (dos terminales): `cd backend && npm run dev` y `cd frontend && npm run dev`.

- [ ] **Step 3: Crear un partido y anotarse hasta completar titulares, guardar formación (flujo ya existente)**

Usar el AdminPanel para crear un partido con fecha cercana (ej. 5 minutos en el futuro), anotarse con usuarios de prueba hasta cubrir `cupoTitulares`, y guardar la formación (asignar equipos) desde `MapaCancha`.

- [ ] **Step 4: Forzar el vencimiento sin esperar la fecha real**

Con el backend detenido o en otra terminal, mover la fecha del partido al pasado directamente en la base:

```bash
cd backend
node -e "
const { db } = require('./src/config/db');
const row = db.prepare(\"SELECT id FROM Partidos WHERE estado='abierto' ORDER BY fecha DESC LIMIT 1\").get();
db.prepare('UPDATE Partidos SET fecha = ? WHERE id = ?').run(new Date(Date.now() - 60000).toISOString(), row.id);
console.log('fecha movida al pasado para', row.id);
"
```

- [ ] **Step 5: Verificar el cierre automático y el blur en Home**

Esperar hasta 60 segundos (intervalo del cron) y refrescar el inicio (`Home`) en el navegador. Confirmar que la caja del partido (tarjeta + cancha) aparece blureada con el texto "Esperando resultados".

- [ ] **Step 6: Cargar el resultado desde AdminPanel**

En `AdminPanel`, click en "Cargar resultado" para ese partido, completar al menos un gol, un rendimiento y opcionalmente un destacado, y confirmar.

- [ ] **Step 7: Verificar que el resultado se muestra en Home**

Refrescar `Home` y confirmar que, en lugar de la caja blureada, se muestra `ResultadoPartido` con el marcador, los goles y el destacado cargados.
