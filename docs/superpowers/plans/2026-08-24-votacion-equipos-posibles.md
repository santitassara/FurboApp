# Votación de Equipos Posibles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando se completa el cupo de titulares de un partido, el admin puede proponer hasta 5 arreglos de equipos (snapshots del armador existente) para que los titulares voten cuál prefieren; la propuesta más votada se aplica como formación oficial.

**Architecture:** Nuevo servicio `formacionesPropuestasService` sobre 3 tablas nuevas (`FormacionesPropuestas`, `FormacionesPropuestasDetalle`, `VotosFormacion`) y 2 columnas nuevas en `Partidos`. No reemplaza el armador existente (`inscripcionesService`/`MapaCancha.jsx`): lo envuelve. El frontend agrega un botón "Proponer para votación" en `MapaCancha.jsx`, un componente nuevo `EquiposPosibles.jsx` con la lista de propuestas votables, y usa el `MapaCancha` ya existente en modo solo-lectura para previsualizar una propuesta (sin crear una vista de cancha nueva).

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), React + Axios + TailwindCSS + @dnd-kit/core (frontend).

**Spec:** `docs/superpowers/specs/2026-08-24-votacion-equipos-posibles-design.md`

## Global Constraints

- Máximo 5 propuestas vivas por partido, numeradas 1-5 sin huecos reutilizables (si se borra la propuesta 3, la próxima creada vuelve a ocupar el 3, no el 6).
- Proponer y votar solo aplican si el cupo de titulares está completo (`habilitado`).
- Solo admin del grupo propone/borra propuestas/cierra manualmente. Solo titulares activos (`estado='anotado'`, `tipo='titular'`) votan, un voto por titular, puede cambiarlo.
- Cierre automático cuando `votos emitidos === titulares activos actuales`; cierre manual disponible en cualquier momento con ≥1 voto. Empate → gana menor `numero`.
- Baja de un titular (voluntaria o sanción manual) con propuestas vivas y votación aún no cerrada → se borran todas las propuestas/votos de ese partido. Si ya cerró, no se toca nada.
- Sin tests automatizados (preferencia del usuario para este proyecto) — cada task se verifica manualmente con un script Node descartable contra `SQLITE_DB_PATH=:memory:`, o a mano en el navegador para frontend.

---

## Task 1: Modelo de datos

**Files:**
- Modify: `backend/src/db/schema.sql` (agrega 3 tablas nuevas al final, antes de los índices)
- Modify: `backend/src/config/db.js` (migración en caliente de las 2 columnas nuevas en `Partidos`)

**Interfaces:**
- Produces: tablas `FormacionesPropuestas(id, partidoId, numero, creadoPor, fechaCreacion)`, `FormacionesPropuestasDetalle(id, propuestaId, usuarioId, equipo, linea, ordenLinea, lado)`, `VotosFormacion(id, partidoId, usuarioId, propuestaId, fecha)` con índices únicos `idx_formaciones_propuestas_numero (partidoId, numero)` e `idx_votos_formacion_unico (partidoId, usuarioId)`. Columnas `Partidos.votacionEquiposCerrada` (INTEGER 0/1) y `Partidos.propuestaGanadoraId` (TEXT nullable). Todo el código de las tasks siguientes asume este modelo.

- [ ] **Step 1: Agregar las tablas nuevas a `schema.sql`**

En `backend/src/db/schema.sql`, después de la tabla `SancionesPartido` (línea 112, antes de los `CREATE INDEX` finales), agregar:

```sql
CREATE TABLE IF NOT EXISTS FormacionesPropuestas (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  numero INTEGER NOT NULL,
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS FormacionesPropuestasDetalle (
  id TEXT PRIMARY KEY,
  propuestaId TEXT NOT NULL REFERENCES FormacionesPropuestas(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  linea TEXT,
  ordenLinea INTEGER,
  lado TEXT
);

CREATE TABLE IF NOT EXISTS VotosFormacion (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  propuestaId TEXT NOT NULL REFERENCES FormacionesPropuestas(id),
  fecha TEXT NOT NULL
);
```

Y junto a los índices existentes al final del archivo (después de la línea 117):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_formaciones_propuestas_numero ON FormacionesPropuestas (partidoId, numero);
CREATE INDEX IF NOT EXISTS idx_formaciones_propuestas_detalle_propuesta ON FormacionesPropuestasDetalle (propuestaId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_formacion_unico ON VotosFormacion (partidoId, usuarioId);
CREATE INDEX IF NOT EXISTS idx_votos_formacion_propuesta ON VotosFormacion (propuestaId);
```

- [ ] **Step 2: Migración en caliente de columnas en `Partidos`**

En `backend/src/config/db.js`, justo después del bloque que agrega `votacionCerrada` (el que termina con `db.exec('ALTER TABLE Partidos ADD COLUMN votacionCerrada INTEGER NOT NULL DEFAULT 0');` seguido de su `}`), agregar:

```js
const columnasPartidosVotacionEquipos = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneVotacionEquiposCerrada = columnasPartidosVotacionEquipos.some(
  (columna) => columna.name === 'votacionEquiposCerrada'
);
if (!tieneVotacionEquiposCerrada) {
  db.exec('ALTER TABLE Partidos ADD COLUMN votacionEquiposCerrada INTEGER NOT NULL DEFAULT 0');
}
const tienePropuestaGanadoraId = columnasPartidosVotacionEquipos.some(
  (columna) => columna.name === 'propuestaGanadoraId'
);
if (!tienePropuestaGanadoraId) {
  db.exec('ALTER TABLE Partidos ADD COLUMN propuestaGanadoraId TEXT REFERENCES FormacionesPropuestas(id)');
}
```

- [ ] **Step 3: Verificar manualmente**

Crear `/private/tmp/claude-501/-Users-santiagotassara-Documents-Apps-propias-proyectos-FurboApp/d2c79cfe-d4ef-403d-b202-ec2ea32cb262/scratchpad/verify-task1.js`:

```js
process.env.SQLITE_DB_PATH = ':memory:';
const { db } = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/config/db');

const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((f) => f.name);
console.assert(tablas.includes('FormacionesPropuestas'), 'falta FormacionesPropuestas');
console.assert(tablas.includes('FormacionesPropuestasDetalle'), 'falta FormacionesPropuestasDetalle');
console.assert(tablas.includes('VotosFormacion'), 'falta VotosFormacion');

const columnasPartidos = db.prepare('PRAGMA table_info(Partidos)').all().map((c) => c.name);
console.assert(columnasPartidos.includes('votacionEquiposCerrada'), 'falta votacionEquiposCerrada');
console.assert(columnasPartidos.includes('propuestaGanadoraId'), 'falta propuestaGanadoraId');

console.log('OK task 1');
```

Run: `cd "/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend" && node /private/tmp/claude-501/-Users-santiagotassara-Documents-Apps-propias-proyectos-FurboApp/d2c79cfe-d4ef-403d-b202-ec2ea32cb262/scratchpad/verify-task1.js`
Expected: `OK task 1` sin ningún "Assertion failed".

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js
git commit -m "feat(backend): modelo de datos para votación de equipos posibles"
```

---

## Task 2: `formacionesPropuestasService`

**Files:**
- Create: `backend/src/services/formacionesPropuestasService.js`

**Interfaces:**
- Consumes: `partidosService.obtenerPartido(partidoId, grupoId)` (existente), `usuariosService.obtenerUsuario(uid)` (existente).
- Produces (usadas por el controller en Task 4 y por los hooks en Task 3):
  - `crearPropuesta(partidoId, grupoId, creadoPor): Promise<void>`
  - `listarPropuestas(partidoId, grupoId, usuarioId): Promise<{ votacionEquiposCerrada: boolean, propuestaGanadoraId: string|null, miVoto: string|null, propuestas: Array<{ id, numero, votos, equipoA: Array<{usuarioId, nombre, posicionPrincipal, linea, ordenLinea, lado}>, equipoB: [...] }> }>`
  - `eliminarPropuestaAdmin(partidoId, grupoId, propuestaId): Promise<void>`
  - `votar(partidoId, grupoId, propuestaId, usuarioId): Promise<void>`
  - `cerrarManual(partidoId, grupoId): Promise<void>`
  - `manejarBajaDeTitular(partidoId): void` (síncrona, sin validar grupo — la llama código que ya lo validó)
  - `eliminarPorPartido(partidoId): void` (síncrona, para limpieza al eliminar un partido)

- [ ] **Step 1: Crear el servicio**

Crear `backend/src/services/formacionesPropuestasService.js`:

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

function contarTitularesActivos(partidoId) {
  return db
    .prepare(`SELECT COUNT(*) AS total FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`)
    .get(partidoId).total;
}

function listarTitularesConAsiento(partidoId) {
  return db
    .prepare(
      `SELECT usuarioId, equipo, linea, ordenLinea, lado FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`
    )
    .all(partidoId);
}

function siguienteNumeroLibre(partidoId) {
  const usados = new Set(
    db.prepare('SELECT numero FROM FormacionesPropuestas WHERE partidoId = ?').all(partidoId).map((f) => f.numero)
  );
  for (let numero = 1; numero <= 5; numero += 1) {
    if (!usados.has(numero)) return numero;
  }
  return null;
}

async function crearPropuesta(partidoId, grupoId, creadoPor) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const titulares = listarTitularesConAsiento(partidoId);
  if (titulares.length < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }
  if (titulares.some((titular) => !titular.equipo)) {
    throw crearError('Armá la formación en el mapa antes de proponerla para votación', 400);
  }

  const numero = siguienteNumeroLibre(partidoId);
  if (numero === null) throw crearError('Ya hay 5 propuestas para este partido', 400);

  const propuestaId = crypto.randomUUID();
  const crear = db.transaction(() => {
    db.prepare(
      `INSERT INTO FormacionesPropuestas (id, partidoId, numero, creadoPor, fechaCreacion)
       VALUES (@id, @partidoId, @numero, @creadoPor, @fechaCreacion)`
    ).run({ id: propuestaId, partidoId, numero, creadoPor, fechaCreacion: new Date().toISOString() });

    for (const titular of titulares) {
      db.prepare(
        `INSERT INTO FormacionesPropuestasDetalle (id, propuestaId, usuarioId, equipo, linea, ordenLinea, lado)
         VALUES (@id, @propuestaId, @usuarioId, @equipo, @linea, @ordenLinea, @lado)`
      ).run({ id: crypto.randomUUID(), propuestaId, ...titular });
    }
  });
  crear();
}

async function listarPropuestas(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const propuestas = db
    .prepare('SELECT id, numero FROM FormacionesPropuestas WHERE partidoId = ? ORDER BY numero ASC')
    .all(partidoId);

  const propuestasConDetalle = await Promise.all(
    propuestas.map(async (propuesta) => {
      const detalle = db
        .prepare('SELECT usuarioId, equipo, linea, ordenLinea, lado FROM FormacionesPropuestasDetalle WHERE propuestaId = ?')
        .all(propuesta.id);
      const conNombre = await Promise.all(
        detalle.map(async (fila) => {
          const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
          return { ...fila, nombre: usuario?.nombre || 'Jugador', posicionPrincipal: usuario?.posicionPrincipal || null };
        })
      );
      const votos = db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE propuestaId = ?').get(propuesta.id).total;
      return {
        id: propuesta.id,
        numero: propuesta.numero,
        votos,
        equipoA: conNombre.filter((jugador) => jugador.equipo === 'A'),
        equipoB: conNombre.filter((jugador) => jugador.equipo === 'B'),
      };
    })
  );

  const titularesActivos = new Set(listarTitularesConAsiento(partidoId).map((t) => t.usuarioId));
  let miVoto = null;
  if (titularesActivos.has(usuarioId)) {
    const fila = db.prepare('SELECT propuestaId FROM VotosFormacion WHERE partidoId = ? AND usuarioId = ?').get(partidoId, usuarioId);
    miVoto = fila ? fila.propuestaId : null;
  }

  return {
    votacionEquiposCerrada: Boolean(partido.votacionEquiposCerrada),
    propuestaGanadoraId: partido.propuestaGanadoraId || null,
    miVoto,
    propuestas: propuestasConDetalle,
  };
}

async function eliminarPropuestaAdmin(partidoId, grupoId, propuestaId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM VotosFormacion WHERE propuestaId = ?').run(propuestaId);
    db.prepare('DELETE FROM FormacionesPropuestasDetalle WHERE propuestaId = ?').run(propuestaId);
    return db.prepare('DELETE FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').run(propuestaId, partidoId).changes;
  });
  const cambios = borrar();
  if (cambios === 0) throw crearError('Propuesta no encontrada', 404);
}

function elegirGanadora(partidoId) {
  const filas = db
    .prepare(
      `SELECT p.id, p.numero, COUNT(v.id) AS votos
       FROM FormacionesPropuestas p
       LEFT JOIN VotosFormacion v ON v.propuestaId = p.id
       WHERE p.partidoId = ?
       GROUP BY p.id
       ORDER BY votos DESC, p.numero ASC`
    )
    .all(partidoId);
  return filas[0] || null;
}

function aplicarGanadora(partidoId, ganadoraId) {
  const detalle = db
    .prepare('SELECT usuarioId, equipo, linea, ordenLinea, lado FROM FormacionesPropuestasDetalle WHERE propuestaId = ?')
    .all(ganadoraId);

  const cerrar = db.transaction(() => {
    for (const asiento of detalle) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea, lado = @lado
         WHERE partidoId = @partidoId AND usuarioId = @usuarioId AND estado = 'anotado'`
      ).run({ ...asiento, partidoId });
    }
    db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 1, propuestaGanadoraId = ? WHERE id = ?').run(ganadoraId, partidoId);
  });
  cerrar();
}

async function votar(partidoId, grupoId, propuestaId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const propuesta = db.prepare('SELECT id FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').get(propuestaId, partidoId);
  if (!propuesta) throw crearError('Propuesta no encontrada', 404);

  const esTitular = listarTitularesConAsiento(partidoId).some((titular) => titular.usuarioId === usuarioId);
  if (!esTitular) throw crearError('Solo los titulares pueden votar', 403);

  db.prepare(
    `INSERT INTO VotosFormacion (id, partidoId, usuarioId, propuestaId, fecha)
     VALUES (@id, @partidoId, @usuarioId, @propuestaId, @fecha)
     ON CONFLICT(partidoId, usuarioId) DO UPDATE SET propuestaId = excluded.propuestaId, fecha = excluded.fecha`
  ).run({ id: crypto.randomUUID(), partidoId, usuarioId, propuestaId, fecha: new Date().toISOString() });

  const totalVotos = db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE partidoId = ?').get(partidoId).total;
  if (totalVotos >= contarTitularesActivos(partidoId)) {
    const ganadora = elegirGanadora(partidoId);
    aplicarGanadora(partidoId, ganadora.id);
  }
}

async function cerrarManual(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const ganadora = elegirGanadora(partidoId);
  if (!ganadora || ganadora.votos === 0) throw crearError('No hay votos para determinar una ganadora', 400);
  aplicarGanadora(partidoId, ganadora.id);
}

function borrarPropuestasYVotos(partidoId) {
  const propuestas = db.prepare('SELECT id FROM FormacionesPropuestas WHERE partidoId = ?').all(partidoId);
  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM VotosFormacion WHERE partidoId = ?').run(partidoId);
    for (const propuesta of propuestas) {
      db.prepare('DELETE FROM FormacionesPropuestasDetalle WHERE propuestaId = ?').run(propuesta.id);
    }
    db.prepare('DELETE FROM FormacionesPropuestas WHERE partidoId = ?').run(partidoId);
  });
  borrar();
}

function manejarBajaDeTitular(partidoId) {
  const partido = db.prepare('SELECT votacionEquiposCerrada FROM Partidos WHERE id = ?').get(partidoId);
  if (!partido || partido.votacionEquiposCerrada) return;
  borrarPropuestasYVotos(partidoId);
}

function eliminarPorPartido(partidoId) {
  borrarPropuestasYVotos(partidoId);
}

module.exports = {
  crearPropuesta,
  listarPropuestas,
  eliminarPropuestaAdmin,
  votar,
  cerrarManual,
  manejarBajaDeTitular,
  eliminarPorPartido,
};
```

- [ ] **Step 2: Verificar manualmente**

Crear `/private/tmp/claude-501/-Users-santiagotassara-Documents-Apps-propias-proyectos-FurboApp/d2c79cfe-d4ef-403d-b202-ec2ea32cb262/scratchpad/verify-task2.js`:

```js
process.env.SQLITE_DB_PATH = ':memory:';
const crypto = require('node:crypto');
const { db } = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/config/db');
const usuariosService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/usuariosService');
const partidosService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/partidosService');
const formacionesPropuestasService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/formacionesPropuestasService');

const GRUPO_ID = 'grupo-1';

async function main() {
  const admin = await usuariosService.sincronizarUsuario({ uid: 'admin-1', email: 'admin@gmail.com', nombre: 'Admin' });
  const partido = await partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 0,
    creadoPor: admin.uid,
    grupoId: GRUPO_ID,
  });

  const titulares = ['t1', 't2'];
  for (const uid of titulares) {
    await usuariosService.sincronizarUsuario({ uid, email: `${uid}@gmail.com`, nombre: uid });
    db.prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo, linea, ordenLinea, lado)
       VALUES (@id, @partidoId, @usuarioId, 'anotado', 'titular', 0, '2026-01-01T00:00:00.000Z', @equipo, 'arquero', 0, null)`
    ).run({ id: crypto.randomUUID(), partidoId: partido.id, usuarioId: uid, equipo: uid === 't1' ? 'A' : 'B' });
  }

  await formacionesPropuestasService.crearPropuesta(partido.id, GRUPO_ID, admin.uid);
  let estado = await formacionesPropuestasService.listarPropuestas(partido.id, GRUPO_ID, 't1');
  console.assert(estado.propuestas.length === 1, 'debería haber 1 propuesta');
  console.assert(estado.propuestas[0].numero === 1, 'la primera propuesta debe ser numero 1');

  const propuestaId = estado.propuestas[0].id;
  await formacionesPropuestasService.votar(partido.id, GRUPO_ID, propuestaId, 't1');
  estado = await formacionesPropuestasService.listarPropuestas(partido.id, GRUPO_ID, 't1');
  console.assert(estado.propuestas[0].votos === 1, 'debería haber 1 voto');
  console.assert(estado.votacionEquiposCerrada === false, 'no debería cerrar con 1 de 2 votos');

  await formacionesPropuestasService.votar(partido.id, GRUPO_ID, propuestaId, 't2');
  estado = await formacionesPropuestasService.listarPropuestas(partido.id, GRUPO_ID, 't1');
  console.assert(estado.votacionEquiposCerrada === true, 'debería cerrar automáticamente con todos los votos');
  console.assert(estado.propuestaGanadoraId === propuestaId, 'la ganadora debe ser la única propuesta');

  console.log('OK task 2');
}

main().catch((err) => {
  console.error('FALLÓ', err);
  process.exit(1);
});
```

Run: `cd "/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend" && node /private/tmp/claude-501/-Users-santiagotassara-Documents-Apps-propias-proyectos-FurboApp/d2c79cfe-d4ef-403d-b202-ec2ea32cb262/scratchpad/verify-task2.js`
Expected: `OK task 2` sin "Assertion failed" ni "FALLÓ".

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/formacionesPropuestasService.js
git commit -m "feat(backend): servicio de propuestas y votación de equipos"
```

---

## Task 3: Hooks de limpieza al dar de baja o eliminar un partido

**Files:**
- Modify: `backend/src/services/inscripcionesService.js:1-8` (require), `:83-98` (`bajarse`), `:100-112` (`sancionarManualmente`)
- Modify: `backend/src/services/partidosService.js:65-73` (`eliminarPartido`)

**Interfaces:**
- Consumes: `formacionesPropuestasService.manejarBajaDeTitular(partidoId)` y `formacionesPropuestasService.eliminarPorPartido(partidoId)` (de Task 2).

- [ ] **Step 1: Enganchar la limpieza en `inscripcionesService.js`**

Agregar el require junto a los demás, al principio del archivo (después de la línea 6 `const { sonPosicionesValidas } = ...`):

```js
const formacionesPropuestasService = require('./formacionesPropuestasService');
```

En la función `bajarse` (líneas 93-95), cambiar:

```js
  if (inscripcion.tipo === 'titular') {
    await gruposService.sancionar(grupoId, usuarioId);
  }
```

por:

```js
  if (inscripcion.tipo === 'titular') {
    await gruposService.sancionar(grupoId, usuarioId);
    formacionesPropuestasService.manejarBajaDeTitular(partidoId);
  }
```

En la función `sancionarManualmente` (líneas 108-109), cambiar:

```js
  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);
  await gruposService.sancionar(grupoId, usuarioId);

  return { ...inscripcion, estado: 'dado_de_baja' };
```

por:

```js
  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);
  await gruposService.sancionar(grupoId, usuarioId);
  formacionesPropuestasService.manejarBajaDeTitular(partidoId);

  return { ...inscripcion, estado: 'dado_de_baja' };
```

- [ ] **Step 2: Enganchar la limpieza en `partidosService.js`**

En `eliminarPartido` (líneas 65-73), cambiar:

```js
  const resultadosService = require('./resultadosService');
  const inscripcionesService = require('./inscripcionesService');
  const eliminar = db.transaction(() => {
    resultadosService.eliminarPorPartido(partidoId);
    inscripcionesService.eliminarPorPartido(partidoId);
    db.prepare('DELETE FROM Partidos WHERE id = ?').run(partidoId);
  });
  eliminar();
```

por:

```js
  const resultadosService = require('./resultadosService');
  const inscripcionesService = require('./inscripcionesService');
  const formacionesPropuestasService = require('./formacionesPropuestasService');
  const eliminar = db.transaction(() => {
    resultadosService.eliminarPorPartido(partidoId);
    inscripcionesService.eliminarPorPartido(partidoId);
    formacionesPropuestasService.eliminarPorPartido(partidoId);
    db.prepare('DELETE FROM Partidos WHERE id = ?').run(partidoId);
  });
  eliminar();
```

- [ ] **Step 3: Verificar manualmente**

Crear `/private/tmp/claude-501/-Users-santiagotassara-Documents-Apps-propias-proyectos-FurboApp/d2c79cfe-d4ef-403d-b202-ec2ea32cb262/scratchpad/verify-task3.js`:

```js
process.env.SQLITE_DB_PATH = ':memory:';
const crypto = require('node:crypto');
const { db } = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/config/db');
const usuariosService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/usuariosService');
const partidosService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/partidosService');
const gruposService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/gruposService');
const inscripcionesService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/inscripcionesService');
const formacionesPropuestasService = require('/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend/src/services/formacionesPropuestasService');

const GRUPO_ID = 'grupo-1';

async function main() {
  const admin = await usuariosService.sincronizarUsuario({ uid: 'admin-1', email: 'admin@gmail.com', nombre: 'Admin' });
  db.prepare(
    `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion) VALUES (?, 'G', 'COD1', ?, '2026-01-01T00:00:00.000Z')`
  ).run(GRUPO_ID, admin.uid);
  db.prepare(
    `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso) VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
  ).run(crypto.randomUUID(), GRUPO_ID, 't1');
  db.prepare(
    `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso) VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
  ).run(crypto.randomUUID(), GRUPO_ID, 't2');

  const partido = await partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 0,
    creadoPor: admin.uid,
    grupoId: GRUPO_ID,
  });

  for (const uid of ['t1', 't2']) {
    await usuariosService.sincronizarUsuario({ uid, email: `${uid}@gmail.com`, nombre: uid });
    db.prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo, linea, ordenLinea, lado)
       VALUES (@id, @partidoId, @usuarioId, 'anotado', 'titular', 0, '2026-01-01T00:00:00.000Z', @equipo, 'arquero', 0, null)`
    ).run({ id: crypto.randomUUID(), partidoId: partido.id, usuarioId: uid, equipo: uid === 't1' ? 'A' : 'B' });
  }

  await formacionesPropuestasService.crearPropuesta(partido.id, GRUPO_ID, admin.uid);
  let estado = await formacionesPropuestasService.listarPropuestas(partido.id, GRUPO_ID, 't1');
  console.assert(estado.propuestas.length === 1, 'debería haber 1 propuesta antes de la baja');

  await inscripcionesService.bajarse(partido.id, GRUPO_ID, 't1');

  estado = await formacionesPropuestasService.listarPropuestas(partido.id, GRUPO_ID, 't2');
  console.assert(estado.propuestas.length === 0, 'la baja de un titular debe borrar las propuestas');

  console.log('OK task 3');
}

main().catch((err) => {
  console.error('FALLÓ', err);
  process.exit(1);
});
```

Run: `cd "/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend" && node /private/tmp/claude-501/-Users-santiagotassara-Documents-Apps-propias-proyectos-FurboApp/d2c79cfe-d4ef-403d-b202-ec2ea32cb262/scratchpad/verify-task3.js`
Expected: `OK task 3`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/inscripcionesService.js backend/src/services/partidosService.js
git commit -m "feat(backend): descarta propuestas de equipos al dar de baja un titular o eliminar el partido"
```

---

## Task 4: Controller y rutas API

**Files:**
- Create: `backend/src/controllers/formacionesPropuestasController.js`
- Modify: `backend/src/routes/partidosRoutes.js`

**Interfaces:**
- Consumes: `formacionesPropuestasService.*` (Task 2).
- Produces: endpoints `POST|GET /:partidoId/formaciones-propuestas`, `DELETE /:partidoId/formaciones-propuestas/:propuestaId`, `POST /:partidoId/formaciones-propuestas/:propuestaId/votar`, `POST /:partidoId/formaciones-propuestas/cerrar`, todos bajo `/api/grupos/:grupoId/partidos`. Usados por el frontend en Tasks 5-7.

- [ ] **Step 1: Crear el controller**

Crear `backend/src/controllers/formacionesPropuestasController.js`:

```js
const formacionesPropuestasService = require('../services/formacionesPropuestasService');

async function crear(req, res) {
  await formacionesPropuestasService.crearPropuesta(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.status(201).json(propuestas);
}

async function listar(req, res) {
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function eliminar(req, res) {
  await formacionesPropuestasService.eliminarPropuestaAdmin(req.params.partidoId, req.params.grupoId, req.params.propuestaId);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function votar(req, res) {
  await formacionesPropuestasService.votar(req.params.partidoId, req.params.grupoId, req.params.propuestaId, req.usuario.uid);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function cerrar(req, res) {
  await formacionesPropuestasService.cerrarManual(req.params.partidoId, req.params.grupoId);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

module.exports = { crear, listar, eliminar, votar, cerrar };
```

- [ ] **Step 2: Agregar las rutas**

En `backend/src/routes/partidosRoutes.js`, agregar el require junto a los demás controllers (después de la línea 8):

```js
const formacionesPropuestasController = require('../controllers/formacionesPropuestasController');
```

Y agregar las rutas, después del bloque de `votos`/`cerrar-votacion` (después de la línea 60, antes de `module.exports = router;`):

```js
router.post(
  '/:partidoId/formaciones-propuestas',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(formacionesPropuestasController.crear)
);
router.get(
  '/:partidoId/formaciones-propuestas',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(formacionesPropuestasController.listar)
);
router.delete(
  '/:partidoId/formaciones-propuestas/:propuestaId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(formacionesPropuestasController.eliminar)
);
router.post(
  '/:partidoId/formaciones-propuestas/:propuestaId/votar',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(formacionesPropuestasController.votar)
);
router.post(
  '/:partidoId/formaciones-propuestas/cerrar',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(formacionesPropuestasController.cerrar)
);
```

- [ ] **Step 3: Verificar manualmente (servidor real + curl)**

Levantar el backend: `cd "/Users/santiagotassara/Documents/Apps propias proyectos/FurboApp/backend" && npm run dev`

Con un token válido de un admin de un grupo con un partido cuyo cupo de titulares ya esté completo y con formación ya armada (`PUT .../formacion` guardado):

```bash
curl -s -X POST "http://localhost:4000/api/grupos/<grupoId>/partidos/<partidoId>/formaciones-propuestas" \
  -H "Authorization: Bearer <token-admin>" | head -c 500
```

Expected: JSON con `"propuestas":[{"id":"...","numero":1,"votos":0,...}]`.

```bash
curl -s "http://localhost:4000/api/grupos/<grupoId>/partidos/<partidoId>/formaciones-propuestas" \
  -H "Authorization: Bearer <token-titular>" | head -c 500
```

Expected: mismo listado, con `"miVoto":null` si ese titular no votó todavía.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/formacionesPropuestasController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): endpoints de propuestas y votación de equipos"
```

---

## Task 5: `MapaCancha.jsx` — modo preview y botón "Proponer para votación"

**Files:**
- Modify: `frontend/src/components/MapaCancha.jsx`

**Interfaces:**
- Consumes: `POST /formaciones-propuestas` (Task 4).
- Produces: nuevas props del componente `MapaCancha`: `propuestasInfo` (`{ votacionEquiposCerrada, propuestas }` o `undefined`), `previewPropuesta` (array de asientos `{usuarioId, nombre, equipo, linea, ordenLinea, lado}` o `null`), `onPropuesto` (`() => Promise<void>`, llamada tras proponer con éxito), `onSalirPreview` (`() => void`). Usadas por `Home.jsx` en Task 7.

- [ ] **Step 1: Agregar las props nuevas y el estado de preview**

En `frontend/src/components/MapaCancha.jsx`, cambiar la firma del componente (línea 280):

```js
export default function MapaCancha({ partidoId, formacion, esAdmin, onGuardado }) {
```

por:

```js
export default function MapaCancha({
  partidoId,
  formacion,
  esAdmin,
  onGuardado,
  propuestasInfo,
  previewPropuesta,
  onPropuesto,
  onSalirPreview,
}) {
```

Justo después de `const [error, setError] = useState('');` (línea 288), agregar:

```js
  const [proponiendo, setProponiendo] = useState(false);
  const modoPreview = Boolean(previewPropuesta);
```

- [ ] **Step 2: Usar los asientos de preview en el render en vez de `ubicaciones`**

Después del early-return de `!formacion || !formacion.habilitado` (línea 315), agregar:

```js

  const ubicacionesMostradas = modoPreview ? previewPropuesta : ubicaciones;
```

Cambiar (líneas 321-336) las definiciones de `estructuraA`/`estructuraB` para partir de `ubicacionesMostradas` y, en preview, ignorar la selección de formación:

```js
  const estructuraA = modoPreview
    ? estructuraDesdeUbicaciones(ubicacionesMostradas, 'A')
    : seleccionA.codigo === CODIGO_AUTOMATICO
      ? ubicaciones.some((j) => j.equipo === 'A')
        ? estructuraDesdeUbicaciones(ubicaciones, 'A')
        : ordenarLineas(normalizarAutomatico(formacion.cupoPorEquipo.A))
      : seleccionA.codigo === CODIGO_LIBRE
        ? ordenarLineas(seleccionA.lineas)
        : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.A).find((f) => f.codigo === seleccionA.codigo)?.lineas || []);
  const estructuraB = modoPreview
    ? estructuraDesdeUbicaciones(ubicacionesMostradas, 'B')
    : seleccionB.codigo === CODIGO_AUTOMATICO
      ? ubicaciones.some((j) => j.equipo === 'B')
        ? estructuraDesdeUbicaciones(ubicaciones, 'B')
        : ordenarLineas(normalizarAutomatico(formacion.cupoPorEquipo.B))
      : seleccionB.codigo === CODIGO_LIBRE
        ? ordenarLineas(seleccionB.lineas)
        : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.B).find((f) => f.codigo === seleccionB.codigo)?.lineas || []);
```

- [ ] **Step 3: Agregar la función `proponerParaVotacion`**

Después de la función `guardar` (después de la línea 428, antes de `const contenido = (`), agregar:

```js
  async function proponerParaVotacion() {
    setError('');
    setProponiendo(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formaciones-propuestas`));
      await onPropuesto?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProponiendo(false);
    }
  }
```

- [ ] **Step 4: Actualizar el render — banner de preview, ocultar controles de admin en preview, agregar botón de proponer, usar `ubicacionesMostradas` en el tablero y `draggable` correcto**

Reemplazar el bloque `const contenido = (...)` completo (líneas 430-495) por:

```js
  const contenido = (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-pasto-500">Formación</h4>

      {modoPreview && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-pasto-600/20 px-3 py-2 text-xs text-white">
          <span>Vista previa de una propuesta</span>
          <button type="button" className="underline" onClick={onSalirPreview}>
            Volver a formación oficial
          </button>
        </div>
      )}

      {esAdmin && !modoPreview && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectorFormacion
            etiqueta="Equipo 1"
            cantidadJugadores={formacion.cupoPorEquipo.A}
            seleccion={seleccionA}
            onCambiar={(nueva) => cambiarSeleccion('A', nueva)}
            disabled={generando || guardando}
          />
          <SelectorFormacion
            etiqueta="Equipo 2"
            cantidadJugadores={formacion.cupoPorEquipo.B}
            seleccion={seleccionB}
            onCambiar={(nueva) => cambiarSeleccion('B', nueva)}
            disabled={generando || guardando}
          />
        </div>
      )}

      <div
        className="flex aspect-[1.83] w-full overflow-hidden rounded-lg border border-white/10 bg-cover bg-center shadow-inner"
        style={{ backgroundImage: "url('/layout-cancha-futbol.jpeg')" }}
      >
        <MitadCancha equipo="A" estructura={estructuraA} ubicaciones={ubicacionesMostradas} draggable={esAdmin && !modoPreview} />
        <div className="w-px bg-white/20" />
        <MitadCancha equipo="B" estructura={estructuraB} ubicaciones={ubicacionesMostradas} draggable={esAdmin && !modoPreview} />
      </div>

      {esAdmin && !modoPreview && sinUbicar.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase text-white/40">Sin ubicar</p>
          <div className="flex flex-wrap gap-2">
            {sinUbicar.map((jugador) => (
              <Jugador key={jugador.usuarioId} usuarioId={jugador.usuarioId} nombre={jugador.nombre} draggable />
            ))}
          </div>
        </div>
      )}

      {esAdmin && !modoPreview && (
        <>
          {error && <p className="mt-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
          <Boton
            variante="ghost"
            className="mt-4 w-full"
            onClick={generarAutomaticamente}
            disabled={generando || guardando || seleccionInvalida}
          >
            {generando ? 'Generando…' : 'Generar equipos automáticos'}
          </Boton>
          <Boton
            variante="primario"
            className="mt-2 w-full"
            onClick={guardar}
            disabled={guardando || seleccionInvalida}
          >
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
          {!propuestasInfo?.votacionEquiposCerrada && (
            <Boton
              variante="ghost"
              className="mt-2 w-full"
              onClick={proponerParaVotacion}
              disabled={proponiendo || guardando || seleccionInvalida || (propuestasInfo?.propuestas?.length || 0) >= 5}
            >
              {proponiendo ? 'Proponiendo…' : 'Proponer para votación'}
            </Boton>
          )}
        </>
      )}
    </div>
  );

  if (!esAdmin || modoPreview) return contenido;
```

(La línea final `return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;` que sigue queda igual — solo se le agregó la condición `|| modoPreview` al `if` anterior.)

- [ ] **Step 5: Verificar manualmente en el navegador**

Levantar backend y frontend (`npm run dev` en ambas carpetas). Como admin, completar el cupo de titulares de un partido, armar una formación (auto o manual) y guardarla. Confirmar que aparece el botón nuevo "Proponer para votación" debajo de "Guardar formación", y que al hacer click no tira error en consola (la lista de propuestas todavía no se ve porque eso es Task 6/7 — alcanza con que el botón exista y el `POST` no falle en Network tab).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MapaCancha.jsx
git commit -m "feat(frontend): boton proponer para votacion y modo preview en MapaCancha"
```

---

## Task 6: `EquiposPosibles.jsx` — componente nuevo

**Files:**
- Create: `frontend/src/components/EquiposPosibles.jsx`

**Interfaces:**
- Consumes: `POST .../formaciones-propuestas/:id/votar`, `DELETE .../formaciones-propuestas/:id`, `POST .../formaciones-propuestas/cerrar` (Task 4).
- Produces: componente `EquiposPosibles({ grupoId, partidoId, datos, esAdmin, soyTitular, onActualizado, onVerEnCancha })` donde `datos` es la respuesta de `GET .../formaciones-propuestas` (Task 2/4), `onActualizado: () => Promise<void>`, `onVerEnCancha: (propuesta) => void`. Usado por `Home.jsx` en Task 7.

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/components/EquiposPosibles.jsx`:

```jsx
import { useState } from 'react';
import api from '../services/api';
import Boton from './Boton';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function EquiposPosibles({ grupoId, partidoId, datos, esAdmin, soyTitular, onActualizado, onVerEnCancha }) {
  const [procesando, setProcesando] = useState(null);
  const [expandidoId, setExpandidoId] = useState(null);
  const [error, setError] = useState('');

  if (!datos || datos.propuestas.length === 0) return null;

  const { votacionEquiposCerrada, propuestaGanadoraId, miVoto, propuestas } = datos;

  async function votar(propuestaId) {
    setError('');
    setProcesando(propuestaId);
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}/votar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function eliminar(propuestaId) {
    setError('');
    setProcesando(propuestaId);
    try {
      await api.delete(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function cerrarVotacion() {
    setError('');
    setProcesando('cerrar');
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/cerrar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-pasto-500">Equipos posibles</h4>
        {esAdmin && !votacionEquiposCerrada && (
          <Boton variante="ghost" onClick={cerrarVotacion} disabled={procesando === 'cerrar'}>
            {procesando === 'cerrar' ? 'Cerrando…' : 'Cerrar votación'}
          </Boton>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      <div className="flex flex-col gap-2">
        {propuestas.map((propuesta) => {
          const expandido = expandidoId === propuesta.id;
          const esGanadora = propuestaGanadoraId === propuesta.id;
          const esMiVoto = miVoto === propuesta.id;

          return (
            <div key={propuesta.id} className="rounded-lg border border-white/10 bg-cancha-700">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-white"
                onClick={() => setExpandidoId(expandido ? null : propuesta.id)}
              >
                <span className="font-semibold">
                  Equipos posibles {propuesta.numero}
                  {esGanadora && <span className="ml-2 rounded bg-pasto-600 px-2 py-0.5 text-xs">Ganadora</span>}
                  {esMiVoto && !esGanadora && <span className="ml-2 text-xs text-pasto-500">Tu voto</span>}
                </span>
                <span className="text-white/60">
                  {propuesta.votos} voto{propuesta.votos === 1 ? '' : 's'}
                </span>
              </button>

              {expandido && (
                <div className="border-t border-white/10 px-4 py-3 text-sm text-white/80">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs uppercase text-white/40">Equipo A</p>
                      {propuesta.equipoA.map((jugador) => (
                        <p key={jugador.usuarioId}>{jugador.nombre}</p>
                      ))}
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase text-white/40">Equipo B</p>
                      {propuesta.equipoB.map((jugador) => (
                        <p key={jugador.usuarioId}>{jugador.nombre}</p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Boton variante="ghost" onClick={() => onVerEnCancha(propuesta)}>
                      Ver en cancha
                    </Boton>
                    {soyTitular && !votacionEquiposCerrada && (
                      <Boton variante="primario" onClick={() => votar(propuesta.id)} disabled={procesando === propuesta.id}>
                        {esMiVoto ? 'Votaste esta' : procesando === propuesta.id ? 'Votando…' : 'Votar esta'}
                      </Boton>
                    )}
                    {esAdmin && !votacionEquiposCerrada && (
                      <Boton variante="peligro" onClick={() => eliminar(propuesta.id)} disabled={procesando === propuesta.id}>
                        Eliminar
                      </Boton>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente en el navegador**

Con backend y frontend levantados, y al menos una propuesta creada (Task 5), montar `EquiposPosibles` temporalmente en `Home.jsx` (esto se conecta de forma definitiva en Task 7) o verificar vía React DevTools que el componente renderiza la card "Equipos posibles 1" con "0 votos" y que expandirla muestra las listas de Equipo A / Equipo B con nombres reales.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EquiposPosibles.jsx
git commit -m "feat(frontend): componente EquiposPosibles"
```

---

## Task 7: `Home.jsx` — wiring completo

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `GET .../formaciones-propuestas` (Task 4), `MapaCancha` con las props nuevas (Task 5), `EquiposPosibles` (Task 6).

- [ ] **Step 1: Importar `EquiposPosibles` y agregar estado nuevo**

En `frontend/src/pages/Home.jsx`, agregar el import después de la línea 11 (`import PartidoConEstado from '../components/PartidoConEstado';`):

```js
import EquiposPosibles from '../components/EquiposPosibles';
```

Después de `const [formacionesPorPartido, setFormacionesPorPartido] = useState({});` (línea 19), agregar:

```js
  const [propuestasPorPartido, setPropuestasPorPartido] = useState({});
  const [previewPorPartido, setPreviewPorPartido] = useState({});
```

- [ ] **Step 2: Cargar las propuestas junto con la formación**

En `cargarPartidos`, después del bloque que llena `formacionesPorPartido` (después de la línea 56 `setFormacionesPorPartido(Object.fromEntries(entradasFormacion));`), agregar:

```js

      const entradasPropuestas = await Promise.all(
        partidosAbiertos
          .filter(
            (partido) =>
              partido.estado !== 'jugado' && (partido.ocupados?.titulares || 0) >= partido.cupoTitulares
          )
          .map(async (partido) => {
            const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formaciones-propuestas`));
            return [partido.id, data];
          })
      );
      setPropuestasPorPartido(Object.fromEntries(entradasPropuestas));
```

- [ ] **Step 3: Pasar las props nuevas a `MapaCancha` y renderizar `EquiposPosibles`**

Reemplazar el bloque del `MapaCancha` dentro del `.map` de partidos (líneas 175-182):

```jsx
                {formacionesPorPartido[partido.id] && (
                  <MapaCancha
                    partidoId={partido.id}
                    formacion={formacionesPorPartido[partido.id]}
                    esAdmin={grupoActivo?.rol === 'admin'}
                    onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
                  />
                )}
```

por:

```jsx
                {formacionesPorPartido[partido.id] && (
                  <MapaCancha
                    partidoId={partido.id}
                    formacion={formacionesPorPartido[partido.id]}
                    esAdmin={grupoActivo?.rol === 'admin'}
                    onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
                    propuestasInfo={propuestasPorPartido[partido.id]}
                    previewPropuesta={previewPorPartido[partido.id] || null}
                    onPropuesto={cargarPartidos}
                    onSalirPreview={() => setPreviewPorPartido((anterior) => ({ ...anterior, [partido.id]: null }))}
                  />
                )}
```

Y agregar `EquiposPosibles` justo después del cierre del `<div className={...grid...}>` que contiene `MapaCancha` y `TarjetaPartido` (después de la línea 194 `</div>`, antes de `</PartidoConEstado>` en la línea 195):

```jsx
              {propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (
                <EquiposPosibles
                  grupoId={grupoActivo.id}
                  partidoId={partido.id}
                  datos={propuestasPorPartido[partido.id]}
                  esAdmin={grupoActivo?.rol === 'admin'}
                  soyTitular={inscripcionDelUsuario(partido.id)?.tipo === 'titular'}
                  onActualizado={cargarPartidos}
                  onVerEnCancha={(propuesta) =>
                    setPreviewPorPartido((anterior) => ({
                      ...anterior,
                      [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
                    }))
                  }
                />
              )}
```

- [ ] **Step 4: Verificar manualmente en el navegador (flujo completo)**

Con backend y frontend levantados, usando dos usuarios (uno admin, uno titular) en el mismo grupo con un partido cuyo cupo de titulares está completo:

1. Como admin: armar formación (auto o manual), guardar, click "Proponer para votación" → aparece la card "Equipos posibles 1" con "0 votos" debajo del mapa.
2. Repetir "Proponer para votación" (sin cambiar nada o cambiando algo) hasta 5 veces → al llegar a 5 el botón se deshabilita.
3. Como titular: expandir una card, ver los nombres agrupados en Equipo A / Equipo B, click "Ver en cancha" → el `MapaCancha` de ese partido muestra el banner "Vista previa de una propuesta" con esos jugadores ubicados; click "Volver a formación oficial" → vuelve a la formación real y editable (si es admin).
4. Como titular: click "Votar esta" → el contador sube a "1 voto" y la card muestra "Tu voto".
5. Votar con el resto de los titulares hasta completar el cupo → la votación cierra sola, aparece el badge "Ganadora" en la propuesta más votada, y el `MapaCancha` oficial refleja esa formación.
6. Como admin: editar manualmente algún jugador en el mapa oficial (ya cerrada la votación) y "Guardar formación" → guarda sin reabrir la votación ni mostrar error.
7. Dar de baja a un titular antes de que la votación cierre en un partido nuevo con propuestas creadas → las propuestas desaparecen de la pantalla tras refrescar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat(frontend): integra votacion de equipos posibles en Home"
```
