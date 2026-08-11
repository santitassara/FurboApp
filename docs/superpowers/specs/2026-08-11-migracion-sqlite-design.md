# Migración de Firestore a SQLite (para self-hosting en Raspberry Pi) — Diseño

Fecha: 2026-08-11

## 1. Contexto y objetivo

FurboApp está desplegado hoy en Render (frontend como Static Site, backend como Web Service) usando Firebase Firestore como base de datos. Al hacer refresh en rutas del frontend (`/admin`, `/inicio`) aparece un 404 porque el Static Site de Render no tiene configurada una regla de rewrite para SPAs — eso se resuelve por separado con una guía de configuración del dashboard (no requiere cambios de código).

Además, el usuario quiere poder correr la aplicación completa (frontend + backend + base de datos) en una Raspberry Pi 3B+ propia, sin depender de servicios cloud para los datos. Firestore es un servicio administrado de Google: no se puede instalar ni correr dentro de la Pi. Esta spec cubre el reemplazo de Firestore por una base de datos self-hosted para que ese despliegue local sea posible.

## 2. Alcance de esta spec

- Reemplazo **total** de Firestore como almacenamiento de datos (`Usuarios`, `Partidos`, `Inscripciones`) por SQLite, en todo el backend — un solo camino de código, tanto para correr en la Raspberry como en cualquier otro entorno (incluido Render, si se vuelve a desplegar ahí).
- El login con Google (Firebase Authentication, `admin.auth().verifyIdToken()` en `verificarToken.js`) **no cambia** — sigue usando Firebase Auth tal como está. Sigue requiriendo conexión a internet para validar el token de Google; eso es inherente a usar login con Google y es independiente de dónde vive la base de datos.
- Reescritura de los 3 servicios de datos y sus tests.
- Actualización de `CLAUDE.md` para reflejar la nueva arquitectura de datos.
- Fuera de esta spec (se hacen después, una vez migrado el código): la guía de rewrite de Render y la guía de deploy en Raspberry Pi, que son entregables de documentación que dependen de que este cambio esté hecho.

## 3. Decisiones clave (resueltas en brainstorming)

- **Motor de base de datos**: SQLite vía `better-sqlite3` (driver síncrono, sin proceso de servidor separado, mínimo consumo de RAM — apropiado para una Pi 3B+ con 1GB de RAM y para el volumen de uso de esta app). Se descarta Postgres (requiere administrar un servicio aparte) y se descarta usar un ORM (Sequelize/Prisma): son 3 tablas simples y el proyecto ya tiene un estilo de acceso a datos directo, sin ORM.
- **Alcance de la migración**: reemplazo total, no soporte dual Firestore/SQLite por variable de entorno. Un solo camino de código es más simple de mantener.
- **Contratos de servicio sin cambios**: las funciones exportadas por `usuariosService.js`, `partidosService.js` e `inscripcionesService.js` mantienen el mismo nombre, misma firma y mismo shape de retorno. Controllers y rutas no se tocan.
- **IDs**: `Usuarios.uid` sigue siendo el UID de Google (viene de Firebase Auth, no de Firestore, así que no cambia). `Partidos.id` e `Inscripciones.id` pasan a generarse con `crypto.randomUUID()` (nativo de Node) en el momento de la inserción, en vez de autogenerarse en Firestore.
- **Fechas**: ya se guardan como strings ISO (`new Date().toISOString()`) en el código actual — se guardan igual como `TEXT` en SQLite, sin cambios de formato.
- **Tests**: se reemplaza el mock de Firestore (`tests/helpers/mockFirestore.js`) por una base SQLite real en memoria (`:memory:`) por archivo de test, con el schema real aplicado. Es más confiable que mockear la API de Firestore a mano y detecta errores de SQL reales.

## 4. Esquema SQL

Nuevo archivo `backend/src/db/schema.sql`:

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

`estaSancionado` se guarda como `INTEGER` (0/1, no hay tipo boolean nativo en SQLite); la capa de servicio lo convierte a `Boolean` al leer, igual que hoy Firestore devuelve un boolean real.

## 5. Capa de acceso a datos

### `backend/src/config/db.js` (nuevo)

```js
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../data/furboapp.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

module.exports = { db };
```

### `backend/src/config/firebase.js` (se simplifica)

Se le quita `admin.firestore()` — solo queda para inicializar `admin` y poder llamar `admin.auth().verifyIdToken()` en `verificarToken.js`:

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

`verificarToken.js` ya solo importa `{ admin }`, así que no requiere cambios.

## 6. Reescritura de servicios

### `usuariosService.js`

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

### `partidosService.js`

Mismas validaciones de `fecha`, `cupoTitulares`, `cupoSuplentes` que hoy. Cambia solo la persistencia:

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');

// crearErrorValidacion(...) sin cambios

async function crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor }) {
  // ...mismas validaciones que hoy...

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

### `inscripcionesService.js`

Misma lógica de negocio (validaciones, asignación titular/suplente, sanción al bajar titular, promoción), cambia solo la persistencia:

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const partidosService = require('./partidosService');

// crearError(...) sin cambios

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
  // ...mismas validaciones que hoy (usuario, sanción, partido abierto, sin inscripción activa, cupos)...

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
  // ...mismas validaciones que hoy...
  db.prepare("UPDATE Inscripciones SET tipo = 'titular' WHERE id = ?").run(inscripcion.id);
  return { ...inscripcion, tipo: 'titular' };
}

async function listarActivas(partidoId) {
  return db.prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado'`).all(partidoId);
}

module.exports = { anotarse, bajarse, promover, contarOcupados, obtenerInscripcionActiva, listarActivas };
```

## 7. Tests

Se reemplaza `tests/helpers/mockFirestore.js` por `tests/helpers/testDb.js`:

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

Patrón en cada archivo de test (ejemplo con `usuariosService.test.js`):

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');

beforeEach(() => {
  mockDb.exec('DELETE FROM Usuarios');
});
```

(El prefijo `mockDb` es necesario porque `babel-plugin-jest-hoist` solo permite referenciar, dentro del factory de `jest.mock`, variables cuyo nombre empieza con `mock`.)

Los tres archivos de test (`usuariosService.test.js`, `partidosService.test.js`, `inscripcionesService.test.js`) se reescriben para insertar filas reales de setup (en vez de mockear `.get()`/`.add()`/`.where()`) y para no asumir IDs fijos generados por Firestore — donde el test actual espera un `id` exacto (ej. `'partido-1'`), pasa a esperar `expect.any(String)` porque ahora el ID lo genera `crypto.randomUUID()`. Los casos de test en sí (qué se prueba) no cambian, solo el mecanismo de arrange/assert.

## 8. Dependencias y archivos de configuración

- `backend/package.json`: agregar dependencia `better-sqlite3`. Se mantiene `firebase-admin` (sigue haciendo falta para `admin.auth().verifyIdToken()`).
- Nueva carpeta `backend/data/` (contiene el archivo `.db` en runtime) con un `.gitkeep`; se agrega a `backend/.gitignore`: `data/*.db`, `data/*.db-wal`, `data/*.db-shm`.
- `backend/.env.example`: se agrega `SQLITE_DB_PATH` (opcional, default `backend/data/furboapp.db`). `FIREBASE_SERVICE_ACCOUNT` y `ADMIN_EMAILS` se mantienen sin cambios (siguen haciendo falta para Auth).

## 9. Documentación derivada (fuera de esta spec, se hacen después)

Una vez migrado el código e implementado + verificado (tests en verde), se escriben dos guías independientes:

1. **Guía de rewrite en Render** — pasos en el dashboard de Render (Static Site → Redirects/Rewrites) para que el refresh en rutas del frontend deje de dar 404. No depende de esta migración.
2. **Guía de deploy en Raspberry Pi 3B+** — cómo instalar Node en la Pi, clonar el repo, configurar variables de entorno (incluido dónde vive el archivo `.db` — recomendando un disco/USB externo en vez de la SD card por durabilidad de escrituras), correr el backend con SQLite local, buildear y servir el frontend (con un servidor estático simple, ej. `serve` o Nginx), y dejarlo corriendo persistente (ej. con `pm2` o un servicio `systemd`). Esta guía sí depende de que la migración de esta spec esté implementada, porque hoy no existe ningún modo de correr el backend sin Firestore.

## 10. Actualización de `CLAUDE.md`

La sección 3 ("Stack Tecnológico") y sección 5 ("Modelo de Datos (Firestore NoSQL)") de `CLAUDE.md` mencionan Firestore explícitamente como la base de datos del proyecto. Se actualizan para reflejar SQLite como almacenamiento de datos, dejando claro que Firebase Authentication (Google Sign-In) se mantiene sin cambios.

## 11. No incluido (fuera de alcance)

- Soporte dual Firestore/SQLite.
- Migración de datos existentes desde un Firestore en producción (no hay datos productivos que migrar según el contexto de este proyecto; si los hubiera, sería un script aparte).
- Cambios al flujo de autenticación / login con Google.
- Las dos guías de despliegue en sí (Render rewrite, Raspberry Pi) — son el entregable siguiente, después de que este código esté implementado.
- Backups automáticos del archivo SQLite (se puede mencionar como recomendación en la guía de la Raspberry, pero no es parte del código).
