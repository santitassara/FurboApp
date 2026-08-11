# Migración de Firestore a SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar Firestore por SQLite como almacenamiento de datos de FurboApp (`Usuarios`, `Partidos`, `Inscripciones`), para poder correr el backend completo sin depender de un servicio cloud de base de datos — condición necesaria para el deploy self-hosted en una Raspberry Pi que se documentará después.

**Architecture:** Nuevo módulo `backend/src/config/db.js` que abre un archivo SQLite (vía `better-sqlite3`) y aplica un esquema (`backend/src/db/schema.sql`) al iniciar. Los tres servicios de datos (`usuariosService.js`, `partidosService.js`, `inscripcionesService.js`) se reescriben para usar SQL en vez de llamadas a Firestore, manteniendo idénticas sus firmas y shapes de retorno. `config/firebase.js` se simplifica: solo inicializa `firebase-admin` para `admin.auth()` (verificación de login con Google), que no cambia.

**Tech Stack:** Node.js + Express (backend, sin cambios), `better-sqlite3` (nuevo), Jest (tests, con SQLite en memoria en vez de mocks de Firestore).

## Global Constraints

- Las funciones exportadas de `usuariosService.js`, `partidosService.js` e `inscripcionesService.js` mantienen el mismo nombre, misma firma y mismo shape de retorno que hoy — controllers y rutas no se tocan.
- Login con Google (Firebase Authentication, `admin.auth().verifyIdToken()`) no cambia.
- `Usuarios.uid` sigue siendo el UID de Google (no se genera localmente). `Partidos.id` e `Inscripciones.id` se generan con `crypto.randomUUID()` (nativo de Node, sin dependencias nuevas).
- Fechas se guardan como string ISO (`new Date().toISOString()`), igual que hoy.
- No hay soporte dual Firestore/SQLite: es un reemplazo total, un solo camino de código.
- El pragma `foreign_keys` de SQLite queda **apagado** (comportamiento por defecto): las cláusulas `REFERENCES` en el esquema son solo documentación, no se aplican. Esto mantiene la misma falta de integridad referencial que tenía Firestore y evita romper casos de test existentes (ej. una inscripción que referencia un partido ya borrado).
- Tests: se reemplaza el mock de Firestore por una base SQLite real en memoria (`:memory:`) con el esquema real aplicado — no se mockean llamadas SQL individuales.

---

### Task 1: Base de datos SQLite — esquema y configuración

**Files:**
- Create: `backend/src/db/schema.sql`
- Create: `backend/src/config/db.js`
- Create: `backend/data/.gitkeep`
- Modify: `backend/.gitignore`
- Modify: `backend/.env.example`
- Modify: `backend/package.json` (dependencia `better-sqlite3`)
- Test: `backend/tests/config/db.test.js`

**Interfaces:**
- Produces: `db` — instancia de `better-sqlite3` `Database`, exportada como `{ db }` desde `backend/src/config/db.js`. Las tablas `Usuarios`, `Partidos`, `Inscripciones` ya existen en `db` apenas se importa el módulo (se crean con `CREATE TABLE IF NOT EXISTS` al cargar el archivo).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/config/db.test.js`:

```js
process.env.SQLITE_DB_PATH = ':memory:';

const { db } = require('../../src/config/db');

describe('config/db', () => {
  it('crea las tablas Usuarios, Partidos e Inscripciones', () => {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((fila) => fila.name);

    expect(tablas).toEqual(expect.arrayContaining(['Usuarios', 'Partidos', 'Inscripciones']));
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd backend && npx jest tests/config/db.test.js`
Expected: FAIL — `Cannot find module '../../src/config/db'` (o `better-sqlite3` si tampoco está instalado todavía).

- [ ] **Step 3: Instalar la dependencia**

Run: `cd backend && npm install better-sqlite3`

- [ ] **Step 4: Crear el esquema SQL**

Crear `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jugador')),
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS Inscripciones (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  estado TEXT NOT NULL CHECK (estado IN ('anotado', 'dado_de_baja')),
  tipo TEXT NOT NULL CHECK (tipo IN ('titular', 'suplente')),
  orden INTEGER NOT NULL,
  fechaInscripcion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_partido_estado
  ON Inscripciones (partidoId, estado);
```

- [ ] **Step 5: Crear el módulo de configuración**

Crear `backend/src/config/db.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../data/furboapp.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

module.exports = { db };
```

- [ ] **Step 6: Crear la carpeta de datos y actualizar `.gitignore`**

Crear `backend/data/.gitkeep` (archivo vacío).

Modificar `backend/.gitignore`, agregando al final:

```
data/*.db
data/*.db-wal
data/*.db-shm
```

- [ ] **Step 7: Actualizar `.env.example`**

Agregar en `backend/.env.example`, después de `PORT=4000`:

```
SQLITE_DB_PATH=./data/furboapp.db
```

- [ ] **Step 8: Correr el test y confirmar que pasa**

Run: `cd backend && npx jest tests/config/db.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd backend
git add src/db/schema.sql src/config/db.js data/.gitkeep .gitignore .env.example package.json package-lock.json tests/config/db.test.js
git commit -m "feat(backend): agregar configuración base de SQLite"
```

---

### Task 2: Migrar `usuariosService` a SQLite

**Files:**
- Create: `backend/tests/helpers/testDb.js`
- Modify: `backend/src/services/usuariosService.js`
- Modify: `backend/tests/services/usuariosService.test.js`

**Interfaces:**
- Consumes: `db` de `backend/src/config/db.js` (Task 1).
- Produces: `crearDbDeTest()` en `testDb.js` — devuelve una instancia `Database` (`better-sqlite3`, `:memory:`) con el esquema de `backend/src/db/schema.sql` ya aplicado. Usada por este task y por los Tasks 3 y 4.
- Produces: `usuariosService` sin cambios de firma — `sincronizarUsuario({ uid, email, nombre, emailVerificado })`, `obtenerUsuario(uid)`, `listarSancionados()`, `perdonarSancion(uid)`, `sancionar(uid)`.

- [ ] **Step 1: Crear el helper de test DB**

Crear `backend/tests/helpers/testDb.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function crearDbDeTest() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  return db;
}

module.exports = { crearDbDeTest };
```

- [ ] **Step 2: Reescribir el test que falla**

Reemplazar completamente el contenido de `backend/tests/services/usuariosService.test.js`:

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');

function insertarUsuario(overrides = {}) {
  const usuario = {
    uid: 'uid-x',
    nombre: 'Jugador X',
    email: 'x@gmail.com',
    rol: 'jugador',
    estaSancionado: 0,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES (@uid, @nombre, @email, @rol, @estaSancionado, @fechaCreacion)`
    )
    .run(usuario);
  return usuario;
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Usuarios');
  delete process.env.ADMIN_EMAILS;
});

describe('usuariosService.sincronizarUsuario', () => {
  it('crea un usuario nuevo como jugador si el email no está en ADMIN_EMAILS', async () => {
    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-1',
      email: 'jugador@gmail.com',
      nombre: 'Jugador Uno',
    });

    expect(usuario.rol).toBe('jugador');
    expect(usuario.estaSancionado).toBe(false);

    const fila = mockDb.prepare('SELECT * FROM Usuarios WHERE uid = ?').get('uid-1');
    expect(fila.rol).toBe('jugador');
  });

  it('crea un usuario nuevo como admin si el email está en ADMIN_EMAILS y verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-2',
      email: 'admin@gmail.com',
      nombre: 'Admin Uno',
      emailVerificado: true,
    });

    expect(usuario.rol).toBe('admin');
  });

  it('crea un usuario nuevo como jugador si el email está en ADMIN_EMAILS pero no está verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-4',
      email: 'admin@gmail.com',
      nombre: 'Admin Sin Verificar',
      emailVerificado: false,
    });

    expect(usuario.rol).toBe('jugador');
  });

  it('no degrada a un admin existente y devuelve el usuario tal cual si no hay cambios', async () => {
    insertarUsuario({ uid: 'uid-3', email: 'jugador3@gmail.com', estaSancionado: 1 });

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-3',
      email: 'jugador3@gmail.com',
      nombre: 'Jugador Tres',
    });

    expect(usuario.rol).toBe('jugador');
    expect(usuario.estaSancionado).toBe(true);
  });
});

describe('usuariosService.obtenerUsuario', () => {
  it('devuelve null si el usuario no existe', async () => {
    const usuario = await usuariosService.obtenerUsuario('uid-x');

    expect(usuario).toBeNull();
  });

  it('devuelve los datos si el usuario existe', async () => {
    insertarUsuario({ uid: 'uid-x' });

    const usuario = await usuariosService.obtenerUsuario('uid-x');

    expect(usuario).toMatchObject({ uid: 'uid-x', rol: 'jugador', estaSancionado: false });
  });
});

describe('usuariosService.listarSancionados', () => {
  it('devuelve solo los usuarios sancionados', async () => {
    insertarUsuario({ uid: '1', email: 's@gmail.com', estaSancionado: 1 });
    insertarUsuario({ uid: '2', email: 'ns@gmail.com', estaSancionado: 0 });

    const sancionados = await usuariosService.listarSancionados();

    expect(sancionados).toEqual([expect.objectContaining({ uid: '1', estaSancionado: true })]);
  });
});

describe('usuariosService.perdonarSancion', () => {
  it('lanza error 404 si el usuario no existe', async () => {
    await expect(usuariosService.perdonarSancion('uid-x')).rejects.toMatchObject({ status: 404 });
  });

  it('setea estaSancionado en false si el usuario existe', async () => {
    insertarUsuario({ uid: 'uid-x', estaSancionado: 1 });

    await usuariosService.perdonarSancion('uid-x');

    const fila = mockDb.prepare('SELECT estaSancionado FROM Usuarios WHERE uid = ?').get('uid-x');
    expect(fila.estaSancionado).toBe(0);
  });
});

describe('usuariosService.sancionar', () => {
  it('setea estaSancionado en true', async () => {
    insertarUsuario({ uid: 'uid-y', estaSancionado: 0 });

    await usuariosService.sancionar('uid-y');

    const fila = mockDb.prepare('SELECT estaSancionado FROM Usuarios WHERE uid = ?').get('uid-y');
    expect(fila.estaSancionado).toBe(1);
  });
});
```

- [ ] **Step 3: Correr los tests y confirmar que fallan**

Run: `cd backend && npx jest tests/services/usuariosService.test.js`
Expected: FAIL — `usuariosService` sigue llamando a `db.collection(...)`, que no existe en el mock `{ db: mockDb }` (una instancia real de `better-sqlite3`, no un mock de Firestore).

- [ ] **Step 4: Reescribir la implementación**

Reemplazar completamente `backend/src/services/usuariosService.js`:

```js
const { db } = require('../config/db');

const filaAUsuario = (fila) => (fila ? { ...fila, estaSancionado: Boolean(fila.estaSancionado) } : null);

function obtenerAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function sincronizarUsuario({ uid, email, nombre, emailVerificado }) {
  const esAdmin = Boolean(emailVerificado) && obtenerAdminEmails().includes((email || '').toLowerCase());
  const existente = db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);

  if (!existente) {
    const nuevoUsuario = {
      uid,
      nombre,
      email,
      rol: esAdmin ? 'admin' : 'jugador',
      estaSancionado: false,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES (@uid, @nombre, @email, @rol, @estaSancionado, @fechaCreacion)`
    ).run({ ...nuevoUsuario, estaSancionado: 0 });
    return nuevoUsuario;
  }

  const usuarioExistente = filaAUsuario(existente);
  if (esAdmin && usuarioExistente.rol !== 'admin') {
    db.prepare('UPDATE Usuarios SET rol = ? WHERE uid = ?').run('admin', uid);
    usuarioExistente.rol = 'admin';
  }
  return usuarioExistente;
}

async function obtenerUsuario(uid) {
  return filaAUsuario(db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid));
}

async function listarSancionados() {
  return db.prepare('SELECT * FROM Usuarios WHERE estaSancionado = 1').all().map(filaAUsuario);
}

async function perdonarSancion(uid) {
  const existente = db.prepare('SELECT uid FROM Usuarios WHERE uid = ?').get(uid);
  if (!existente) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  db.prepare('UPDATE Usuarios SET estaSancionado = 0 WHERE uid = ?').run(uid);
}

async function sancionar(uid) {
  db.prepare('UPDATE Usuarios SET estaSancionado = 1 WHERE uid = ?').run(uid);
}

module.exports = { sincronizarUsuario, obtenerUsuario, listarSancionados, perdonarSancion, sancionar };
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `cd backend && npx jest tests/services/usuariosService.test.js`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
cd backend
git add tests/helpers/testDb.js src/services/usuariosService.js tests/services/usuariosService.test.js
git commit -m "feat(backend): migrar usuariosService de Firestore a SQLite"
```

---

### Task 3: Migrar `partidosService` a SQLite

**Files:**
- Modify: `backend/src/services/partidosService.js`
- Modify: `backend/tests/services/partidosService.test.js`

**Interfaces:**
- Consumes: `crearDbDeTest()` de `backend/tests/helpers/testDb.js` (Task 2).
- Produces: `partidosService` sin cambios de firma — `crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor })`, `obtenerPartido(partidoId)`, `listarPartidosAbiertos()`. `crearPartido` devuelve `{ id, fecha, estado, creadoPor, cupoTitulares, cupoSuplentes }` con `id` generado por `crypto.randomUUID()`.

- [ ] **Step 1: Reescribir el test que falla**

Reemplazar completamente el contenido de `backend/tests/services/partidosService.test.js`:

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const partidosService = require('../../src/services/partidosService');

function insertarUsuarioAdmin() {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES ('admin-1', 'Admin Uno', 'admin@gmail.com', 'admin', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run();
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuarioAdmin();
});

describe('partidosService.crearPartido', () => {
  it('rechaza una fecha pasada', async () => {
    await expect(
      partidosService.crearPartido({
        fecha: '2020-01-01T20:00:00.000Z',
        cupoTitulares: 10,
        cupoSuplentes: 5,
        creadoPor: 'admin-1',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza cupoTitulares no numérico o <= 0', async () => {
    await expect(
      partidosService.crearPartido({
        fecha: '2099-01-01T20:00:00.000Z',
        cupoTitulares: 0,
        cupoSuplentes: 5,
        creadoPor: 'admin-1',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('crea el partido con estado abierto cuando los datos son válidos', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    expect(partido).toMatchObject({
      id: expect.any(String),
      estado: 'abierto',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
  });
});

describe('partidosService.obtenerPartido', () => {
  it('devuelve null si no existe', async () => {
    const partido = await partidosService.obtenerPartido('no-existe');

    expect(partido).toBeNull();
  });

  it('devuelve el partido con id si existe', async () => {
    const creado = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    const partido = await partidosService.obtenerPartido(creado.id);

    expect(partido).toEqual(creado);
  });
});

describe('partidosService.listarPartidosAbiertos', () => {
  it('devuelve solo los partidos con estado abierto', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    const otro = await partidosService.crearPartido({
      fecha: '2099-02-01T20:00:00.000Z',
      cupoTitulares: 8,
      cupoSuplentes: 4,
      creadoPor: 'admin-1',
    });
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(otro.id);

    const partidos = await partidosService.listarPartidosAbiertos();

    expect(partidos).toEqual([abierto]);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `cd backend && npx jest tests/services/partidosService.test.js`
Expected: FAIL — `partidosService` todavía usa `db.collection(...)`.

- [ ] **Step 3: Reescribir la implementación**

Reemplazar completamente `backend/src/services/partidosService.js`:

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');

function crearErrorValidacion(mensaje) {
  const error = new Error(mensaje);
  error.status = 400;
  return error;
}

async function crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor }) {
  const fechaPartido = new Date(fecha);
  if (Number.isNaN(fechaPartido.getTime()) || fechaPartido <= new Date()) {
    throw crearErrorValidacion('La fecha del partido debe ser válida y futura');
  }
  if (!Number.isInteger(cupoTitulares) || cupoTitulares <= 0) {
    throw crearErrorValidacion('cupoTitulares debe ser un entero mayor a 0');
  }
  if (!Number.isInteger(cupoSuplentes) || cupoSuplentes < 0) {
    throw crearErrorValidacion('cupoSuplentes debe ser un entero mayor o igual a 0');
  }

  const nuevoPartido = {
    id: crypto.randomUUID(),
    fecha: fechaPartido.toISOString(),
    estado: 'abierto',
    creadoPor,
    cupoTitulares,
    cupoSuplentes,
  };
  db.prepare(
    `INSERT INTO Partidos (id, fecha, estado, creadoPor, cupoTitulares, cupoSuplentes)
     VALUES (@id, @fecha, @estado, @creadoPor, @cupoTitulares, @cupoSuplentes)`
  ).run(nuevoPartido);
  return nuevoPartido;
}

async function obtenerPartido(partidoId) {
  return db.prepare('SELECT * FROM Partidos WHERE id = ?').get(partidoId) || null;
}

async function listarPartidosAbiertos() {
  return db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto'").all();
}

module.exports = { crearPartido, obtenerPartido, listarPartidosAbiertos };
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `cd backend && npx jest tests/services/partidosService.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/partidosService.js tests/services/partidosService.test.js
git commit -m "feat(backend): migrar partidosService de Firestore a SQLite"
```

---

### Task 4: Migrar `inscripcionesService` a SQLite

**Files:**
- Modify: `backend/src/services/inscripcionesService.js`
- Modify: `backend/tests/services/inscripcionesService.test.js`

**Interfaces:**
- Consumes: `crearDbDeTest()` (Task 2), `usuariosService.sincronizarUsuario`/`obtenerUsuario`/`sancionar` (Task 2), `partidosService.crearPartido` (Task 3).
- Produces: `inscripcionesService` sin cambios de firma — `anotarse(partidoId, usuarioId)`, `bajarse(partidoId, usuarioId)`, `promover(partidoId, usuarioId)`, `contarOcupados(partidoId)`, `obtenerInscripcionActiva(partidoId, usuarioId)`, `listarActivas(partidoId)`.

- [ ] **Step 1: Reescribir el test que falla**

Reemplazar completamente el contenido de `backend/tests/services/inscripcionesService.test.js`:

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

async function crearUsuario(overrides = {}) {
  return usuariosService.sincronizarUsuario({
    uid: 'u1',
    email: 'u1@gmail.com',
    nombre: 'Usuario Uno',
    ...overrides,
  });
}

async function crearPartidoAbierto(overrides = {}) {
  const admin = await crearUsuario({ uid: 'admin-1', email: 'admin@gmail.com' });
  return partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 1,
    creadoPor: admin.uid,
    ...overrides,
  });
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
});

describe('inscripcionesService.anotarse', () => {
  it('rechaza con 404 si el usuario no existe', async () => {
    const partido = await crearPartidoAbierto();

    await expect(inscripcionesService.anotarse(partido.id, 'no-existe')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 403 si el usuario está sancionado', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await usuariosService.sancionar('u1');
    const partido = await crearPartidoAbierto();

    await expect(inscripcionesService.anotarse(partido.id, 'u1')).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 400 si ya tiene una inscripción activa', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();
    await inscripcionesService.anotarse(partido.id, 'u1');

    await expect(inscripcionesService.anotarse(partido.id, 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('asigna tipo titular si hay lugar', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();

    const inscripcion = await inscripcionesService.anotarse(partido.id, 'u1');

    expect(inscripcion.tipo).toBe('titular');
  });

  it('asigna tipo suplente si los titulares están completos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');

    const inscripcion = await inscripcionesService.anotarse(partido.id, 'u2');

    expect(inscripcion.tipo).toBe('suplente');
  });

  it('rechaza con 400 "Partido completo" si titulares y suplentes están llenos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await crearUsuario({ uid: 'u3', email: 'u3@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');
    await inscripcionesService.anotarse(partido.id, 'u2');

    await expect(inscripcionesService.anotarse(partido.id, 'u3')).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si el partido no está abierto', async () => {
    const partido = await crearPartidoAbierto();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.anotarse(partido.id, 'u1')).rejects.toMatchObject({ status: 400 });
  });
});

describe('inscripcionesService.bajarse', () => {
  it('rechaza con 400 si no hay inscripción activa', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.bajarse(partido.id, 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('sanciona al usuario si era titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');

    await inscripcionesService.bajarse(partido.id, 'u1');

    const usuario = await usuariosService.obtenerUsuario('u1');
    expect(usuario.estaSancionado).toBe(true);
  });

  it('NO sanciona al usuario si era suplente', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');
    await inscripcionesService.anotarse(partido.id, 'u2');

    await inscripcionesService.bajarse(partido.id, 'u2');

    const usuario = await usuariosService.obtenerUsuario('u2');
    expect(usuario.estaSancionado).toBe(false);
  });
});

describe('inscripcionesService.promover', () => {
  it('rechaza con 404 si el usuario no tiene inscripción activa', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.promover(partido.id, 'u1')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 400 si el usuario ya es titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');

    await expect(inscripcionesService.promover(partido.id, 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si no hay cupo de titular libre', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');
    await inscripcionesService.anotarse(partido.id, 'u2');

    await expect(inscripcionesService.promover(partido.id, 'u2')).rejects.toMatchObject({ status: 400 });
  });

  it('promueve a titular si hay cupo libre', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');
    await inscripcionesService.anotarse(partido.id, 'u2');
    await inscripcionesService.bajarse(partido.id, 'u1');

    const inscripcion = await inscripcionesService.promover(partido.id, 'u2');

    expect(inscripcion.tipo).toBe('titular');
  });

  it('rechaza con 404 si el partido no existe', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');
    await inscripcionesService.anotarse(partido.id, 'u2');
    mockDb.prepare('DELETE FROM Partidos WHERE id = ?').run(partido.id);

    await expect(inscripcionesService.promover(partido.id, 'u2')).rejects.toMatchObject({ status: 404 });
  });
});

describe('inscripcionesService.listarActivas', () => {
  it('devuelve solo inscripciones con estado anotado', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1');
    await inscripcionesService.anotarse(partido.id, 'u2');
    await inscripcionesService.bajarse(partido.id, 'u2');

    const activas = await inscripcionesService.listarActivas(partido.id);

    expect(activas.map((i) => i.usuarioId)).toEqual(['u1']);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js`
Expected: FAIL — `inscripcionesService` todavía usa `db.collection(...)`.

- [ ] **Step 3: Reescribir la implementación**

Reemplazar completamente `backend/src/services/inscripcionesService.js`:

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const partidosService = require('./partidosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerInscripcionActiva(partidoId, usuarioId) {
  return (
    db
      .prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado'`)
      .get(partidoId, usuarioId) || null
  );
}

async function contarOcupados(partidoId) {
  const filas = db
    .prepare(`SELECT tipo FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado'`)
    .all(partidoId);
  return {
    titulares: filas.filter((f) => f.tipo === 'titular').length,
    suplentes: filas.filter((f) => f.tipo === 'suplente').length,
  };
}

async function anotarse(partidoId, usuarioId) {
  const usuario = await usuariosService.obtenerUsuario(usuarioId);
  if (!usuario) throw crearError('Usuario no encontrado', 404);
  if (usuario.estaSancionado) throw crearError('Estás sancionado y no podés anotarte', 403);

  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido no está abierto', 400);

  const inscripcionActiva = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (inscripcionActiva) throw crearError('Ya estás anotado en este partido', 400);

  const ocupados = await contarOcupados(partidoId);
  let tipo;
  if (ocupados.titulares < partido.cupoTitulares) {
    tipo = 'titular';
  } else if (ocupados.suplentes < partido.cupoSuplentes) {
    tipo = 'suplente';
  } else {
    throw crearError('Partido completo', 400);
  }

  const nuevaInscripcion = {
    id: crypto.randomUUID(),
    partidoId,
    usuarioId,
    estado: 'anotado',
    tipo,
    orden: ocupados.titulares + ocupados.suplentes,
    fechaInscripcion: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion)
     VALUES (@id, @partidoId, @usuarioId, @estado, @tipo, @orden, @fechaInscripcion)`
  ).run(nuevaInscripcion);
  return nuevaInscripcion;
}

async function bajarse(partidoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('No estás anotado en este partido', 400);

  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);

  if (inscripcion.tipo === 'titular') {
    await usuariosService.sancionar(usuarioId);
  }

  return { ...inscripcion, estado: 'dado_de_baja' };
}

async function promover(partidoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'suplente') throw crearError('El jugador ya es titular', 400);

  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares >= partido.cupoTitulares) {
    throw crearError('No hay lugares de titular disponibles', 400);
  }

  db.prepare("UPDATE Inscripciones SET tipo = 'titular' WHERE id = ?").run(inscripcion.id);
  return { ...inscripcion, tipo: 'titular' };
}

async function listarActivas(partidoId) {
  return db.prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado'`).all(partidoId);
}

module.exports = { anotarse, bajarse, promover, contarOcupados, obtenerInscripcionActiva, listarActivas };
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/inscripcionesService.js tests/services/inscripcionesService.test.js
git commit -m "feat(backend): migrar inscripcionesService de Firestore a SQLite"
```

---

### Task 5: Simplificar `config/firebase.js` a solo Auth y limpiar Firestore residual

**Files:**
- Modify: `backend/src/config/firebase.js`
- Delete: `backend/tests/helpers/mockFirestore.js`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `{ admin }` desde `backend/src/config/firebase.js` (se le quita `db`). `verificarToken.js` ya solo importa `{ admin }`, así que no requiere cambios.

- [ ] **Step 1: Confirmar que nada más importa `db` desde `config/firebase`**

Run: `cd backend && grep -rn "config/firebase" src tests`
Expected: solo aparecen `src/config/firebase.js` (definición) y `src/middlewares/verificarToken.js` (`const { admin } = require('../config/firebase');`). Ningún archivo debe importar `{ db }` desde `config/firebase` a esta altura (los tres servicios ya migraron a `config/db` en los Tasks 2-4).

- [ ] **Step 2: Simplificar `config/firebase.js`**

Reemplazar completamente `backend/src/config/firebase.js`:

```js
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = { admin };
```

- [ ] **Step 3: Borrar el mock de Firestore, ya sin uso**

Run: `cd backend && git rm tests/helpers/mockFirestore.js`

- [ ] **Step 4: Correr toda la suite de tests del backend**

Run: `cd backend && npm test`
Expected: PASS — todos los tests (config/db, usuariosService, partidosService, inscripcionesService) en verde, sin referencias rotas a `mockFirestore`.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/config/firebase.js
git commit -m "refactor(backend): dejar config/firebase.js solo para Auth, sin Firestore"
```

---

### Task 6: Actualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** ninguna (solo documentación).

- [ ] **Step 1: Actualizar la sección 3 ("Stack Tecnológico")**

En `CLAUDE.md`, reemplazar la línea:

```
*   **Base de Datos & Auth**: Firebase Firestore (NoSQL) y Firebase Authentication (Google Provider), gestionados desde el backend mediante **Firebase Admin SDK**.
```

por:

```
*   **Base de Datos**: SQLite (`better-sqlite3`), archivo local gestionado desde el backend (`backend/src/config/db.js`), sin dependencias cloud.
*   **Auth**: Firebase Authentication (Google Provider), verificado desde el backend mediante **Firebase Admin SDK** (`admin.auth().verifyIdToken()`). Requiere conexión a internet para validar el login con Google; esto es independiente de dónde corre la base de datos.
```

- [ ] **Step 2: Actualizar la sección 5 ("Modelo de Datos")**

En `CLAUDE.md`, reemplazar el encabezado:

```
## 5. Modelo de Datos (Firestore NoSQL)
```

por:

```
## 5. Modelo de Datos (SQLite)
```

Y reemplazar las tres sub-secciones (`### Colección: \`Usuarios\``, etc.) por:

```
### Tabla: `Usuarios`
*   `uid` (TEXT, PK, ID de Google)
*   `nombre` (TEXT)
*   `email` (TEXT, UNIQUE)
*   `rol` (TEXT: "admin" | "jugador")
*   `estaSancionado` (INTEGER, 0/1)
*   `fechaCreacion` (TEXT, ISO 8601)

### Tabla: `Partidos`
*   `id` (TEXT, PK, generado con `crypto.randomUUID()`)
*   `fecha` (TEXT, ISO 8601)
*   `estado` (TEXT: "abierto" | "cerrado" | "jugado")
*   `creadoPor` (TEXT, uid del Admin)
*   `cupoTitulares` (INTEGER)
*   `cupoSuplentes` (INTEGER)

### Tabla: `Inscripciones`
*   `id` (TEXT, PK, generado con `crypto.randomUUID()`)
*   `partidoId` (TEXT, FK -> Partidos)
*   `usuarioId` (TEXT, FK -> Usuarios)
*   `estado` (TEXT: "anotado" | "dado_de_baja")
*   `tipo` (TEXT: "titular" | "suplente")
*   `orden` (INTEGER)
*   `fechaInscripcion` (TEXT, ISO 8601)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: actualizar CLAUDE.md para reflejar la migración a SQLite"
```

---

### Task 7: Verificación manual end-to-end

**Files:** ninguno (solo verificación, no hay cambios de código).

- [ ] **Step 1: Levantar el backend con la base de datos real (no en memoria)**

Run: `cd backend && rm -f data/furboapp.db* && npm start`
Expected: en la consola aparece `FurboApp backend escuchando en el puerto 4000` (o el puerto configurado en `.env`), sin errores ni stack traces.

- [ ] **Step 2: Confirmar que el archivo SQLite y las tablas se crearon**

En otra terminal, con el server todavía corriendo:

Run: `cd backend && node -e "const { db } = require('./src/config/db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"`
Expected: imprime un array que incluye `{ name: 'Usuarios' }`, `{ name: 'Partidos' }`, `{ name: 'Inscripciones' }`.

- [ ] **Step 3: Detener el servidor**

Volver a la terminal del Step 1 y presionar `Ctrl+C`.

- [ ] **Step 4: Confirmar que el árbol de trabajo está limpio**

Run: `git status`
Expected: sin cambios pendientes (todo ya commiteado en los Tasks 1-6). El archivo `data/furboapp.db` generado en el Step 1 debe aparecer como ignorado (no listado), gracias al `.gitignore` del Task 1 — si aparece como untracked, revisar el `.gitignore`.
