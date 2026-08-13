# Mapa interactivo de cancha para armar equipos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un mapa interactivo de cancha, visible al lado del listado de titulares/suplentes en `Home.jsx`, donde el admin arrastra a cada titular hacia un spot de una formación (arquero/defensa/medio/delantero) dividida en Equipo A / Equipo B, una vez completo el cupo de titulares. La formación se persiste y cualquier jugador logueado la ve en modo solo lectura.

**Architecture:** 3 columnas nuevas planas en `Inscripciones` (`equipo`, `linea`, `ordenLinea`), mismo patrón que las columnas de posición ya existentes. Un algoritmo determinístico (`generarLineas`/`splitEquipos`, duplicado en backend y frontend, mismo patrón que `constants/posiciones.js`) calcula cuántos spots hay por línea y por equipo a partir de `cupoTitulares`. Dos endpoints nuevos: `GET /api/partidos/:id/formacion` (lectura, cualquier usuario autenticado) y `PUT /api/partidos/:id/formacion` (guardado bulk, solo admin, valida que el tablero completo coincida exactamente con la formación esperada). Un componente nuevo `MapaCancha.jsx` con `@dnd-kit/core` para el drag&drop, integrado en `Home.jsx` junto a `TarjetaPartido`.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React + React Router + Tailwind + `@dnd-kit/core` (frontend), Jest (tests de backend existentes, no se agregan tests nuevos).

**Spec:** `docs/superpowers/specs/2026-08-13-mapa-cancha-equipos-design.md`

## Global Constraints

- Columnas nuevas en `Inscripciones`, todas nullable: `equipo` (TEXT, `'A'` | `'B'`), `linea` (TEXT, uno de `arquero`/`defensa`/`medio`/`delantero`), `ordenLinea` (INTEGER, ≥ 0).
- Split de equipos: `Math.ceil(cupoTitulares / 2)` para el Equipo A, `Math.floor(cupoTitulares / 2)` para el Equipo B.
- Algoritmo de líneas: 1 arquero (si hay al menos 1 jugador), resto repartido en tercios entre defensa/medio/delantero; el resto de la división (0, 1 o 2 jugadores extra) se reparte primero a medio, luego a defensa, luego a delantero. Determinístico, sin estado, mismo resultado en backend y frontend.
- El mapa (`GET`/render) solo se considera habilitado cuando `ocupados.titulares >= partido.cupoTitulares`. `Home.jsx` no pide `/formacion` para partidos que no cumplen esto.
- `PUT /formacion` exige que el array de asignaciones cubra exactamente a todos los titulares activos del partido (sin duplicados, sin ids ajenos) y que los conteos por equipo y por línea coincidan exactamente con lo que generan `splitEquipos`/`generarLineas` — cualquier desvío es 400.
- Un titular dado de baja después de guardada la formación no se reasigna automáticamente: su slot queda vacío, el admin lo reordena a mano arrastrando a otro jugador ahí.
- No se agregan tests automatizados nuevos para esta feature (preferencia explícita del usuario para este proyecto). Verificar manualmente con `node -e` contra `SQLITE_DB_PATH=:memory:` (o `crearDbDeTest`-style en memoria) y correr la suite existente (`npm test`) como regresión.
- Seguir el patrón de nombres en español ya usado en el proyecto y el patrón de errores existente (`error.status` + `manejadorErrores.js` → `{ error: mensaje }`).
- Migraciones de esquema en `db.js` siguen el patrón ya usado (chequear con `PRAGMA table_info` y `ALTER TABLE ... ADD COLUMN` si falta), porque el archivo sqlite de desarrollo ya existe.

---

### Task 1: Esquema, migración y algoritmo de formación (backend)

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js`
- Create: `backend/src/utils/formacion.js`

**Interfaces:**
- Produces: `LINEAS` (array de 4 strings: `['arquero', 'defensa', 'medio', 'delantero']`), `generarLineas(cantidadJugadores)` → `{ arquero, defensa, medio, delantero }` (conteos), `splitEquipos(cupoTitulares)` → `{ A, B }` (conteos). Consumidos por `inscripcionesService` en Task 2.

- [ ] **Step 1: Crear el algoritmo de formación**

Crear `backend/src/utils/formacion.js`:

```js
const LINEAS = ['arquero', 'defensa', 'medio', 'delantero'];

function generarLineas(cantidadJugadores) {
  if (cantidadJugadores <= 0) return { arquero: 0, defensa: 0, medio: 0, delantero: 0 };
  if (cantidadJugadores === 1) return { arquero: 1, defensa: 0, medio: 0, delantero: 0 };

  const resto = cantidadJugadores - 1;
  const base = Math.floor(resto / 3);
  const extra = resto % 3;
  const lineas = { arquero: 1, defensa: base, medio: base, delantero: base };

  const ordenReparto = ['medio', 'defensa', 'delantero'];
  for (let i = 0; i < extra; i++) lineas[ordenReparto[i]]++;

  return lineas;
}

function splitEquipos(cupoTitulares) {
  return {
    A: Math.ceil(cupoTitulares / 2),
    B: Math.floor(cupoTitulares / 2),
  };
}

module.exports = { LINEAS, generarLineas, splitEquipos };
```

- [ ] **Step 2: Agregar las columnas al esquema (para DBs nuevas)**

En `backend/src/db/schema.sql`, el `CREATE TABLE IF NOT EXISTS Inscripciones` queda:

```sql
CREATE TABLE IF NOT EXISTS Inscripciones (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  estado TEXT NOT NULL CHECK (estado IN ('anotado', 'dado_de_baja')),
  tipo TEXT NOT NULL CHECK (tipo IN ('titular', 'suplente')),
  orden INTEGER NOT NULL,
  fechaInscripcion TEXT NOT NULL,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT,
  equipo TEXT,
  linea TEXT,
  ordenLinea INTEGER
);
```

(El resto del archivo — `Usuarios`, `Partidos`, el índice — no cambia.)

- [ ] **Step 3: Migrar la DB existente en `db.js`**

En `backend/src/config/db.js`, después del bloque que agrega `posicionSecundaria` a `Inscripciones` (después del `if (!tienePosicionSecundariaInscripcion) { ... }`, antes de `module.exports`), agregar:

```js
const columnasFormacion = {
  equipo: 'TEXT',
  linea: 'TEXT',
  ordenLinea: 'INTEGER',
};
for (const [columna, tipo] of Object.entries(columnasFormacion)) {
  const yaExiste = columnasInscripciones.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Inscripciones ADD COLUMN ${columna} ${tipo}`);
  }
}
```

(Usa la variable `columnasInscripciones` ya declarada más arriba en el archivo — no hace falta volver a consultar `PRAGMA table_info`.)

- [ ] **Step 4: Verificar el algoritmo de formación**

Run:
```bash
cd "backend" && node -e "
const { generarLineas, splitEquipos } = require('./src/utils/formacion');
console.log('split(5):', splitEquipos(5));
console.log('split(10):', splitEquipos(10));
console.log('lineas(1):', generarLineas(1));
console.log('lineas(3):', generarLineas(3));
console.log('lineas(2):', generarLineas(2));
console.log('lineas(5):', generarLineas(5));
console.log('lineas(0):', generarLineas(0));
"
```
Expected:
```
split(5): { A: 3, B: 2 }
split(10): { A: 5, B: 5 }
lineas(1): { arquero: 1, defensa: 0, medio: 0, delantero: 0 }
lineas(3): { arquero: 1, defensa: 1, medio: 1, delantero: 0 }
lineas(2): { arquero: 1, defensa: 0, medio: 1, delantero: 0 }
lineas(5): { arquero: 1, defensa: 1, medio: 2, delantero: 1 }
lineas(0): { arquero: 0, defensa: 0, medio: 0, delantero: 0 }
```

- [ ] **Step 5: Verificar la migración contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
console.log(db.prepare('PRAGMA table_info(Inscripciones)').all().map((c) => c.name));
"
```
Expected: la lista incluye `equipo`, `linea`, `ordenLinea` (además de las columnas ya existentes).

- [ ] **Step 6: Verificar que la migración no rompe una DB ya existente sin las columnas**

Run:
```bash
cd "backend" && rm -f /tmp/furboapp-migracion-formacion-test.db* && node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/furboapp-migracion-formacion-test.db');
db.exec(\"CREATE TABLE Usuarios (uid TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL, rol TEXT NOT NULL, estaSancionado INTEGER NOT NULL DEFAULT 0, fechaCreacion TEXT NOT NULL)\");
db.exec(\"CREATE TABLE Partidos (id TEXT PRIMARY KEY, fecha TEXT NOT NULL, estado TEXT NOT NULL, creadoPor TEXT NOT NULL, cupoTitulares INTEGER NOT NULL, cupoSuplentes INTEGER NOT NULL)\");
db.exec(\"CREATE TABLE Inscripciones (id TEXT PRIMARY KEY, partidoId TEXT NOT NULL, usuarioId TEXT NOT NULL, estado TEXT NOT NULL, tipo TEXT NOT NULL, orden INTEGER NOT NULL, fechaInscripcion TEXT NOT NULL, posicionPrincipal TEXT, posicionSecundaria TEXT)\");
db.close();
" && SQLITE_DB_PATH=/tmp/furboapp-migracion-formacion-test.db node -e "
const { db } = require('./src/config/db');
console.log(db.prepare('PRAGMA table_info(Inscripciones)').all().map((c) => c.name));
" && rm -f /tmp/furboapp-migracion-formacion-test.db*
```
Expected: la lista incluye `equipo`, `linea`, `ordenLinea` sin errores (simula el caso real: DB de desarrollo ya creada antes de este cambio).

- [ ] **Step 7: Correr la suite de backend para confirmar que nada se rompió**

Run: `cd "backend" && npm test`
Expected: todos los tests existentes en verde (columnas nuevas nullable no afectan ningún `INSERT`/assert existente; `tests/helpers/testDb.js` usa `schema.sql` directamente, así que ya incluye las columnas nuevas).

- [ ] **Step 8: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js backend/src/utils/formacion.js
git commit -m "feat(backend): agregar columnas de formacion en Inscripciones y algoritmo de lineas/split"
```

---

### Task 2: Servicio de formación (`obtenerFormacion`, `guardarFormacion`)

**Files:**
- Modify: `backend/src/services/inscripcionesService.js`

**Interfaces:**
- Consumes: `LINEAS`, `generarLineas`, `splitEquipos` de `backend/src/utils/formacion.js` (Task 1); `partidosService.obtenerPartido` y `usuariosService.obtenerUsuario` (ya existentes, ya importados en el archivo).
- Produces: `inscripcionesService.obtenerFormacion(partidoId)` → `Promise<{ habilitado, cupoPorEquipo, lineasEsperadas, jugadores }>`; `inscripcionesService.guardarFormacion(partidoId, asignaciones)` → misma forma que `obtenerFormacion`. Ambos consumidos por el controller en Task 3.

- [ ] **Step 1: Agregar el require del algoritmo de formación**

En `backend/src/services/inscripcionesService.js`, reemplazar la línea:

```js
const { sonPosicionesValidas } = require('../constants/posiciones');
```

por:

```js
const { sonPosicionesValidas } = require('../constants/posiciones');
const { LINEAS, generarLineas, splitEquipos } = require('../utils/formacion');
```

- [ ] **Step 2: Agregar `listarTitularesActivos`**

Agregar, después de `contarOcupados` (antes de `anotarse`):

```js
async function listarTitularesActivos(partidoId) {
  return db
    .prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`)
    .all(partidoId);
}
```

- [ ] **Step 3: Agregar `obtenerFormacion`**

Agregar, después de `listarActivas` (antes de `module.exports`):

```js
async function obtenerFormacion(partidoId) {
  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  const habilitado = ocupados.titulares >= partido.cupoTitulares;
  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);
  const lineasEsperadas = { A: generarLineas(cupoPorEquipo.A), B: generarLineas(cupoPorEquipo.B) };

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        equipo: inscripcion.equipo,
        linea: inscripcion.linea,
        ordenLinea: inscripcion.ordenLinea,
      };
    })
  );

  return { habilitado, cupoPorEquipo, lineasEsperadas, jugadores };
}
```

- [ ] **Step 4: Agregar `guardarFormacion`**

Agregar, después de `obtenerFormacion`:

```js
async function guardarFormacion(partidoId, asignaciones) {
  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }
  if (!Array.isArray(asignaciones)) {
    throw crearError('asignaciones debe ser un arreglo', 400);
  }

  const titulares = await listarTitularesActivos(partidoId);
  const idsTitulares = new Set(titulares.map((t) => t.usuarioId));

  if (asignaciones.length !== idsTitulares.size) {
    throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
  }

  const idsVistos = new Set();
  for (const asignacion of asignaciones) {
    const { usuarioId, equipo, linea, ordenLinea } = asignacion;
    if (!idsTitulares.has(usuarioId) || idsVistos.has(usuarioId)) {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    idsVistos.add(usuarioId);
    if (equipo !== 'A' && equipo !== 'B') {
      throw crearError('equipo debe ser "A" o "B"', 400);
    }
    if (!LINEAS.includes(linea)) {
      throw crearError('linea inválida', 400);
    }
    if (!Number.isInteger(ordenLinea) || ordenLinea < 0) {
      throw crearError('ordenLinea debe ser un entero mayor o igual a 0', 400);
    }
  }

  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);
  const lineasEsperadas = { A: generarLineas(cupoPorEquipo.A), B: generarLineas(cupoPorEquipo.B) };

  for (const equipo of ['A', 'B']) {
    const asignacionesDelEquipo = asignaciones.filter((a) => a.equipo === equipo);
    if (asignacionesDelEquipo.length !== cupoPorEquipo[equipo]) {
      throw crearError(`El equipo ${equipo} debe tener exactamente ${cupoPorEquipo[equipo]} jugadores`, 400);
    }
    for (const linea of LINEAS) {
      const deLaLinea = asignacionesDelEquipo.filter((a) => a.linea === linea);
      const esperado = lineasEsperadas[equipo][linea];
      if (deLaLinea.length !== esperado) {
        throw crearError(
          `El equipo ${equipo} debe tener exactamente ${esperado} jugador(es) en la línea "${linea}"`,
          400
        );
      }
      const ordenes = deLaLinea.map((a) => a.ordenLinea).sort((x, y) => x - y);
      const ordenesEsperados = Array.from({ length: esperado }, (_, i) => i);
      if (JSON.stringify(ordenes) !== JSON.stringify(ordenesEsperados)) {
        throw crearError(`ordenLinea inválido para el equipo ${equipo}, línea "${linea}"`, 400);
      }
    }
  }

  const actualizar = db.transaction((lista) => {
    for (const asignacion of lista) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea
         WHERE partidoId = @partidoId AND usuarioId = @usuarioId AND estado = 'anotado'`
      ).run({ ...asignacion, partidoId });
    }
  });
  actualizar(asignaciones);

  return obtenerFormacion(partidoId);
}
```

- [ ] **Step 5: Exportar las funciones nuevas**

Actualizar el `module.exports` al final del archivo:

```js
module.exports = {
  anotarse,
  bajarse,
  sancionarManualmente,
  promover,
  contarOcupados,
  obtenerInscripcionActiva,
  listarActivas,
  obtenerFormacion,
  guardarFormacion,
};
```

- [ ] **Step 6: Verificar manualmente contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const usuariosService = require('./src/services/usuariosService');
const partidosService = require('./src/services/partidosService');
const inscripcionesService = require('./src/services/inscripcionesService');
(async () => {
  const admin = await usuariosService.sincronizarUsuario({ uid: 'admin1', email: 'admin@gmail.com', nombre: 'Admin' });
  const partido = await partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z', cupoTitulares: 5, cupoSuplentes: 1, creadoPor: admin.uid,
  });

  for (let i = 1; i <= 5; i++) {
    await usuariosService.sincronizarUsuario({ uid: 'u' + i, email: 'u' + i + '@gmail.com', nombre: 'Jugador ' + i });
    await inscripcionesService.anotarse(partido.id, 'u' + i, { posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' });
  }

  const antes = await inscripcionesService.obtenerFormacion(partido.id);
  console.log('OK habilitado:', antes.habilitado, 'cupoPorEquipo:', antes.cupoPorEquipo, 'lineasEsperadas:', antes.lineasEsperadas);

  const asignaciones = [
    { usuarioId: 'u1', equipo: 'A', linea: 'arquero', ordenLinea: 0 },
    { usuarioId: 'u2', equipo: 'A', linea: 'defensa', ordenLinea: 0 },
    { usuarioId: 'u3', equipo: 'A', linea: 'medio', ordenLinea: 0 },
    { usuarioId: 'u4', equipo: 'B', linea: 'arquero', ordenLinea: 0 },
    { usuarioId: 'u5', equipo: 'B', linea: 'medio', ordenLinea: 0 },
  ];
  const guardada = await inscripcionesService.guardarFormacion(partido.id, asignaciones);
  console.log('OK guardada, u1 equipo/linea:', guardada.jugadores.find((j) => j.usuarioId === 'u1').equipo, guardada.jugadores.find((j) => j.usuarioId === 'u1').linea);

  try {
    await inscripcionesService.guardarFormacion(partido.id, asignaciones.slice(0, 4));
    console.log('ERROR: no debería aceptar un tablero incompleto');
  } catch (e) {
    console.log('OK rechazo incompleto:', e.status, e.message);
  }

  try {
    const invalida = asignaciones.map((a) => (a.usuarioId === 'u2' ? { ...a, equipo: 'B' } : a));
    await inscripcionesService.guardarFormacion(partido.id, invalida);
    console.log('ERROR: no debería aceptar un split de equipos incorrecto');
  } catch (e) {
    console.log('OK rechazo split incorrecto:', e.status, e.message);
  }

  try {
    const conDuplicado = [...asignaciones.slice(0, 4), { usuarioId: 'u4', equipo: 'B', linea: 'medio', ordenLinea: 0 }];
    await inscripcionesService.guardarFormacion(partido.id, conDuplicado);
    console.log('ERROR: no debería aceptar un usuarioId duplicado');
  } catch (e) {
    console.log('OK rechazo duplicado:', e.status, e.message);
  }
})();
"
```
Expected:
```
OK habilitado: true cupoPorEquipo: { A: 3, B: 2 } lineasEsperadas: { A: { arquero: 1, defensa: 1, medio: 1, delantero: 0 }, B: { arquero: 1, defensa: 0, medio: 1, delantero: 0 } }
OK guardada, u1 equipo/linea: A arquero
OK rechazo incompleto: 400 La formación debe incluir a todos los titulares, sin repetidos
OK rechazo split incorrecto: 400 El equipo A debe tener exactamente 3 jugadores
OK rechazo duplicado: 400 La formación debe incluir a todos los titulares, sin repetidos
```

- [ ] **Step 7: Correr la suite de backend**

Run: `cd "backend" && npm test`
Expected: todos los tests en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/inscripcionesService.js
git commit -m "feat(backend): agregar obtenerFormacion y guardarFormacion al servicio de inscripciones"
```

---

### Task 3: Endpoints `GET /formacion` y `PUT /formacion`

**Files:**
- Modify: `backend/src/controllers/inscripcionesController.js`
- Modify: `backend/src/routes/partidosRoutes.js`

**Interfaces:**
- Consumes: `inscripcionesService.obtenerFormacion` y `inscripcionesService.guardarFormacion` (Task 2).
- Produces: rutas `GET /api/partidos/:partidoId/formacion` y `PUT /api/partidos/:partidoId/formacion`, consumidas por `Home.jsx`/`MapaCancha.jsx` en Tasks 5-6.

- [ ] **Step 1: Agregar los controllers**

En `backend/src/controllers/inscripcionesController.js`, agregar después de `listarPorPartido`:

```js
async function verFormacion(req, res) {
  const formacion = await inscripcionesService.obtenerFormacion(req.params.partidoId);
  res.json(formacion);
}

async function guardarFormacion(req, res) {
  const formacion = await inscripcionesService.guardarFormacion(req.params.partidoId, req.body.asignaciones);
  res.json(formacion);
}
```

Actualizar el `module.exports`:

```js
module.exports = { anotarse, bajarse, promover, sancionarManualmente, listarPorPartido, verFormacion, guardarFormacion };
```

- [ ] **Step 2: Agregar las rutas**

En `backend/src/routes/partidosRoutes.js`, agregar después de `router.get('/:partidoId/inscripciones', ...)` (antes de la ruta de `promover`):

```js
router.get('/:partidoId/formacion', verificarToken, envolverAsync(inscripcionesController.verFormacion));
router.put(
  '/:partidoId/formacion',
  verificarToken,
  verificarAdmin,
  envolverAsync(inscripcionesController.guardarFormacion)
);
```

- [ ] **Step 3: Correr la suite de backend**

Run: `cd "backend" && npm test`
Expected: todo en verde (este task no cambia el service, solo cablea rutas ya probadas en Task 2).

- [ ] **Step 4: Verificación manual end-to-end con el servidor levantado**

Run (en una terminal): `cd "backend" && npm run dev`

En otra terminal, con un token válido de un admin ya sincronizado (reemplazar `TOKEN`, `PARTIDO_ID` por valores reales del entorno de desarrollo):

```bash
curl -s http://localhost:4000/api/partidos/PARTIDO_ID/formacion -H "Authorization: Bearer TOKEN"
```
Expected: JSON con `habilitado`, `cupoPorEquipo`, `lineasEsperadas`, `jugadores` (o 404 si el `PARTIDO_ID` no existe).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/inscripcionesController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): agregar endpoints GET y PUT /partidos/:id/formacion"
```

---

### Task 4: Dependencia `@dnd-kit/core` y algoritmo de formación (frontend)

**Files:**
- Modify: `frontend/package.json` (vía `npm install`)
- Create: `frontend/src/utils/formacion.js`

**Interfaces:**
- Produces: `LINEAS`, `generarLineas(cantidadJugadores)`, `splitEquipos(cupoTitulares)` — mismo comportamiento que el equivalente de backend (Task 1). Consumido por `MapaCancha.jsx` en Tasks 5-6. Además, el paquete `@dnd-kit/core` (`DndContext`, `useDraggable`, `useDroppable`) queda disponible para Task 6.

- [ ] **Step 1: Instalar `@dnd-kit/core`**

Run: `cd "frontend" && npm install @dnd-kit/core`
Expected: se agrega `@dnd-kit/core` a `dependencies` en `frontend/package.json` y al lockfile.

- [ ] **Step 2: Crear el algoritmo de formación (espejo del backend)**

Crear `frontend/src/utils/formacion.js`:

```js
export const LINEAS = ['arquero', 'defensa', 'medio', 'delantero'];

export function generarLineas(cantidadJugadores) {
  if (cantidadJugadores <= 0) return { arquero: 0, defensa: 0, medio: 0, delantero: 0 };
  if (cantidadJugadores === 1) return { arquero: 1, defensa: 0, medio: 0, delantero: 0 };

  const resto = cantidadJugadores - 1;
  const base = Math.floor(resto / 3);
  const extra = resto % 3;
  const lineas = { arquero: 1, defensa: base, medio: base, delantero: base };

  const ordenReparto = ['medio', 'defensa', 'delantero'];
  for (let i = 0; i < extra; i++) lineas[ordenReparto[i]]++;

  return lineas;
}

export function splitEquipos(cupoTitulares) {
  return {
    A: Math.ceil(cupoTitulares / 2),
    B: Math.floor(cupoTitulares / 2),
  };
}
```

- [ ] **Step 3: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/utils/formacion.js
git commit -m "feat(frontend): agregar dnd-kit/core y algoritmo de formacion"
```

---

### Task 5: `MapaCancha.jsx` (render solo lectura) + integración en `Home.jsx`

**Files:**
- Create: `frontend/src/components/MapaCancha.jsx`
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `LINEAS` de `frontend/src/utils/formacion.js` (Task 4); `GET /partidos/:id/formacion` (Task 3); shape de respuesta `{ habilitado, cupoPorEquipo, lineasEsperadas, jugadores }` donde cada jugador es `{ usuarioId, nombre, posicionPrincipal, equipo, linea, ordenLinea }` (`equipo`/`linea`/`ordenLinea` son `null` si no está ubicado).
- Produces: componente `MapaCancha({ formacion })` — sin interactividad todavía, consumido y luego extendido por Task 6.

- [ ] **Step 1: Crear `MapaCancha.jsx` en modo solo lectura**

Crear `frontend/src/components/MapaCancha.jsx`:

```jsx
import { LINEAS } from '../utils/formacion';

const ETIQUETAS_LINEA = {
  arquero: 'Arquero',
  defensa: 'Defensa',
  medio: 'Medio',
  delantero: 'Delantero',
};

function jugadorEnSlot(jugadores, equipo, linea, ordenLinea) {
  return jugadores.find((j) => j.equipo === equipo && j.linea === linea && j.ordenLinea === ordenLinea) || null;
}

function MitadCancha({ equipo, lineasEsperadas, jugadores }) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg bg-pasto-600/10 p-3">
      <h5 className="text-center text-xs font-bold uppercase tracking-wide text-white/70">Equipo {equipo}</h5>
      {LINEAS.map((linea) => {
        const cantidad = lineasEsperadas[linea];
        if (cantidad === 0) return null;
        return (
          <div key={linea} className="flex flex-col gap-1">
            <p className="text-[10px] uppercase text-white/40">{ETIQUETAS_LINEA[linea]}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: cantidad }, (_, ordenLinea) => {
                const jugador = jugadorEnSlot(jugadores, equipo, linea, ordenLinea);
                return (
                  <div
                    key={ordenLinea}
                    className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-cancha-700 p-1 text-center text-[11px] text-white/90"
                  >
                    {jugador ? jugador.nombre : '—'}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MapaCancha({ formacion }) {
  if (!formacion || !formacion.habilitado) {
    return (
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-pasto-500">Formación</h4>
      <div className="flex gap-3">
        <MitadCancha equipo="A" lineasEsperadas={formacion.lineasEsperadas.A} jugadores={formacion.jugadores} />
        <MitadCancha equipo="B" lineasEsperadas={formacion.lineasEsperadas.B} jugadores={formacion.jugadores} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Traer la formación en `Home.jsx`**

En `frontend/src/pages/Home.jsx`, agregar el import:

```js
import MapaCancha from '../components/MapaCancha';
```

Agregar el estado, después de `inscripcionesPorPartido`:

```js
const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
```

En `cargarPartidos`, después del bloque que arma `entradas`/`setInscripcionesPorPartido` (antes del `catch`), agregar:

```js
const entradasFormacion = await Promise.all(
  partidosAbiertos
    .filter((partido) => (partido.ocupados?.titulares || 0) >= partido.cupoTitulares)
    .map(async (partido) => {
      const { data } = await api.get(`/partidos/${partido.id}/formacion`);
      return [partido.id, data];
    })
);
setFormacionesPorPartido(Object.fromEntries(entradasFormacion));
```

- [ ] **Step 3: Renderizar `MapaCancha` junto a cada `TarjetaPartido`**

En `frontend/src/pages/Home.jsx`, reemplazar:

```jsx
{partidos.map((partido) => (
  <TarjetaPartido
    key={partido.id}
    partido={partido}
    inscripcionUsuario={inscripcionDelUsuario(partido.id)}
    estaSancionado={estaSancionado}
    procesando={partidoEnProceso === partido.id}
    onAnotarse={() => setPartidoParaAnotarse(partido.id)}
    onSolicitarBaja={() => solicitarBaja(partido)}
    jugadores={inscripcionesPorPartido[partido.id] || []}
  />
))}
```

por:

```jsx
{partidos.map((partido) => (
  <div key={partido.id} className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <TarjetaPartido
      partido={partido}
      inscripcionUsuario={inscripcionDelUsuario(partido.id)}
      estaSancionado={estaSancionado}
      procesando={partidoEnProceso === partido.id}
      onAnotarse={() => setPartidoParaAnotarse(partido.id)}
      onSolicitarBaja={() => solicitarBaja(partido)}
      jugadores={inscripcionesPorPartido[partido.id] || []}
    />
    {formacionesPorPartido[partido.id] && <MapaCancha formacion={formacionesPorPartido[partido.id]} />}
  </div>
))}
```

- [ ] **Step 4: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 5: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MapaCancha.jsx frontend/src/pages/Home.jsx
git commit -m "feat(frontend): agregar MapaCancha de solo lectura e integrarlo en Home"
```

---

### Task 6: Drag&drop con `@dnd-kit/core` y botón "Guardar formación"

**Files:**
- Modify: `frontend/src/components/MapaCancha.jsx`
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `DndContext`, `useDraggable`, `useDroppable` de `@dnd-kit/core` (Task 4); `PUT /partidos/:id/formacion` con body `{ asignaciones: [{ usuarioId, equipo, linea, ordenLinea }, ...] }` (Task 3); `api` de `frontend/src/services/api.js` (ya existente).
- Produces: `MapaCancha({ partidoId, formacion, esAdmin, onGuardado })` — `onGuardado(formacionActualizada)` se llama tras un guardado exitoso.

- [ ] **Step 1: Reescribir `MapaCancha.jsx` con drag&drop**

Reemplazar el contenido completo de `frontend/src/components/MapaCancha.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../services/api';
import Boton from './Boton';
import { LINEAS } from '../utils/formacion';

const ETIQUETAS_LINEA = {
  arquero: 'Arquero',
  defensa: 'Defensa',
  medio: 'Medio',
  delantero: 'Delantero',
};

function idSlot(equipo, linea, ordenLinea) {
  return `${equipo}-${linea}-${ordenLinea}`;
}

function Jugador({ usuarioId, nombre, draggable }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: usuarioId,
    disabled: !draggable,
  });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-cancha-700 p-1 text-center text-[11px] text-white/90 ${
        draggable ? 'cursor-grab touch-none active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {nombre}
    </div>
  );
}

function Slot({ equipo, linea, ordenLinea, jugador, draggable }) {
  const { setNodeRef, isOver } = useDroppable({ id: idSlot(equipo, linea, ordenLinea), disabled: !draggable });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/20 ${
        isOver ? 'bg-pasto-600/30' : ''
      }`}
    >
      {jugador ? <Jugador usuarioId={jugador.usuarioId} nombre={jugador.nombre} draggable={draggable} /> : null}
    </div>
  );
}

function MitadCancha({ equipo, lineasEsperadas, ubicaciones, draggable }) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg bg-pasto-600/10 p-3">
      <h5 className="text-center text-xs font-bold uppercase tracking-wide text-white/70">Equipo {equipo}</h5>
      {LINEAS.map((linea) => {
        const cantidad = lineasEsperadas[linea];
        if (cantidad === 0) return null;
        return (
          <div key={linea} className="flex flex-col gap-1">
            <p className="text-[10px] uppercase text-white/40">{ETIQUETAS_LINEA[linea]}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: cantidad }, (_, ordenLinea) => (
                <Slot
                  key={ordenLinea}
                  equipo={equipo}
                  linea={linea}
                  ordenLinea={ordenLinea}
                  jugador={ubicaciones.find(
                    (u) => u.equipo === equipo && u.linea === linea && u.ordenLinea === ordenLinea
                  )}
                  draggable={draggable}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MapaCancha({ partidoId, formacion, esAdmin, onGuardado }) {
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  if (!formacion || !formacion.habilitado) {
    return (
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

  const sinUbicar = ubicaciones.filter((jugador) => !jugador.equipo);

  function manejarDragEnd(evento) {
    const { active, over } = evento;
    if (!over) return;
    const [equipo, linea, ordenTexto] = over.id.split('-');
    const ordenLinea = Number(ordenTexto);
    const activoId = active.id;

    setUbicaciones((anterior) => {
      const activo = anterior.find((jugador) => jugador.usuarioId === activoId);
      if (!activo) return anterior;
      const ubicacionAnteriorActivo = { equipo: activo.equipo, linea: activo.linea, ordenLinea: activo.ordenLinea };
      const ocupante = anterior.find(
        (jugador) =>
          jugador.equipo === equipo &&
          jugador.linea === linea &&
          jugador.ordenLinea === ordenLinea &&
          jugador.usuarioId !== activoId
      );

      return anterior.map((jugador) => {
        if (jugador.usuarioId === activoId) return { ...jugador, equipo, linea, ordenLinea };
        if (ocupante && jugador.usuarioId === ocupante.usuarioId) return { ...jugador, ...ubicacionAnteriorActivo };
        return jugador;
      });
    });
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      const asignaciones = ubicaciones
        .filter((jugador) => jugador.equipo)
        .map((jugador) => ({
          usuarioId: jugador.usuarioId,
          equipo: jugador.equipo,
          linea: jugador.linea,
          ordenLinea: jugador.ordenLinea,
        }));
      const { data } = await api.put(`/partidos/${partidoId}/formacion`, { asignaciones });
      setUbicaciones(data.jugadores);
      onGuardado?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const contenido = (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-pasto-500">Formación</h4>
      <div className="flex gap-3">
        <MitadCancha
          equipo="A"
          lineasEsperadas={formacion.lineasEsperadas.A}
          ubicaciones={ubicaciones}
          draggable={esAdmin}
        />
        <MitadCancha
          equipo="B"
          lineasEsperadas={formacion.lineasEsperadas.B}
          ubicaciones={ubicaciones}
          draggable={esAdmin}
        />
      </div>

      {esAdmin && sinUbicar.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase text-white/40">Sin ubicar</p>
          <div className="flex flex-wrap gap-2">
            {sinUbicar.map((jugador) => (
              <Jugador key={jugador.usuarioId} usuarioId={jugador.usuarioId} nombre={jugador.nombre} draggable />
            ))}
          </div>
        </div>
      )}

      {esAdmin && (
        <>
          {error && <p className="mt-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
          <Boton variante="primario" className="mt-4 w-full" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
        </>
      )}
    </div>
  );

  if (!esAdmin) return contenido;

  return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;
}
```

- [ ] **Step 2: Pasar `esAdmin` y `onGuardado` desde `Home.jsx`**

En `frontend/src/pages/Home.jsx`, reemplazar:

```jsx
{formacionesPorPartido[partido.id] && <MapaCancha formacion={formacionesPorPartido[partido.id]} />}
```

por:

```jsx
{formacionesPorPartido[partido.id] && (
  <MapaCancha
    partidoId={partido.id}
    formacion={formacionesPorPartido[partido.id]}
    esAdmin={esAdmin}
    onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
  />
)}
```

- [ ] **Step 3: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MapaCancha.jsx frontend/src/pages/Home.jsx
git commit -m "feat(frontend): agregar drag&drop con dnd-kit para armar la formacion"
```

---

## Verificación manual sugerida (fuera del alcance de los tests automatizados)

Después de completar los 6 tasks, levantar `backend` (`npm run dev`) y `frontend` (`npm run dev`) y probar en el navegador:

1. Crear un partido con `cupoTitulares` bajo (ej. 5) y anotar como titular con 5 cuentas distintas (o promoviendo suplentes) hasta completar el cupo. Confirmar que el mapa aparece recién cuando se completa el cupo de titulares, no antes.
2. Como admin, arrastrar cada titular de "Sin ubicar" a un spot de cada línea/equipo. Confirmar que soltar un jugador sobre un spot ya ocupado hace swap (el que estaba ahí vuelve a "Sin ubicar" o al spot anterior del jugador arrastrado).
3. Apretar "Guardar formación" y recargar la página — confirmar que la ubicación persiste.
4. Loguearse con un usuario no admin — confirmar que ve la misma formación guardada pero sin poder arrastrar ni ver el botón "Guardar formación".
5. Dar de baja a un titular ya ubicado en el mapa (desde otra sesión/usuario) y recargar como admin — confirmar que su slot queda vacío y el resto de la formación no se altera, y que se puede volver a guardar arrastrando un reemplazo a ese slot.
