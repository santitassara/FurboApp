# Votación de Valoraciones y MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el rendimiento (puntaje 1-10) y el MVP admin-only por votación entre todos los jugadores elegibles de un partido, mostrando el promedio de puntajes y el/los MVP más votados en el resumen.

**Architecture:** `RendimientosJugador` pasa de "un valor por jugador" a "un voto por votante hacia un jugador" (agrega `votanteId`, renombra `usuarioId`→`jugadorId`). Nueva tabla `VotosMvp` (un voto de MVP por votante). Nuevo servicio/endpoint self-service (`votosService` + `POST /votos`, sin `verificarAdmin`) separado del `PUT /resultado` del admin, que ahora solo maneja goles+sanciones. `obtenerResultado` agrega (`AVG`/`COUNT`) los votos al leer.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), React + Axios + TailwindCSS (frontend), Jest (tests backend).

**Spec:** `docs/superpowers/specs/2026-08-16-votacion-valoraciones-design.md`

## Global Constraints

- `puntaje` es un entero 1-10 (igual que hoy).
- El votante debe estar en el pool de elegibles del partido (titular con `equipo` asignado en formación — mismo `resultadosService.obtenerElegibles`).
- Un jugador no puede votarse a sí mismo, ni en puntaje ni en MVP.
- Votar solo es válido con `Partido.estado === 'jugado'`.
- Re-enviar un voto es upsert: mismo `(partidoId, jugadorId, votanteId)` reemplaza el puntaje; mismo `(partidoId, votanteId)` en MVP reemplaza el MVP elegido. Enviar `mvpId: null` en un submit NO borra un voto MVP previo (solo actualiza si viene informado).
- Sin límite de tiempo: se puede votar/revotar mientras el partido siga `'jugado'`.
- El admin deja de cargar rendimiento y MVP: `PUT /resultado` solo acepta `goles` y `sanciones`.
- MVP mostrado = todos los jugadores empatados en el máximo de votos en `VotosMvp` (lista vacía si nadie votó MVP todavía).

---

## Task 1: Schema — votos de rendimiento y MVP

**Files:**
- Modify: `backend/src/db/schema.sql:66-71` (tabla `RendimientosJugador`), agrega tabla `VotosMvp`
- Modify: `backend/src/config/db.js` (migración en caliente para DBs existentes + índice único)
- Modify: `backend/tests/config/db.test.js`

**Interfaces:**
- Produces: tabla `RendimientosJugador(id, partidoId, jugadorId, votanteId, puntaje)` con índice único `idx_rendimientos_voto_unico (partidoId, jugadorId, votanteId)`; tabla `VotosMvp(id, partidoId, votanteId, jugadorId)` con índice único `idx_votos_mvp_unico (partidoId, votanteId)`. Todo el código de tasks siguientes asume estas dos tablas.

- [ ] **Step 1: Actualizar `schema.sql`**

En `backend/src/db/schema.sql`, reemplazar la tabla `RendimientosJugador` (líneas 66-71) por:

```sql
CREATE TABLE IF NOT EXISTS RendimientosJugador (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  jugadorId TEXT NOT NULL REFERENCES Usuarios(uid),
  votanteId TEXT REFERENCES Usuarios(uid),
  puntaje INTEGER NOT NULL
);
```

Y agregar, junto a las demás `CREATE TABLE` de resultados, una tabla nueva:

```sql
CREATE TABLE IF NOT EXISTS VotosMvp (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  votanteId TEXT NOT NULL REFERENCES Usuarios(uid),
  jugadorId TEXT NOT NULL REFERENCES Usuarios(uid)
);
```

Y agregar sus índices junto a los de las líneas 80-82:

```sql
CREATE INDEX IF NOT EXISTS idx_votos_mvp_partido ON VotosMvp (partidoId);
```

(El índice único de `VotosMvp` y el de `RendimientosJugador` se crean en `db.js`, no acá — ver Step 2, porque en una base ya existente las columnas nuevas todavía no existen cuando corre `schema.sql`.)

Nota: `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya existe, así que este cambio solo define la forma final para bases **nuevas** (tests en `:memory:`, o una instalación desde cero). Las bases existentes se migran en el Step 2.

- [ ] **Step 2: Migración en caliente en `db.js`**

Agregar al final de `backend/src/config/db.js`, antes de `module.exports = { db };` (línea 83):

```js
const columnasRendimientos = db.prepare('PRAGMA table_info(RendimientosJugador)').all();
const tieneColumnaLegadaUsuarioId = columnasRendimientos.some((columna) => columna.name === 'usuarioId');
if (tieneColumnaLegadaUsuarioId) {
  // El modelo anterior guardaba un puntaje único puesto por el admin, sin dueño de voto:
  // no hay forma de atribuirle un votanteId real, así que se descartan al migrar.
  db.exec('DELETE FROM RendimientosJugador');
  db.exec('ALTER TABLE RendimientosJugador RENAME COLUMN usuarioId TO jugadorId');
}
const columnasRendimientosActualizadas = db.prepare('PRAGMA table_info(RendimientosJugador)').all();
const tieneVotanteId = columnasRendimientosActualizadas.some((columna) => columna.name === 'votanteId');
if (!tieneVotanteId) {
  db.exec('ALTER TABLE RendimientosJugador ADD COLUMN votanteId TEXT REFERENCES Usuarios(uid)');
}
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico ON RendimientosJugador (partidoId, jugadorId, votanteId)'
);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_mvp_unico ON VotosMvp (partidoId, votanteId)');
```

- [ ] **Step 3: Actualizar test de schema**

En `backend/tests/config/db.test.js`, agregar un test:

```js
it('crea la tabla VotosMvp y las columnas jugadorId/votanteId en RendimientosJugador', () => {
  const tablas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((fila) => fila.name);
  expect(tablas).toEqual(expect.arrayContaining(['VotosMvp']));

  const columnas = db.prepare('PRAGMA table_info(RendimientosJugador)').all().map((c) => c.name);
  expect(columnas).toEqual(expect.arrayContaining(['jugadorId', 'votanteId']));
});
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/config/db.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js backend/tests/config/db.test.js
git commit -m "feat(backend): agrega tabla VotosMvp y columna votanteId a RendimientosJugador"
```

---

## Task 2: `votosService` — votar valoraciones y MVP

**Files:**
- Create: `backend/src/services/votosService.js`
- Test: `backend/tests/services/votosService.test.js`

**Interfaces:**
- Consumes: `partidosService.obtenerPartido(partidoId)` (ya existente), `resultadosService.obtenerElegibles(partidoId)` (ya existente, `backend/src/services/resultadosService.js:12-20`), `usuariosService` (no se usa acá, solo en la lectura agregada de Task 3).
- Produces: `votosService.guardarVotos(partidoId, votanteId, payload)` → `Promise<{ valoraciones: [{jugadorId, puntaje}], mvpId: string|null }>` (los votos actualizados del votante). `votosService.obtenerVotosDeVotante(partidoId, votanteId)` → mismo shape. Ambas usadas por `votosController` en Task 4.

- [ ] **Step 1: Escribir los tests (deben fallar — el módulo no existe)**

Crear `backend/tests/services/votosService.test.js`:

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');
const votosService = require('../../src/services/votosService');

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
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM VotosMvp');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
});

async function crearPartidoJugadoConElegibles() {
  const partido = await crearPartido();
  await crearUsuario({ uid: 'u1', email: 'u1@gmail.com', nombre: 'Jugador Uno' });
  await crearUsuario({ uid: 'u2', email: 'u2@gmail.com', nombre: 'Jugador Dos' });
  await crearUsuario({ uid: 'u3', email: 'u3@gmail.com', nombre: 'Jugador Tres' });
  insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });
  insertarInscripcion({ id: 'i2', partidoId: partido.id, usuarioId: 'u2', tipo: 'titular', equipo: 'B' });
  insertarInscripcion({ id: 'i3', partidoId: partido.id, usuarioId: 'u3', tipo: 'titular', equipo: 'A' });
  await resultadosService.guardarResultado(partido.id, {});
  return partido;
}

describe('votosService.guardarVotos', () => {
  it('rechaza si el partido no está jugado', async () => {
    const partido = await crearPartido();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });

    await expect(
      votosService.guardarVotos(partido.id, 'u1', { valoraciones: [] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza si el votante no es elegible', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'no-elegible', { valoraciones: [] })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza calificar a un jugador no elegible', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', {
        valoraciones: [{ jugadorId: 'no-elegible', puntaje: 8 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza que un jugador se autocalifique', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', {
        valoraciones: [{ jugadorId: 'u1', puntaje: 8 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza puntaje fuera de rango 1-10', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', {
        valoraciones: [{ jugadorId: 'u2', puntaje: 11 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza mvpId no elegible o igual al votante', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', { valoraciones: [], mvpId: 'u1' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      votosService.guardarVotos(partido.id, 'u1', { valoraciones: [], mvpId: 'no-elegible' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('guarda valoraciones y mvp, y los devuelve al leer mis votos', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await votosService.guardarVotos(partido.id, 'u1', {
      valoraciones: [
        { jugadorId: 'u2', puntaje: 8 },
        { jugadorId: 'u3', puntaje: 6 },
      ],
      mvpId: 'u2',
    });

    const misVotos = await votosService.obtenerVotosDeVotante(partido.id, 'u1');
    expect(misVotos.mvpId).toBe('u2');
    expect(misVotos.valoraciones).toEqual(
      expect.arrayContaining([
        { jugadorId: 'u2', puntaje: 8 },
        { jugadorId: 'u3', puntaje: 6 },
      ])
    );
  });

  it('re-enviar el voto de un mismo jugador reemplaza el puntaje anterior (upsert)', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [{ jugadorId: 'u2', puntaje: 8 }] });
    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [{ jugadorId: 'u2', puntaje: 5 }] });

    const misVotos = await votosService.obtenerVotosDeVotante(partido.id, 'u1');
    expect(misVotos.valoraciones).toEqual([{ jugadorId: 'u2', puntaje: 5 }]);
  });

  it('enviar mvpId null no borra un voto mvp anterior', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [], mvpId: 'u2' });
    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [{ jugadorId: 'u3', puntaje: 7 }] });

    const misVotos = await votosService.obtenerVotosDeVotante(partido.id, 'u1');
    expect(misVotos.mvpId).toBe('u2');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npx jest tests/services/votosService.test.js`
Expected: FAIL con `Cannot find module '../../src/services/votosService'`.

- [ ] **Step 3: Implementar `votosService.js`**

Crear `backend/src/services/votosService.js`:

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const resultadosService = require('./resultadosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function guardarVotos(partidoId, votanteId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') {
    throw crearError('El partido todavía no tiene resultado cargado', 400);
  }

  const elegibles = await resultadosService.obtenerElegibles(partidoId);
  const elegiblesSet = new Set(elegibles);
  if (!elegiblesSet.has(votanteId)) {
    throw crearError('No sos elegible para votar en este partido', 403);
  }

  const valoraciones = Array.isArray(payload.valoraciones) ? payload.valoraciones : [];
  const mvpId = payload.mvpId || null;

  for (const valoracion of valoraciones) {
    if (!elegiblesSet.has(valoracion.jugadorId)) {
      throw crearError('Jugador no elegible para votar', 400);
    }
    if (valoracion.jugadorId === votanteId) {
      throw crearError('No podés calificarte a vos mismo', 400);
    }
    if (!Number.isInteger(valoracion.puntaje) || valoracion.puntaje < 1 || valoracion.puntaje > 10) {
      throw crearError('puntaje debe ser un entero entre 1 y 10', 400);
    }
  }
  if (mvpId) {
    if (!elegiblesSet.has(mvpId)) throw crearError('Jugador no elegible para MVP', 400);
    if (mvpId === votanteId) throw crearError('No podés elegirte a vos mismo como MVP', 400);
  }

  const guardar = db.transaction(() => {
    for (const valoracion of valoraciones) {
      db.prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
         VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)
         ON CONFLICT(partidoId, jugadorId, votanteId) DO UPDATE SET puntaje = excluded.puntaje`
      ).run({
        id: crypto.randomUUID(),
        partidoId,
        jugadorId: valoracion.jugadorId,
        votanteId,
        puntaje: valoracion.puntaje,
      });
    }
    if (mvpId) {
      db.prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId)
         VALUES (@id, @partidoId, @votanteId, @jugadorId)
         ON CONFLICT(partidoId, votanteId) DO UPDATE SET jugadorId = excluded.jugadorId`
      ).run({ id: crypto.randomUUID(), partidoId, votanteId, jugadorId: mvpId });
    }
  });
  guardar();

  return obtenerVotosDeVotante(partidoId, votanteId);
}

async function obtenerVotosDeVotante(partidoId, votanteId) {
  const valoraciones = db
    .prepare('SELECT jugadorId, puntaje FROM RendimientosJugador WHERE partidoId = ? AND votanteId = ?')
    .all(partidoId, votanteId);
  const mvp = db
    .prepare('SELECT jugadorId FROM VotosMvp WHERE partidoId = ? AND votanteId = ?')
    .get(partidoId, votanteId);
  return { valoraciones, mvpId: mvp ? mvp.jugadorId : null };
}

module.exports = { guardarVotos, obtenerVotosDeVotante };
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest tests/services/votosService.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/votosService.js backend/tests/services/votosService.test.js
git commit -m "feat(backend): votosService para votar valoraciones y mvp entre jugadores"
```

---

## Task 3: `resultadosService` — admin solo goles/sanciones, lectura agregada

**Files:**
- Modify: `backend/src/services/resultadosService.js:22-166`
- Modify: `backend/tests/services/resultadosService.test.js`

**Interfaces:**
- Consumes: nada nuevo (sigue usando `partidosService`, `usuariosService`).
- Produces: `guardarResultado(partidoId, payload)` ya no acepta `rendimientos`/`jugadorDestacadoId`. `obtenerResultado(partidoId)` devuelve `rendimientos: [{usuarioId, nombre, promedio: number|null, votos: number}]` y `jugadorDestacado: { jugadores: [{usuarioId, nombre}], votos: number, totalElegibles: number }`. `eliminarPorPartido` también borra `VotosMvp`. Usado por `resultadosController` (sin cambios) y por `votosService`/`votosController` (Task 2 y 4, que ya asumen este `obtenerElegibles`).

- [ ] **Step 1: Actualizar `guardarResultado` — sacar rendimientos y MVP**

En `backend/src/services/resultadosService.js`, reemplazar el cuerpo de `guardarResultado` (líneas 22-109) por:

```js
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
  const sanciones = Array.isArray(payload.sanciones) ? payload.sanciones : [];

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
  for (const sancion of sanciones) {
    if (!elegiblesSet.has(sancion.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (!sancion.motivo || typeof sancion.motivo !== 'string') {
      throw crearError('motivo es requerido', 400);
    }
  }

  const guardar = db.transaction(() => {
    db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
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
    for (const sancion of sanciones) {
      db.prepare(
        `INSERT INTO SancionesPartido (id, partidoId, usuarioId, motivo)
         VALUES (@id, @partidoId, @usuarioId, @motivo)`
      ).run({ id: crypto.randomUUID(), partidoId, usuarioId: sancion.usuarioId, motivo: sancion.motivo });
    }
    db.prepare(
      `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, fechaCarga)
       VALUES (@id, @partidoId, NULL, @fechaCarga)`
    ).run({ id: crypto.randomUUID(), partidoId, fechaCarga: new Date().toISOString() });
    db.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partidoId);
  });
  guardar();

  return obtenerResultado(partidoId);
}
```

Notar que borrar/recargar `Goles`/`SancionesPartido`/`Resultados` ya **no** toca `RendimientosJugador` ni `VotosMvp`: el admin puede corregir goles/sanciones sin perder los votos ya emitidos.

- [ ] **Step 2: Actualizar `obtenerResultado` — promedio y mvp agregados**

Reemplazar el cuerpo de `obtenerResultado` (líneas 111-159) por:

```js
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

  const elegibles = await obtenerElegibles(partidoId);
  const promediosPorJugador = new Map(
    db
      .prepare(
        `SELECT jugadorId, AVG(puntaje) as promedio, COUNT(*) as votos
         FROM RendimientosJugador WHERE partidoId = ? GROUP BY jugadorId`
      )
      .all(partidoId)
      .map((fila) => [fila.jugadorId, fila])
  );
  const rendimientos = await Promise.all(
    elegibles.map(async (jugadorId) => {
      const usuario = await usuariosService.obtenerUsuario(jugadorId);
      const fila = promediosPorJugador.get(jugadorId);
      return {
        usuarioId: jugadorId,
        nombre: usuario?.nombre || 'Jugador',
        promedio: fila ? Math.round(fila.promedio * 10) / 10 : null,
        votos: fila ? fila.votos : 0,
      };
    })
  );

  const filasSanciones = db.prepare('SELECT * FROM SancionesPartido WHERE partidoId = ?').all(partidoId);
  const sanciones = await Promise.all(
    filasSanciones.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', motivo: fila.motivo };
    })
  );

  const votosMvp = db
    .prepare(
      `SELECT jugadorId, COUNT(*) as votos FROM VotosMvp WHERE partidoId = ? GROUP BY jugadorId ORDER BY votos DESC`
    )
    .all(partidoId);
  const maxVotosMvp = votosMvp.length > 0 ? votosMvp[0].votos : 0;
  const jugadoresDestacados = await Promise.all(
    votosMvp
      .filter((fila) => fila.votos === maxVotosMvp)
      .map(async (fila) => {
        const usuario = await usuariosService.obtenerUsuario(fila.jugadorId);
        return { usuarioId: fila.jugadorId, nombre: usuario?.nombre || 'Jugador' };
      })
  );
  const jugadorDestacado = {
    jugadores: jugadoresDestacados,
    votos: maxVotosMvp,
    totalElegibles: elegibles.length,
  };

  return { marcador, goles, rendimientos, sanciones, jugadorDestacado, fechaCarga: resultado.fechaCarga };
}
```

- [ ] **Step 3: `eliminarPorPartido` también borra `VotosMvp`**

Reemplazar (líneas 161-166):

```js
function eliminarPorPartido(partidoId) {
  db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM VotosMvp WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);
}
```

- [ ] **Step 4: Actualizar `resultadosService.test.js`**

En `backend/tests/services/resultadosService.test.js`:

1. Agregar `mockDb.exec('DELETE FROM VotosMvp');` al `beforeEach` (junto a la línea 41).
2. En el test `'guarda el resultado completo y pasa el partido a jugado'` (líneas 129-157), sacar `rendimientos` y `jugadorDestacadoId` del payload pasado a `guardarResultado`, y reemplazar las aserciones de `resultado.rendimientos`/`resultado.jugadorDestacado` por:

```js
    const resultado = await resultadosService.guardarResultado(partido.id, {
      goles: [
        { usuarioId: 'u1', equipo: 'A', minuto: 10, asistenciaUsuarioId: 'u2' },
        { usuarioId: 'u2', equipo: 'B', minuto: 20 },
      ],
      sanciones: [{ usuarioId: 'u2', motivo: 'Tarjeta roja' }],
    });

    expect(resultado.marcador).toEqual({ A: 1, B: 1 });
    expect(resultado.goles).toHaveLength(2);
    expect(resultado.goles[0]).toMatchObject({ usuarioId: 'u1', minuto: 10, asistenciaNombre: 'Jugador Dos' });
    expect(resultado.sanciones).toEqual([{ usuarioId: 'u2', nombre: 'Jugador Dos', motivo: 'Tarjeta roja' }]);
    expect(resultado.rendimientos).toEqual(
      expect.arrayContaining([
        { usuarioId: 'u1', nombre: 'Jugador Uno', promedio: null, votos: 0 },
        { usuarioId: 'u2', nombre: 'Jugador Dos', promedio: null, votos: 0 },
      ])
    );
    expect(resultado.jugadorDestacado).toEqual({ jugadores: [], votos: 0, totalElegibles: 2 });
```

3. Borrar el test `'rechaza un puntaje de rendimiento fuera de rango'` (líneas 107-116) — esa validación ahora vive en `votosService.test.js`.
4. Agregar un describe nuevo al final del archivo:

```js
describe('resultadosService.obtenerResultado — rendimientos y mvp votados', () => {
  function insertarVoto({ partidoId, jugadorId, votanteId, puntaje }) {
    mockDb
      .prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
         VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)`
      )
      .run({ id: `${jugadorId}-${votanteId}`, partidoId, jugadorId, votanteId, puntaje });
  }

  function insertarVotoMvp({ partidoId, votanteId, jugadorId }) {
    mockDb
      .prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId) VALUES (@id, @partidoId, @votanteId, @jugadorId)`
      )
      .run({ id: `${votanteId}-mvp`, partidoId, votanteId, jugadorId });
  }

  it('promedia los votos recibidos y marca sin votos a quien no recibió ninguno', async () => {
    const partido = await crearPartidoConElegibles();
    await resultadosService.guardarResultado(partido.id, {});
    insertarVoto({ partidoId: partido.id, jugadorId: 'u1', votanteId: 'u2', puntaje: 8 });
    insertarVoto({ partidoId: partido.id, jugadorId: 'u1', votanteId: 'admin-1', puntaje: 6 });

    const resultado = await resultadosService.obtenerResultado(partido.id);

    expect(resultado.rendimientos).toEqual(
      expect.arrayContaining([
        { usuarioId: 'u1', nombre: 'Jugador Uno', promedio: 7, votos: 2 },
        { usuarioId: 'u2', nombre: 'Jugador Dos', promedio: null, votos: 0 },
      ])
    );
  });

  it('muestra empatados como destacados cuando hay igual cantidad de votos mvp', async () => {
    const partido = await crearPartidoConElegibles();
    await resultadosService.guardarResultado(partido.id, {});
    insertarVotoMvp({ partidoId: partido.id, votanteId: 'u1', jugadorId: 'u2' });
    insertarVotoMvp({ partidoId: partido.id, votanteId: 'admin-1', jugadorId: 'u1' });

    const resultado = await resultadosService.obtenerResultado(partido.id);

    expect(resultado.jugadorDestacado.votos).toBe(1);
    expect(resultado.jugadorDestacado.totalElegibles).toBe(2);
    expect(resultado.jugadorDestacado.jugadores).toEqual(
      expect.arrayContaining([
        { usuarioId: 'u1', nombre: 'Jugador Uno' },
        { usuarioId: 'u2', nombre: 'Jugador Dos' },
      ])
    );
  });

  it('sin votos mvp devuelve lista vacía', async () => {
    const partido = await crearPartidoConElegibles();
    await resultadosService.guardarResultado(partido.id, {});

    const resultado = await resultadosService.obtenerResultado(partido.id);

    expect(resultado.jugadorDestacado).toEqual({ jugadores: [], votos: 0, totalElegibles: 2 });
  });
});
```

- [ ] **Step 5: Correr los tests**

Run: `cd backend && npx jest tests/services/resultadosService.test.js`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 6: Correr toda la suite backend**

Run: `cd backend && npx jest`
Expected: PASS (todos los archivos, incluye Task 1 y 2).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/resultadosService.js backend/tests/services/resultadosService.test.js
git commit -m "feat(backend): admin solo carga goles/sanciones, rendimiento y mvp se leen agregados de los votos"
```

---

## Task 4: Endpoints de votación

**Files:**
- Create: `backend/src/controllers/votosController.js`
- Modify: `backend/src/routes/partidosRoutes.js:44-51`

**Interfaces:**
- Consumes: `votosService.guardarVotos(partidoId, votanteId, payload)`, `votosService.obtenerVotosDeVotante(partidoId, votanteId)` (Task 2).
- Produces: `POST /api/partidos/:partidoId/votos` y `GET /api/partidos/:partidoId/votos/mios`, ambos detrás de `verificarToken` únicamente (sin `verificarAdmin`) — usados por el frontend en Task 7.

- [ ] **Step 1: Crear el controller**

Crear `backend/src/controllers/votosController.js`:

```js
const votosService = require('../services/votosService');

async function guardar(req, res) {
  const votos = await votosService.guardarVotos(req.params.partidoId, req.usuario.uid, req.body);
  res.json(votos);
}

async function obtenerMios(req, res) {
  const votos = await votosService.obtenerVotosDeVotante(req.params.partidoId, req.usuario.uid);
  res.json(votos);
}

module.exports = { guardar, obtenerMios };
```

- [ ] **Step 2: Agregar las rutas**

En `backend/src/routes/partidosRoutes.js`, agregar el `require` junto a la línea 7 y las rutas después de la línea 51 (después de las rutas de `/resultado`):

```js
const votosController = require('../controllers/votosController');
```

```js
router.get('/:partidoId/votos/mios', verificarToken, envolverAsync(votosController.obtenerMios));
router.post('/:partidoId/votos', verificarToken, envolverAsync(votosController.guardar));
```

- [ ] **Step 3: Probar manualmente**

Run: `cd backend && npm run dev` (o el script que levante el server), y con dos usuarios logueados (uno elegible del partido) probar:
```bash
curl -X POST http://localhost:4000/api/partidos/<id>/votos \
  -H "Authorization: Bearer <token-jugador-elegible>" \
  -H "Content-Type: application/json" \
  -d '{"valoraciones":[{"jugadorId":"<otro-elegible>","puntaje":8}],"mvpId":"<otro-elegible>"}'
```
Expected: `200` con `{ "valoraciones": [...], "mvpId": "..." }`. Con un usuario no elegible, `403`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/votosController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): expone POST /votos y GET /votos/mios para votar valoraciones y mvp"
```

---

## Task 5: Sacar rendimiento y MVP del formulario del admin

**Files:**
- Modify: `frontend/src/components/ModalCargarResultado.jsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `onConfirmar(payload)` ahora solo con `{ goles, sanciones }` — consumido por `AdminPanel.jsx:143-157` (`guardarResultado`), que no necesita cambios porque ya reenvía el payload tal cual al backend.

- [ ] **Step 1: Sacar estado y efecto de rendimientos/MVP**

En `frontend/src/components/ModalCargarResultado.jsx`, reemplazar líneas 13-33:

```jsx
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
  const [sanciones, setSanciones] = useState([]);

  useEffect(() => {
    if (!abierto) return;
    setGoles([]);
    setSanciones([]);
  }, [abierto]);
```

- [ ] **Step 2: Sacar rendimientos y `jugadorDestacadoId` del payload**

Reemplazar `confirmar()` (líneas 55-73):

```jsx
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
      sanciones: sanciones.filter((sancion) => sancion.usuarioId && sancion.motivo.trim()),
    };
    onConfirmar(payload);
  }
```

- [ ] **Step 3: Sacar la sección de rendimiento (JSX)**

Borrar la sección completa (líneas 151-170):

```jsx
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
```

- [ ] **Step 4: Sacar la sección de jugador destacado (JSX)**

Borrar la sección completa (líneas 215-229, la que sigue a "Sanciones en cancha" y precede al bloque de `error`):

```jsx
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
```

- [ ] **Step 5: Verificar visualmente**

Run: `cd frontend && npm run dev`, loguearse como admin, abrir "Cargar resultado" de un partido `cerrado`/`jugado` con formación guardada.
Expected: el modal ya no muestra "Rendimiento (1-10)" ni "Jugador destacado"; goles y sanciones funcionan como antes; el submit guarda sin error.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ModalCargarResultado.jsx
git commit -m "feat(frontend): admin ya no carga rendimiento ni mvp, solo goles y sanciones"
```

---

## Task 6: Mostrar promedio y empate de MVP en el resumen

**Files:**
- Modify: `frontend/src/components/ResultadoPartido.jsx:136-163`

**Interfaces:**
- Consumes: nuevo shape de `resultado.rendimientos` (`{usuarioId, nombre, promedio: number|null, votos}`) y `resultado.jugadorDestacado` (`{jugadores: [...], votos, totalElegibles}`) producido por Task 3.
- Produces: nada nuevo (componente hoja).

- [ ] **Step 1: Actualizar el panel de jugador destacado**

Reemplazar (líneas 136-143):

```jsx
      {jugadorDestacado.jugadores.length > 0 && (
        <div className="mx-auto mb-4 flex w-fit flex-wrap items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5">
          {jugadorDestacado.jugadores.map((jugador) => (
            <span key={jugador.usuarioId} className="flex items-center gap-2 text-sm text-white">
              <IconoTrofeo />
              MVP: <span className="font-bold text-pasto-500">{jugador.nombre}</span>
            </span>
          ))}
        </div>
      )}
```

- [ ] **Step 2: Actualizar el panel de rendimiento (promedio + votos)**

Reemplazar el bloque `<Panel titulo="Rendimiento de jugadores" ...>` (líneas 145-163):

```jsx
      <Panel titulo="Rendimiento de jugadores" className="mb-4">
        {rendimientos.length === 0 ? (
          <p className="text-sm text-white/50">Sin cargar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rendimientos.map((rendimiento) => (
              <li key={rendimiento.usuarioId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-white/90">{rendimiento.nombre}</span>
                {rendimiento.votos === 0 ? (
                  <span className="text-xs text-white/40">Sin votos</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <BarraRendimiento puntaje={Math.round(rendimiento.promedio)} />
                    <span className="w-16 shrink-0 text-right text-xs font-bold text-white/60">
                      {rendimiento.promedio}/10 ({rendimiento.votos})
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
```

- [ ] **Step 3: Verificar visualmente**

Run: `cd frontend && npm run dev`, entrar a `/historial`, expandir un partido `jugado` sin votos todavía.
Expected: cada jugador elegible aparece listado con "Sin votos"; sin sección de MVP (lista vacía).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ResultadoPartido.jsx
git commit -m "feat(frontend): resumen muestra promedio de votos y empate de mvp"
```

---

## Task 7: Modal de votación para jugadores elegibles

**Files:**
- Create: `frontend/src/components/ModalVotarValoraciones.jsx`
- Modify: `frontend/src/components/ItemHistorialPartido.jsx`

**Interfaces:**
- Consumes: `GET /partidos/:id/formacion` (ya existe, sin auth especial, devuelve `{ jugadores: [{usuarioId, nombre, equipo, ...}] }` — `backend/src/services/inscripcionesService.js` `obtenerFormacion`), `GET /partidos/:id/votos/mios`, `POST /partidos/:id/votos` (Task 4), `useAuth().perfil.uid` (`frontend/src/context/AuthContext.jsx:129-130`).
- Produces: UI de votación, sin interfaz consumida por otros componentes.

- [ ] **Step 1: Crear `ModalVotarValoraciones.jsx`**

Crear `frontend/src/components/ModalVotarValoraciones.jsx`:

```jsx
import { useEffect, useState } from 'react';
import Boton from './Boton';
import { formatearFechaPartido } from '../utils/fecha';

export default function ModalVotarValoraciones({
  abierto,
  partido,
  elegibles,
  votosPropios,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  const [puntajes, setPuntajes] = useState({});
  const [mvpId, setMvpId] = useState('');

  useEffect(() => {
    if (!abierto) return;
    const previos = Object.fromEntries((votosPropios.valoraciones || []).map((v) => [v.jugadorId, v.puntaje]));
    setPuntajes(Object.fromEntries(elegibles.map((j) => [j.usuarioId, previos[j.usuarioId] ?? 5])));
    setMvpId(votosPropios.mvpId || '');
  }, [abierto, elegibles, votosPropios]);

  if (!abierto) return null;

  function confirmar() {
    const payload = {
      valoraciones: Object.entries(puntajes).map(([jugadorId, puntaje]) => ({
        jugadorId,
        puntaje: Number(puntaje),
      })),
      mvpId: mvpId || null,
    };
    onConfirmar(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-cancha-800 p-6">
        <h2 className="mb-4 text-lg font-bold capitalize text-white">
          Calificar jugadores — {formatearFechaPartido(partido.fecha)}
        </h2>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Puntaje (1-10)</h3>
          {elegibles.map((jugador) => (
            <div key={jugador.usuarioId} className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm text-white/90">
                {jugador.nombre} ({jugador.equipo})
              </span>
              <input
                type="number"
                min="1"
                max="10"
                value={puntajes[jugador.usuarioId] ?? 5}
                onChange={(e) => setPuntajes((anterior) => ({ ...anterior, [jugador.usuarioId]: e.target.value }))}
                className="w-16 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
            </div>
          ))}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Tu MVP del partido</h3>
          <select
            value={mvpId}
            onChange={(e) => setMvpId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
          >
            <option value="">Sin elegir</option>
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
            {procesando ? 'Guardando…' : 'Guardar mi voto'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wirear en `ItemHistorialPartido.jsx`**

Reemplazar el archivo completo `frontend/src/components/ItemHistorialPartido.jsx` por:

```jsx
import { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatearFechaPartido } from '../utils/fecha';
import ResultadoPartido from './ResultadoPartido';
import ModalVotarValoraciones from './ModalVotarValoraciones';

export default function ItemHistorialPartido({ partido }) {
  const { perfil } = useAuth();
  const [expandido, setExpandido] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [elegibles, setElegibles] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [votoAbierto, setVotoAbierto] = useState(false);
  const [votosPropios, setVotosPropios] = useState({ valoraciones: [], mvpId: null });
  const [votando, setVotando] = useState(false);
  const [errorVoto, setErrorVoto] = useState('');

  const cantidadJugadores = (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0);
  const soyElegible = elegibles.some((j) => j.usuarioId === perfil?.uid);

  async function alternar() {
    const nuevoExpandido = !expandido;
    setExpandido(nuevoExpandido);
    if (nuevoExpandido && !resultado) {
      setCargando(true);
      setError('');
      try {
        const [{ data: datosResultado }, { data: datosFormacion }] = await Promise.all([
          api.get(`/partidos/${partido.id}/resultado`),
          api.get(`/partidos/${partido.id}/formacion`),
        ]);
        setResultado(datosResultado);
        setElegibles((datosFormacion.jugadores || []).filter((j) => j.equipo));
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
  }

  async function abrirVotacion() {
    setErrorVoto('');
    try {
      const { data } = await api.get(`/partidos/${partido.id}/votos/mios`);
      setVotosPropios(data);
      setVotoAbierto(true);
    } catch (err) {
      setErrorVoto(err.message);
    }
  }

  async function confirmarVoto(payload) {
    setVotando(true);
    setErrorVoto('');
    try {
      await api.post(`/partidos/${partido.id}/votos`, payload);
      setVotoAbierto(false);
      const { data } = await api.get(`/partidos/${partido.id}/resultado`);
      setResultado(data);
    } catch (err) {
      setErrorVoto(err.message);
    } finally {
      setVotando(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 shadow-lg">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</p>
          <p className="text-xs text-white/50">{cantidadJugadores} jugadores</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${expandido ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expandido && (
        <div className="border-t border-white/10 p-4">
          {cargando ? (
            <p className="text-sm text-white/50">Cargando resultado…</p>
          ) : error ? (
            <p className="text-sm text-sancion">{error}</p>
          ) : (
            <>
              <ResultadoPartido partido={partido} resultado={resultado} />
              {soyElegible && (
                <button
                  type="button"
                  onClick={abrirVotacion}
                  className="mt-3 w-full rounded-lg bg-pasto-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pasto-500"
                >
                  Calificar jugadores
                </button>
              )}
              {errorVoto && !votoAbierto && <p className="mt-2 text-sm text-sancion">{errorVoto}</p>}
            </>
          )}
        </div>
      )}

      <ModalVotarValoraciones
        abierto={votoAbierto}
        partido={partido}
        elegibles={elegibles.filter((j) => j.usuarioId !== perfil?.uid)}
        votosPropios={votosPropios}
        procesando={votando}
        error={errorVoto}
        onConfirmar={confirmarVoto}
        onCancelar={() => {
          setVotoAbierto(false);
          setErrorVoto('');
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `cd frontend && npm run dev`.
1. Loguearse como un jugador elegible (titular con equipo asignado) de un partido `jugado`, ir a `/historial`, expandir el partido.
2. Confirmar que aparece el botón "Calificar jugadores"; abrirlo, cargar un puntaje y elegir MVP, guardar.
3. Volver a abrir el modal: debe precargar el puntaje y MVP guardados (no volver a 5 por defecto).
4. Cerrar el modal y confirmar que el panel "Rendimiento de jugadores" del resumen ahora muestra el promedio actualizado.
5. Loguearse con un usuario no elegible del mismo partido: el botón "Calificar jugadores" no debe aparecer.

Expected: los 5 puntos se cumplen sin errores en consola.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ModalVotarValoraciones.jsx frontend/src/components/ItemHistorialPartido.jsx
git commit -m "feat(frontend): jugadores elegibles pueden votar valoraciones y mvp desde el historial"
```
