# Multi Tenant: Sistema de Grupos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compartimentar FurboApp por Grupo (liga), de forma que partidos, inscripciones, resultados, votos y sanciones queden aislados por Grupo, con rol de admin y sanción por-grupo en vez de globales.

**Architecture:** Nueva tabla `Grupos` + tabla de membresía `UsuariosGrupos` (rol y sanción por grupo). `Partidos` gana `grupoId`. Todas las rutas de partidos/inscripciones/resultados/votos/sancionados se anidan bajo `/api/grupos/:grupoId/...` y pasan por un middleware nuevo `verificarMiembroGrupo` que reemplaza al `verificarAdmin` actual. El frontend agrega un `GrupoContext` que guarda el "grupo activo" (localStorage) y lo antepone a las llamadas Axios existentes.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend, con Jest para tests de servicios), React/Vite/Axios (frontend, sin test runner — verificación manual/browser).

**Spec:** `docs/superpowers/specs/2026-08-17-multi-tenant-grupos-design.md`

## Global Constraints

- Tablas nuevas: `Grupos(id, nombre, codigoInvitacion UNIQUE, creadoPor, fechaCreacion)`, `UsuariosGrupos(id, grupoId, usuarioId, rol CHECK IN ('admin','jugador'), estaSancionado, fechaIngreso)` con índice único `(grupoId, usuarioId)`.
- `Usuarios` pierde `rol` y `estaSancionado`; gana `esSuperAdmin INTEGER NOT NULL DEFAULT 0` (seteado igual que el `rol='admin'` de hoy, vía `ADMIN_EMAILS`).
- `Partidos` gana `grupoId TEXT NOT NULL REFERENCES Grupos(id)`.
- Rutas anidadas: `/api/grupos/:grupoId/partidos/...` y `/api/grupos/:grupoId/usuarios/...`. Rutas nuevas no anidadas: `POST /api/grupos`, `POST /api/grupos/unirse`, `GET /api/grupos/mios`. Auth (`/auth/*`) y perfil (`/usuarios/me/*`, `/usuarios`, `/usuarios/:uid/perfil`) quedan globales, sin cambio.
- Unirse a un grupo con código válido es directo (sin aprobación de admin).
- Un super admin (`esSuperAdmin`) actúa como admin en cualquier grupo sin necesidad de membresía real — excepto para `anotarse`/`bajarse` (jugar), que sí requieren membresía real.
- 404 (no 403) cuando un `partidoId` de la URL no pertenece al `grupoId` de la URL — para no filtrar existencia de partidos de otros grupos.
- Seguir el patrón existente del proyecto: servicios con Jest (`backend/tests/services/*.test.js`, DB en memoria vía `crearDbDeTest()`), sin test runner en frontend (verificación manual).

---

### Task 1: Schema — tablas Grupos/UsuariosGrupos, Partidos.grupoId, Usuarios.esSuperAdmin

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js`
- Modify: `backend/tests/config/db.test.js`
- Modify: `backend/tests/helpers/testDb.js` (solo si hace falta, ver Step 5)

**Interfaces:**
- Produces: tablas `Grupos`, `UsuariosGrupos` (con índice único `idx_usuarios_grupos_unico`); columna `Usuarios.esSuperAdmin`; columna `Partidos.grupoId` (NOT NULL en instalaciones nuevas). Toda la база de datos de test (`crearDbDeTest()`) queda con este esquema final desde este task en adelante — los demás tasks de test dependen de esto.

- [ ] **Step 1: Editar `schema.sql`**

Reemplazar la tabla `Usuarios` (quitar `rol` y `estaSancionado`, agregar `esSuperAdmin`), agregar `Grupos` y `UsuariosGrupos` antes de `Partidos`, y agregar `grupoId` a `Partidos`:

```sql
CREATE TABLE IF NOT EXISTS Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  esSuperAdmin INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL,
  passwordHash TEXT,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT,
  nombreCompleto TEXT,
  fechaNacimiento TEXT,
  resistencia TEXT,
  ritmoJuego TEXT,
  velocidad INTEGER,
  pegada INTEGER,
  tocaPase INTEGER,
  gambeta INTEGER,
  marcaDefensa INTEGER,
  fisico INTEGER
);

CREATE TABLE IF NOT EXISTS Grupos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigoInvitacion TEXT NOT NULL UNIQUE,
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS UsuariosGrupos (
  id TEXT PRIMARY KEY,
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jugador')),
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaIngreso TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_grupos_unico ON UsuariosGrupos (grupoId, usuarioId);

CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  recordatorioEnviado INTEGER NOT NULL DEFAULT 0
);
```

Dejar el resto del archivo (`Inscripciones`, `Resultados`, `Goles`, `RendimientosJugador`, `VotosMvp`, `SancionesPartido` y sus índices) sin cambios.

- [ ] **Step 2: Agregar migración idempotente en `db.js`**

Agregar al final del archivo, antes de `module.exports`, después de los bloques de migración existentes (después de la migración de `recordatorioEnviado`):

```js
const columnasUsuariosActuales = db.prepare('PRAGMA table_info(Usuarios)').all();
const tieneEsSuperAdmin = columnasUsuariosActuales.some((columna) => columna.name === 'esSuperAdmin');
if (!tieneEsSuperAdmin) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN esSuperAdmin INTEGER NOT NULL DEFAULT 0');
}

const columnasPartidosActuales = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneGrupoId = columnasPartidosActuales.some((columna) => columna.name === 'grupoId');
if (!tieneGrupoId) {
  db.exec('ALTER TABLE Partidos ADD COLUMN grupoId TEXT');
}

const tieneRolLegado = columnasUsuariosActuales.some((columna) => columna.name === 'rol');
if (tieneRolLegado) {
  // Migración única de single-tenant a multi-tenant: crea un Grupo "Legado", le
  // asigna todos los Partidos existentes, y mete a todos los Usuarios existentes
  // como miembros de ese grupo con su rol/sanción actual.
  const migrarALegado = db.transaction(() => {
    const primerAdmin = db.prepare("SELECT uid FROM Usuarios WHERE rol = 'admin' ORDER BY fechaCreacion ASC").get();
    const primerUsuario = db.prepare('SELECT uid FROM Usuarios ORDER BY fechaCreacion ASC').get();
    const creadoPor = primerAdmin?.uid || primerUsuario?.uid;

    if (creadoPor) {
      const grupoLegadoId = crypto.randomUUID();
      const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
      db.prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES (@id, 'Legado', @codigoInvitacion, @creadoPor, @fechaCreacion)`
      ).run({
        id: grupoLegadoId,
        codigoInvitacion: `LEGADO-${sufijo}`,
        creadoPor,
        fechaCreacion: new Date().toISOString(),
      });

      db.prepare('UPDATE Partidos SET grupoId = ? WHERE grupoId IS NULL').run(grupoLegadoId);

      const usuarios = db.prepare('SELECT uid, rol, estaSancionado FROM Usuarios').all();
      for (const usuario of usuarios) {
        db.prepare(
          `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
           VALUES (@id, @grupoId, @usuarioId, @rol, @estaSancionado, @fechaIngreso)`
        ).run({
          id: crypto.randomUUID(),
          grupoId: grupoLegadoId,
          usuarioId: usuario.uid,
          rol: usuario.rol,
          estaSancionado: usuario.estaSancionado,
          fechaIngreso: new Date().toISOString(),
        });
        if (usuario.rol === 'admin') {
          db.prepare('UPDATE Usuarios SET esSuperAdmin = 1 WHERE uid = ?').run(usuario.uid);
        }
      }
    }
  });
  migrarALegado();

  try {
    db.exec('ALTER TABLE Usuarios DROP COLUMN rol');
    db.exec('ALTER TABLE Usuarios DROP COLUMN estaSancionado');
  } catch (error) {
    console.warn('No se pudieron eliminar las columnas legado rol/estaSancionado de Usuarios:', error.message);
  }
}
```

Agregar `const crypto = require('node:crypto');` al principio de `db.js` (no está importado todavía).

- [ ] **Step 3: Correr el backend una vez para confirmar que la migración no rompe**

Run: `cd backend && SQLITE_DB_PATH=:memory: node -e "require('./src/config/db')"`
Expected: imprime `SQLite DB: :memory:` y no tira excepción (en `:memory:` no hay filas legado que migrar, así que el bloque de migración no hace nada).

- [ ] **Step 4: Actualizar `tests/config/db.test.js`**

```javascript
process.env.SQLITE_DB_PATH = ':memory:';

const { db } = require('../../src/config/db');

describe('config/db', () => {
  it('crea las tablas Usuarios, Grupos, UsuariosGrupos, Partidos e Inscripciones', () => {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((fila) => fila.name);

    expect(tablas).toEqual(
      expect.arrayContaining(['Usuarios', 'Grupos', 'UsuariosGrupos', 'Partidos', 'Inscripciones'])
    );
  });

  it('Usuarios tiene esSuperAdmin y ya no tiene rol ni estaSancionado', () => {
    const columnas = db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name);
    expect(columnas).toEqual(expect.arrayContaining(['esSuperAdmin']));
    expect(columnas).not.toEqual(expect.arrayContaining(['rol']));
    expect(columnas).not.toEqual(expect.arrayContaining(['estaSancionado']));
  });

  it('Partidos tiene grupoId NOT NULL', () => {
    const columnas = db.prepare('PRAGMA table_info(Partidos)').all();
    const columna = columnas.find((c) => c.name === 'grupoId');
    expect(columna).toBeDefined();
    expect(columna.notnull).toBe(1);
  });

  it('crea la tabla VotosMvp y las columnas jugadorId/votanteId en RendimientosJugador', () => {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((fila) => fila.name);
    expect(tablas).toEqual(expect.arrayContaining(['VotosMvp']));

    const columnas = db.prepare('PRAGMA table_info(RendimientosJugador)').all().map((c) => c.name);
    expect(columnas).toEqual(expect.arrayContaining(['jugadorId', 'votanteId']));
  });

  it('crea la columna recordatorioEnviado en Partidos con default 0', () => {
    const columnas = db.prepare('PRAGMA table_info(Partidos)').all();
    const columna = columnas.find((c) => c.name === 'recordatorioEnviado');
    expect(columna).toBeDefined();
    expect(columna.notnull).toBe(1);
  });
});
```

Nota: la migración de legado (`rol` → `Grupos`/`UsuariosGrupos`/`esSuperAdmin`) no se ejercita acá porque `crearDbDeTest()`/`SQLITE_DB_PATH=:memory:` arrancan siempre desde `schema.sql` ya en su forma final (sin columna `rol` legado que disparar la migración). Se verifica manualmente en el Task 17 con una copia de una DB pre-existente.

- [ ] **Step 5: Correr los tests de este archivo**

Run: `cd backend && npx jest tests/config/db.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js backend/tests/config/db.test.js
git commit -m "feat(backend): add Grupos/UsuariosGrupos schema and legacy migration"
```

---

### Task 2: Utilidad de código de invitación

**Files:**
- Create: `backend/src/utils/codigoInvitacion.js`
- Create: `backend/tests/utils/codigoInvitacion.test.js`

**Interfaces:**
- Produces: `generarCodigoInvitacion(nombre: string): string` — usado por `gruposService.crearGrupo` (Task 3).

- [ ] **Step 1: Escribir el test primero**

```javascript
const { generarCodigoInvitacion } = require('../../src/utils/codigoInvitacion');

describe('generarCodigoInvitacion', () => {
  it('arma un código con el nombre en mayúsculas y un sufijo', () => {
    const codigo = generarCodigoInvitacion('Fútbol de los Jueves');
    expect(codigo).toMatch(/^FUTBOLDELOS-[A-F0-9]{4}$/);
  });

  it('trunca el nombre a 10 caracteres', () => {
    const codigo = generarCodigoInvitacion('Un Nombre Muy Pero Muy Largo');
    const [slug] = codigo.split('-');
    expect(slug.length).toBeLessThanOrEqual(10);
  });

  it('usa GRUPO si el nombre no deja caracteres alfanuméricos', () => {
    const codigo = generarCodigoInvitacion('!!!');
    expect(codigo.startsWith('GRUPO-')).toBe(true);
  });

  it('genera códigos distintos en llamadas sucesivas', () => {
    const a = generarCodigoInvitacion('Jueves');
    const b = generarCodigoInvitacion('Jueves');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `cd backend && npx jest tests/utils/codigoInvitacion.test.js`
Expected: FAIL con `Cannot find module '../../src/utils/codigoInvitacion'`.

- [ ] **Step 3: Implementar**

```javascript
const crypto = require('node:crypto');

function slugificar(nombre) {
  const limpio = String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10);
  return limpio || 'GRUPO';
}

function generarCodigoInvitacion(nombre) {
  const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `${slugificar(nombre)}-${sufijo}`;
}

module.exports = { generarCodigoInvitacion };
```

- [ ] **Step 4: Correr y confirmar que pasa**

Run: `cd backend && npx jest tests/utils/codigoInvitacion.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/codigoInvitacion.js backend/tests/utils/codigoInvitacion.test.js
git commit -m "feat(backend): add invite code generator util"
```

---

### Task 3: `gruposService` (CRUD de grupos + membresía/sanción por grupo)

**Files:**
- Create: `backend/src/services/gruposService.js`
- Create: `backend/tests/services/gruposService.test.js`

**Interfaces:**
- Consumes: `generarCodigoInvitacion(nombre)` de Task 2; `db` de `../config/db`.
- Produces (usado por Tasks 5, 8, 9, 11 y por el middleware del Task 5):
  - `crearGrupo({ nombre, creadoPor }): Promise<{id, nombre, codigoInvitacion, creadoPor, fechaCreacion}>` — lanza `{status:400}` si nombre vacío.
  - `unirseAGrupo({ codigoInvitacion, usuarioId }): Promise<{id, nombre}>` — lanza `{status:404}` si el código no existe, `{status:409}` si ya es miembro.
  - `listarMisGrupos(usuarioId): Promise<Array<{id, nombre, rol, estaSancionado, codigoInvitacion?}>>` — `codigoInvitacion` solo si `rol === 'admin'`.
  - `obtenerMembresia(grupoId, usuarioId): Promise<{grupoId, usuarioId, rol, estaSancionado} | null>`.
  - `sancionar(grupoId, usuarioId): Promise<void>`.
  - `perdonarSancion(grupoId, usuarioId): Promise<void>` — lanza `{status:404}` si no hay membresía.
  - `listarSancionados(grupoId): Promise<Array<{uid, nombre}>>`.

- [ ] **Step 1: Escribir los tests primero**

```javascript
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const gruposService = require('../../src/services/gruposService');

function insertarUsuario(uid, nombre = 'Usuario') {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (?, ?, ?, 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, `${uid}@gmail.com`);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
});

describe('gruposService.crearGrupo', () => {
  it('rechaza con 400 si el nombre está vacío', async () => {
    insertarUsuario('admin-1');
    await expect(gruposService.crearGrupo({ nombre: '  ', creadoPor: 'admin-1' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('crea el grupo y deja al creador como admin', async () => {
    insertarUsuario('admin-1');

    const grupo = await gruposService.crearGrupo({ nombre: 'Fútbol de los Jueves', creadoPor: 'admin-1' });

    expect(grupo).toMatchObject({ nombre: 'Fútbol de los Jueves', creadoPor: 'admin-1' });
    expect(grupo.codigoInvitacion).toMatch(/^[A-Z0-9]+-[A-F0-9]{4}$/);

    const membresia = await gruposService.obtenerMembresia(grupo.id, 'admin-1');
    expect(membresia).toMatchObject({ rol: 'admin', estaSancionado: false });
  });
});

describe('gruposService.unirseAGrupo', () => {
  it('rechaza con 404 si el código no existe', async () => {
    insertarUsuario('u1');
    await expect(
      gruposService.unirseAGrupo({ codigoInvitacion: 'NO-EXISTE', usuarioId: 'u1' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('agrega al usuario como jugador cuando el código es válido', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Jueves', creadoPor: 'admin-1' });

    const resultado = await gruposService.unirseAGrupo({
      codigoInvitacion: grupo.codigoInvitacion,
      usuarioId: 'u1',
    });

    expect(resultado.id).toBe(grupo.id);
    const membresia = await gruposService.obtenerMembresia(grupo.id, 'u1');
    expect(membresia).toMatchObject({ rol: 'jugador', estaSancionado: false });
  });

  it('rechaza con 409 si ya es miembro', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Jueves', creadoPor: 'admin-1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, usuarioId: 'u1' });

    await expect(
      gruposService.unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, usuarioId: 'u1' })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('gruposService.listarMisGrupos', () => {
  it('incluye codigoInvitacion solo para el admin', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Jueves', creadoPor: 'admin-1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, usuarioId: 'u1' });

    const gruposAdmin = await gruposService.listarMisGrupos('admin-1');
    const gruposJugador = await gruposService.listarMisGrupos('u1');

    expect(gruposAdmin[0].codigoInvitacion).toBe(grupo.codigoInvitacion);
    expect(gruposJugador[0].codigoInvitacion).toBeUndefined();
  });
});

describe('gruposService.sancionar / perdonarSancion / listarSancionados', () => {
  it('sanciona, lista y perdona dentro del grupo correcto', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1', 'Jugador Uno');
    const grupoA = await gruposService.crearGrupo({ nombre: 'Grupo A', creadoPor: 'admin-1' });
    const grupoB = await gruposService.crearGrupo({ nombre: 'Grupo B', creadoPor: 'admin-1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupoA.codigoInvitacion, usuarioId: 'u1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupoB.codigoInvitacion, usuarioId: 'u1' });

    await gruposService.sancionar(grupoA.id, 'u1');

    expect(await gruposService.listarSancionados(grupoA.id)).toEqual([{ uid: 'u1', nombre: 'Jugador Uno' }]);
    expect(await gruposService.listarSancionados(grupoB.id)).toEqual([]);

    await gruposService.perdonarSancion(grupoA.id, 'u1');
    expect(await gruposService.listarSancionados(grupoA.id)).toEqual([]);
  });

  it('perdonarSancion rechaza con 404 si no hay membresía', async () => {
    insertarUsuario('admin-1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Grupo A', creadoPor: 'admin-1' });

    await expect(gruposService.perdonarSancion(grupo.id, 'no-existe')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `cd backend && npx jest tests/services/gruposService.test.js`
Expected: FAIL con `Cannot find module '../../src/services/gruposService'`.

- [ ] **Step 3: Implementar `gruposService.js`**

```javascript
const crypto = require('node:crypto');
const { db } = require('../config/db');
const { generarCodigoInvitacion } = require('../utils/codigoInvitacion');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function agregarMiembro(grupoId, usuarioId, rol) {
  db.prepare(
    `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
     VALUES (@id, @grupoId, @usuarioId, @rol, 0, @fechaIngreso)`
  ).run({ id: crypto.randomUUID(), grupoId, usuarioId, rol, fechaIngreso: new Date().toISOString() });
}

function obtenerMembresiaSync(grupoId, usuarioId) {
  const fila = db
    .prepare('SELECT * FROM UsuariosGrupos WHERE grupoId = ? AND usuarioId = ?')
    .get(grupoId, usuarioId);
  if (!fila) return null;
  return {
    grupoId: fila.grupoId,
    usuarioId: fila.usuarioId,
    rol: fila.rol,
    estaSancionado: Boolean(fila.estaSancionado),
  };
}

async function crearGrupo({ nombre, creadoPor }) {
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) throw crearError('El nombre del grupo es obligatorio', 400);

  const crear = db.transaction(() => {
    let codigoInvitacion;
    let intentos = 0;
    while (intentos < 5) {
      codigoInvitacion = generarCodigoInvitacion(nombreLimpio);
      const existente = db.prepare('SELECT id FROM Grupos WHERE codigoInvitacion = ?').get(codigoInvitacion);
      if (!existente) break;
      intentos += 1;
    }
    if (intentos === 5) throw crearError('No se pudo generar un código de invitación único', 500);

    const grupo = {
      id: crypto.randomUUID(),
      nombre: nombreLimpio,
      codigoInvitacion,
      creadoPor,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (@id, @nombre, @codigoInvitacion, @creadoPor, @fechaCreacion)`
    ).run(grupo);

    agregarMiembro(grupo.id, creadoPor, 'admin');

    return grupo;
  });

  return crear();
}

async function unirseAGrupo({ codigoInvitacion, usuarioId }) {
  const codigo = String(codigoInvitacion || '').trim().toUpperCase();
  const grupo = db.prepare('SELECT * FROM Grupos WHERE codigoInvitacion = ?').get(codigo);
  if (!grupo) throw crearError('Código de invitación inválido', 404);

  if (obtenerMembresiaSync(grupo.id, usuarioId)) {
    throw crearError('Ya sos miembro de este grupo', 409);
  }

  agregarMiembro(grupo.id, usuarioId, 'jugador');
  return { id: grupo.id, nombre: grupo.nombre };
}

async function listarMisGrupos(usuarioId) {
  const filas = db
    .prepare(
      `SELECT g.id, g.nombre, g.codigoInvitacion, ug.rol, ug.estaSancionado
       FROM UsuariosGrupos ug JOIN Grupos g ON g.id = ug.grupoId
       WHERE ug.usuarioId = ? ORDER BY g.nombre COLLATE NOCASE ASC`
    )
    .all(usuarioId);

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    rol: fila.rol,
    estaSancionado: Boolean(fila.estaSancionado),
    ...(fila.rol === 'admin' ? { codigoInvitacion: fila.codigoInvitacion } : {}),
  }));
}

async function obtenerMembresia(grupoId, usuarioId) {
  return obtenerMembresiaSync(grupoId, usuarioId);
}

async function sancionar(grupoId, usuarioId) {
  db.prepare('UPDATE UsuariosGrupos SET estaSancionado = 1 WHERE grupoId = ? AND usuarioId = ?').run(
    grupoId,
    usuarioId
  );
}

async function perdonarSancion(grupoId, usuarioId) {
  if (!obtenerMembresiaSync(grupoId, usuarioId)) {
    throw crearError('El usuario no pertenece a este grupo', 404);
  }
  db.prepare('UPDATE UsuariosGrupos SET estaSancionado = 0 WHERE grupoId = ? AND usuarioId = ?').run(
    grupoId,
    usuarioId
  );
}

async function listarSancionados(grupoId) {
  return db
    .prepare(
      `SELECT u.uid, u.nombre FROM UsuariosGrupos ug
       JOIN Usuarios u ON u.uid = ug.usuarioId
       WHERE ug.grupoId = ? AND ug.estaSancionado = 1`
    )
    .all(grupoId);
}

module.exports = {
  crearGrupo,
  unirseAGrupo,
  listarMisGrupos,
  obtenerMembresia,
  sancionar,
  perdonarSancion,
  listarSancionados,
};
```

- [ ] **Step 4: Correr y confirmar que pasa**

Run: `cd backend && npx jest tests/services/gruposService.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/gruposService.js backend/tests/services/gruposService.test.js
git commit -m "feat(backend): add gruposService (CRUD, membership, per-group sanctions)"
```

---

### Task 4: Actualizar `usuariosService` (quitar rol/sanción, agregar esSuperAdmin)

**Files:**
- Modify: `backend/src/services/usuariosService.js`
- Modify: `backend/tests/services/usuariosService.test.js`

**Interfaces:**
- Produces: `obtenerUsuario(uid)` ya no incluye `rol` ni `estaSancionado`, incluye `esSuperAdmin: boolean`. Usado por Task 5 (middleware) para chequear `esSuperAdmin`.
- Removidas (moved to `gruposService`, Task 3): `sancionar`, `perdonarSancion`, `listarSancionados`.

- [ ] **Step 1: Editar `usuariosService.js`**

Reemplazar `filaAUsuario`:

```javascript
const filaAUsuario = (fila) => {
  if (!fila) return null;
  const { passwordHash, ...resto } = fila;
  return { ...resto, esSuperAdmin: Boolean(fila.esSuperAdmin) };
};
```

Reemplazar `sincronizarUsuario` (quitar `obtenerAdminEmails`/rol → esSuperAdmin):

```javascript
async function sincronizarUsuario({ uid, email, nombre, emailVerificado }) {
  const esSuperAdmin = Boolean(emailVerificado) && obtenerAdminEmails().includes((email || '').toLowerCase());
  const existente = db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);

  if (!existente) {
    const nuevoUsuario = {
      uid,
      nombre,
      email,
      esSuperAdmin,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (@uid, @nombre, @email, @esSuperAdmin, @fechaCreacion)`
    ).run({ ...nuevoUsuario, esSuperAdmin: esSuperAdmin ? 1 : 0 });
    return { ...nuevoUsuario };
  }

  const usuarioExistente = filaAUsuario(existente);
  if (esSuperAdmin && !usuarioExistente.esSuperAdmin) {
    db.prepare('UPDATE Usuarios SET esSuperAdmin = 1 WHERE uid = ?').run(uid);
    usuarioExistente.esSuperAdmin = true;
  }
  return usuarioExistente;
}
```

Quitar por completo las funciones `sancionar`, `perdonarSancion`, `listarSancionados` y sus entradas en `module.exports`.

En `registrarConPassword`, quitar el campo `rol: 'jugador'` del objeto `nuevoUsuario` y de la sentencia `INSERT` (columnas `uid, nombre, email, fechaCreacion, passwordHash` — sin `rol`, sin `estaSancionado`):

```javascript
    const nuevoUsuario = {
      uid: crypto.randomUUID(),
      nombre: String(nombre).trim(),
      email: emailNormalizado,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, fechaCreacion, passwordHash)
       VALUES (@uid, @nombre, @email, @fechaCreacion, @passwordHash)`
    ).run({ ...nuevoUsuario, passwordHash });
    return { ...nuevoUsuario, passwordHash };
```

- [ ] **Step 2: Reescribir `usuariosService.test.js`**

Reemplazar el `insertarUsuario` helper y quitar los `describe` de `listarSancionados`, `perdonarSancion`, `sancionar` (se mudan a `gruposService.test.js`, ya cubiertos en Task 3):

```javascript
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');

function insertarUsuario(overrides = {}) {
  const usuario = {
    uid: 'uid-x',
    nombre: 'Jugador X',
    email: 'x@gmail.com',
    esSuperAdmin: 0,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (@uid, @nombre, @email, @esSuperAdmin, @fechaCreacion)`
    )
    .run(usuario);
  return usuario;
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Usuarios');
  delete process.env.ADMIN_EMAILS;
});

describe('usuariosService.sincronizarUsuario', () => {
  it('crea un usuario nuevo sin esSuperAdmin si el email no está en ADMIN_EMAILS', async () => {
    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-1',
      email: 'jugador@gmail.com',
      nombre: 'Jugador Uno',
    });

    expect(usuario.esSuperAdmin).toBe(false);

    const fila = mockDb.prepare('SELECT * FROM Usuarios WHERE uid = ?').get('uid-1');
    expect(fila.esSuperAdmin).toBe(0);
  });

  it('crea un usuario nuevo con esSuperAdmin si el email está en ADMIN_EMAILS y verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-2',
      email: 'admin@gmail.com',
      nombre: 'Admin Uno',
      emailVerificado: true,
    });

    expect(usuario.esSuperAdmin).toBe(true);
  });

  it('no marca esSuperAdmin si el email está en ADMIN_EMAILS pero no está verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-4',
      email: 'admin@gmail.com',
      nombre: 'Admin Sin Verificar',
      emailVerificado: false,
    });

    expect(usuario.esSuperAdmin).toBe(false);
  });

  it('no degrada a super admin existente y devuelve el usuario tal cual si no hay cambios', async () => {
    insertarUsuario({ uid: 'uid-3', email: 'jugador3@gmail.com', esSuperAdmin: 1 });

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-3',
      email: 'jugador3@gmail.com',
      nombre: 'Jugador Tres',
    });

    expect(usuario.esSuperAdmin).toBe(true);
  });

  it('promueve a super admin un usuario existente cuando su email está en ADMIN_EMAILS y verificado', async () => {
    insertarUsuario({ uid: 'uid-5', email: 'nuevo-admin@gmail.com', esSuperAdmin: 0 });
    process.env.ADMIN_EMAILS = 'nuevo-admin@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-5',
      email: 'nuevo-admin@gmail.com',
      nombre: 'Nuevo Admin',
      emailVerificado: true,
    });

    expect(usuario.esSuperAdmin).toBe(true);

    const fila = mockDb.prepare('SELECT esSuperAdmin FROM Usuarios WHERE uid = ?').get('uid-5');
    expect(fila.esSuperAdmin).toBe(1);
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

    expect(usuario).toMatchObject({ uid: 'uid-x', esSuperAdmin: false });
  });
});
```

(Dejar sin cambios el resto de los `describe` del archivo que no dependan de `rol`/`estaSancionado`, si los hubiera — en este archivo no hay más.)

- [ ] **Step 3: Correr los tests**

Run: `cd backend && npx jest tests/services/usuariosService.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/usuariosService.js backend/tests/services/usuariosService.test.js
git commit -m "feat(backend): replace global rol/estaSancionado with esSuperAdmin on Usuarios"
```

---

### Task 5: Middleware `verificarMiembroGrupo` + rutas de Grupos

**Files:**
- Create: `backend/src/middlewares/verificarMiembroGrupo.js`
- Create: `backend/src/controllers/gruposController.js`
- Create: `backend/src/routes/gruposRoutes.js`
- Modify: `backend/src/app.js`
- Delete: `backend/src/middlewares/verificarAdmin.js` (ya no se usa — reemplazado por `verificarMiembroGrupo`; el reemplazo completo de sus usos ocurre en los Tasks 7 y 11)

**Interfaces:**
- Produces: `verificarMiembroGrupo(rolRequerido?: 'admin'): RequestHandler` — inyecta `req.miembro = {grupoId, usuarioId, rol, estaSancionado}`; usado por Tasks 7 y 11 en `partidosRoutes.js` y `usuariosGrupoRoutes.js`.
- Consumes: `usuariosService.obtenerUsuario` (Task 4), `gruposService.obtenerMembresia` (Task 3).

- [ ] **Step 1: Implementar el middleware**

```javascript
const usuariosService = require('../services/usuariosService');
const gruposService = require('../services/gruposService');

function verificarMiembroGrupo(rolRequerido) {
  return async function (req, res, next) {
    try {
      const { grupoId } = req.params;
      const usuario = await usuariosService.obtenerUsuario(req.usuario.uid);

      if (usuario?.esSuperAdmin) {
        req.miembro = { grupoId, usuarioId: req.usuario.uid, rol: 'admin', estaSancionado: false };
        return next();
      }

      const membresia = await gruposService.obtenerMembresia(grupoId, req.usuario.uid);
      if (!membresia) {
        return res.status(403).json({ error: 'No pertenecés a este grupo' });
      }
      if (rolRequerido === 'admin' && membresia.rol !== 'admin') {
        return res.status(403).json({ error: 'Requiere rol de administrador del grupo' });
      }

      req.miembro = membresia;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = verificarMiembroGrupo;
```

- [ ] **Step 2: Borrar el middleware viejo**

Run: `rm backend/src/middlewares/verificarAdmin.js`

(Sus dos únicos usos actuales, en `partidosRoutes.js` y `usuariosRoutes.js`, se reemplazan en los Tasks 7 y 11 — hasta entonces el proyecto no levanta; eso es intencional y se corrige dentro de este mismo ciclo de tasks antes de correr la app end-to-end en el Task 17.)

- [ ] **Step 3: Controller de Grupos**

```javascript
const gruposService = require('../services/gruposService');

async function crear(req, res) {
  const grupo = await gruposService.crearGrupo({ nombre: req.body.nombre, creadoPor: req.usuario.uid });
  res.status(201).json(grupo);
}

async function unirse(req, res) {
  const grupo = await gruposService.unirseAGrupo({
    codigoInvitacion: req.body.codigoInvitacion,
    usuarioId: req.usuario.uid,
  });
  res.status(201).json(grupo);
}

async function listarMios(req, res) {
  const grupos = await gruposService.listarMisGrupos(req.usuario.uid);
  res.json(grupos);
}

module.exports = { crear, unirse, listarMios };
```

- [ ] **Step 4: Rutas de Grupos**

```javascript
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const envolverAsync = require('../utils/envolverAsync');
const gruposController = require('../controllers/gruposController');

const router = express.Router();

router.post('/', verificarToken, envolverAsync(gruposController.crear));
router.post('/unirse', verificarToken, envolverAsync(gruposController.unirse));
router.get('/mios', verificarToken, envolverAsync(gruposController.listarMios));

module.exports = router;
```

- [ ] **Step 5: Montar en `app.js`**

Agregar el require y el `app.use`:

```javascript
const gruposRoutes = require('./routes/gruposRoutes');
...
app.use('/api/grupos', gruposRoutes);
```

(La app no levantará todavía sin errores hasta terminar el Task 7 — `partidosRoutes.js` sigue importando `verificarAdmin`, que fue borrado. Es esperado en este punto del plan.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/middlewares/verificarMiembroGrupo.js backend/src/controllers/gruposController.js backend/src/routes/gruposRoutes.js backend/src/app.js
git rm backend/src/middlewares/verificarAdmin.js
git commit -m "feat(backend): add verificarMiembroGrupo middleware and /api/grupos routes"
```

---

### Task 6: `partidosService` con `grupoId`

**Files:**
- Modify: `backend/src/services/partidosService.js`
- Modify: `backend/tests/services/partidosService.test.js`

**Interfaces:**
- Produces: `crearPartido({fecha, cupoTitulares, cupoSuplentes, creadoPor, grupoId})`; `obtenerPartido(partidoId, grupoId)` — ahora **requiere** `grupoId` y devuelve `null` si el partido no existe o pertenece a otro grupo (los llamadores externos deciden si eso es 404); `listarPartidosVisibles(grupoId)`; `listarPartidosJugados(grupoId)`; `eliminarPartido(partidoId, grupoId, uid)`. `cerrarPartidosVencidos()` sin cambios (job global, no pasa por `obtenerPartido`).
- Consumido por: Task 7 (`partidosController`), Task 8 (`inscripcionesService`), Task 10 (`resultadosService`/`votosService`).

- [ ] **Step 1: Editar `partidosService.js`**

```javascript
const crypto = require('node:crypto');
const { db } = require('../config/db');

function crearErrorValidacion(mensaje) {
  const error = new Error(mensaje);
  error.status = 400;
  return error;
}

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor, grupoId }) {
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
    grupoId,
    cupoTitulares,
    cupoSuplentes,
    recordatorioEnviado: 0,
  };
  db.prepare(
    `INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes)
     VALUES (@id, @fecha, @estado, @creadoPor, @grupoId, @cupoTitulares, @cupoSuplentes)`
  ).run(nuevoPartido);
  return nuevoPartido;
}

async function obtenerPartido(partidoId, grupoId) {
  const partido = db.prepare('SELECT * FROM Partidos WHERE id = ?').get(partidoId);
  if (!partido || partido.grupoId !== grupoId) return null;
  return partido;
}

function listarPartidosVisibles(grupoId) {
  const abiertos = db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto' AND grupoId = ?").all(grupoId);
  const ultimoNoAbierto = db
    .prepare("SELECT * FROM Partidos WHERE estado IN ('cerrado','jugado') AND grupoId = ? ORDER BY fecha DESC LIMIT 1")
    .get(grupoId);
  return ultimoNoAbierto ? [...abiertos, ultimoNoAbierto] : abiertos;
}

async function eliminarPartido(partidoId, grupoId, uid) {
  const partido = await obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.creadoPor !== uid) {
    throw crearError('Solo el admin que creó el partido puede eliminarlo', 403);
  }

  const resultadosService = require('./resultadosService');
  const inscripcionesService = require('./inscripcionesService');
  const eliminar = db.transaction(() => {
    resultadosService.eliminarPorPartido(partidoId);
    inscripcionesService.eliminarPorPartido(partidoId);
    db.prepare('DELETE FROM Partidos WHERE id = ?').run(partidoId);
  });
  eliminar();
}

function cerrarPartidosVencidos() {
  db.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE estado = 'abierto' AND fecha <= ?").run(
    new Date().toISOString()
  );
}

function listarPartidosJugados(grupoId) {
  return db.prepare("SELECT * FROM Partidos WHERE estado = 'jugado' AND grupoId = ? ORDER BY fecha DESC").all(grupoId);
}

module.exports = {
  crearPartido,
  obtenerPartido,
  listarPartidosVisibles,
  eliminarPartido,
  cerrarPartidosVencidos,
  listarPartidosJugados,
};
```

- [ ] **Step 2: Actualizar `partidosService.test.js`**

Agregar creación de un Grupo en `beforeEach` y `grupoId` a todas las llamadas de `crearPartido`/`listarPartidosVisibles`/`listarPartidosJugados`:

```javascript
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const partidosService = require('../../src/services/partidosService');

const GRUPO_ID = 'grupo-1';

function insertarUsuarioAdmin() {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES ('admin-1', 'Admin Uno', 'admin@gmail.com', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run();
}

function insertarGrupo() {
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (?, 'Grupo de test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run(GRUPO_ID);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM VotosMvp');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuarioAdmin();
  insertarGrupo();
});
```

Y en cada llamada de test a `crearPartido({...})` agregar `grupoId: GRUPO_ID`; en `obtenerPartido(id)` pasar a `obtenerPartido(id, GRUPO_ID)`; en `listarPartidosVisibles()` pasar a `listarPartidosVisibles(GRUPO_ID)`; en `listarPartidosJugados()` (si lo hubiera en este archivo) pasar a `listarPartidosJugados(GRUPO_ID)`. Además, agregar un test nuevo de aislamiento:

```javascript
describe('partidosService.obtenerPartido — aislamiento por grupo', () => {
  it('devuelve null si el partido pertenece a otro grupo', async () => {
    mockDb
      .prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES ('grupo-2', 'Otro grupo', 'TEST-0002', 'admin-1', '2026-01-01T00:00:00.000Z')`
      )
      .run();
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    const resultado = await partidosService.obtenerPartido(partido.id, 'grupo-2');

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 3: Correr los tests**

Run: `cd backend && npx jest tests/services/partidosService.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/partidosService.js backend/tests/services/partidosService.test.js
git commit -m "feat(backend): scope partidosService by grupoId"
```

---

### Task 7: `partidosController`/`partidosRoutes` anidadas bajo `/api/grupos/:grupoId`

**Files:**
- Modify: `backend/src/controllers/partidosController.js`
- Modify: `backend/src/routes/partidosRoutes.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `partidosService` (Task 6), `verificarMiembroGrupo` (Task 5).

- [ ] **Step 1: Editar `partidosController.js`**

```javascript
const partidosService = require('../services/partidosService');
const inscripcionesService = require('../services/inscripcionesService');

async function listar(req, res) {
  const partidos = await partidosService.listarPartidosVisibles(req.params.grupoId);
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
    }))
  );
  res.json(partidosConCupos);
}

async function historial(req, res) {
  const partidos = await partidosService.listarPartidosJugados(req.params.grupoId);
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
    }))
  );
  res.json(partidosConCupos);
}

async function crear(req, res) {
  const { fecha, cupoTitulares, cupoSuplentes } = req.body;
  const partido = await partidosService.crearPartido({
    fecha,
    cupoTitulares,
    cupoSuplentes,
    creadoPor: req.usuario.uid,
    grupoId: req.params.grupoId,
  });
  res.status(201).json(partido);
}

async function eliminar(req, res) {
  const { partidoId, grupoId } = req.params;
  await partidosService.eliminarPartido(partidoId, grupoId, req.usuario.uid);
  res.status(204).send();
}

module.exports = { listar, historial, crear, eliminar };
```

- [ ] **Step 2: Editar `partidosRoutes.js`**

```javascript
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const partidosController = require('../controllers/partidosController');
const inscripcionesController = require('../controllers/inscripcionesController');
const resultadosController = require('../controllers/resultadosController');
const votosController = require('../controllers/votosController');

const router = express.Router({ mergeParams: true });

router.get('/', verificarToken, verificarMiembroGrupo(), envolverAsync(partidosController.listar));
router.get('/historial', verificarToken, verificarMiembroGrupo(), envolverAsync(partidosController.historial));
router.post('/', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(partidosController.crear));
router.delete('/:partidoId', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(partidosController.eliminar));
router.post('/:partidoId/anotarse', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.anotarse));
router.post('/:partidoId/bajarse', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.bajarse));
router.get('/:partidoId/inscripciones', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.listarPorPartido));
router.get('/:partidoId/formacion', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.verFormacion));
router.put(
  '/:partidoId/formacion',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.guardarFormacion)
);
router.post(
  '/:partidoId/formacion/auto',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.generarFormacionAutomatica)
);
router.post(
  '/:partidoId/promover/:usuarioId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.promover)
);
router.post(
  '/:partidoId/sancionar/:usuarioId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.sancionarManualmente)
);

router.get('/:partidoId/resultado', verificarToken, verificarMiembroGrupo(), envolverAsync(resultadosController.obtener));
router.put(
  '/:partidoId/resultado',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(resultadosController.guardar)
);

router.get('/:partidoId/votos/mios', verificarToken, verificarMiembroGrupo(), envolverAsync(votosController.obtenerMios));
router.post('/:partidoId/votos', verificarToken, verificarMiembroGrupo(), envolverAsync(votosController.guardar));

module.exports = router;
```

- [ ] **Step 3: Montar anidado en `app.js`**

Reemplazar `app.use('/api/partidos', partidosRoutes);` por:

```javascript
app.use('/api/grupos/:grupoId/partidos', partidosRoutes);
```

- [ ] **Step 4: Smoke test manual del arranque**

Run: `cd backend && SQLITE_DB_PATH=:memory: JWT_SECRET=test-secret node -e "require('./src/app')" && echo OK`
Expected: imprime `SQLite DB: :memory:` y `OK`, sin excepciones (los controllers de `inscripcionesController`/`resultadosController`/`votosController` todavía no leen `grupoId` — eso es Tasks 8-10 — pero el require de rutas/app no debe tirar error de sintaxis ni de módulo faltante).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/partidosController.js backend/src/routes/partidosRoutes.js backend/src/app.js
git commit -m "feat(backend): nest partidos routes under /api/grupos/:grupoId"
```

---

### Task 8: `inscripcionesService` — sanción/membresía por grupo

**Files:**
- Modify: `backend/src/services/inscripcionesService.js`
- Modify: `backend/tests/services/inscripcionesService.test.js`

**Interfaces:**
- Produces: `anotarse(partidoId, grupoId, usuarioId, body)`, `bajarse(partidoId, grupoId, usuarioId)`, `promover(partidoId, grupoId, usuarioId)`, `sancionarManualmente(partidoId, grupoId, usuarioId)`, `obtenerFormacion(partidoId, grupoId)`, `guardarFormacion(partidoId, grupoId, asignaciones)`, `generarFormacionAutomatica(partidoId, grupoId)`. Sin cambios: `contarOcupados(partidoId)`, `obtenerInscripcionActiva(partidoId, usuarioId)`, `listarActivas(partidoId)`, `eliminarPorPartido(partidoId)` (siguen recibiendo solo `partidoId` — la validación de que ese `partidoId` pertenece al `grupoId` de la URL ya ocurrió en la función de entrada vía `partidosService.obtenerPartido(partidoId, grupoId)`).
- Consumes: `gruposService.obtenerMembresia`, `gruposService.sancionar` (Task 3) en vez de `usuariosService.obtenerUsuario(...).estaSancionado` / `usuariosService.sancionar`.

- [ ] **Step 1: Editar `inscripcionesService.js`**

Agregar el require de `gruposService` junto a los otros:

```javascript
const gruposService = require('./gruposService');
```

Reemplazar `anotarse`:

```javascript
async function anotarse(partidoId, grupoId, usuarioId, { posicionPrincipal, posicionSecundaria } = {}) {
  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    throw crearError('Posiciones inválidas', 400);
  }

  const membresia = await gruposService.obtenerMembresia(grupoId, usuarioId);
  if (!membresia) throw crearError('No pertenecés a este grupo', 403);
  if (membresia.estaSancionado) throw crearError('Estás sancionado y no podés anotarte', 403);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
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
    posicionPrincipal,
    posicionSecundaria,
  };
  db.prepare(
    `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, posicionSecundaria)
     VALUES (@id, @partidoId, @usuarioId, @estado, @tipo, @orden, @fechaInscripcion, @posicionPrincipal, @posicionSecundaria)`
  ).run(nuevaInscripcion);
  return nuevaInscripcion;
}
```

Reemplazar `bajarse`:

```javascript
async function bajarse(partidoId, grupoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('No estás anotado en este partido', 400);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido ya no está abierto', 400);

  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);

  if (inscripcion.tipo === 'titular') {
    await gruposService.sancionar(grupoId, usuarioId);
  }

  return { ...inscripcion, estado: 'dado_de_baja' };
}
```

Reemplazar `sancionarManualmente` (agrega validación de scoping que no existía):

```javascript
async function sancionarManualmente(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'titular') throw crearError('Solo se puede sancionar a jugadores titulares', 400);

  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);
  await gruposService.sancionar(grupoId, usuarioId);

  return { ...inscripcion, estado: 'dado_de_baja' };
}
```

Reemplazar `promover` (agrega `grupoId` a `obtenerPartido`):

```javascript
async function promover(partidoId, grupoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'suplente') throw crearError('El jugador ya es titular', 400);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares >= partido.cupoTitulares) {
    throw crearError('No hay lugares de titular disponibles', 400);
  }

  db.prepare("UPDATE Inscripciones SET tipo = 'titular' WHERE id = ?").run(inscripcion.id);
  return { ...inscripcion, tipo: 'titular' };
}
```

En `obtenerFormacion`, `guardarFormacion` y `generarFormacionAutomatica`, agregar el parámetro `grupoId` como segundo argumento y pasarlo al `partidosService.obtenerPartido(partidoId, grupoId)` interno de cada una (sin otro cambio):

```javascript
async function obtenerFormacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  // ... resto sin cambios
}

async function generarFormacionAutomatica(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  // ... resto sin cambios
}

async function guardarFormacion(partidoId, grupoId, asignaciones) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  // ... resto sin cambios, incluida la llamada final a `obtenerFormacion(partidoId)`
  //     que debe pasar a `obtenerFormacion(partidoId, grupoId)`
}
```

- [ ] **Step 2: Actualizar `inscripcionesService.test.js`**

Agregar creación de Grupo y pasar `grupoId` (constante `GRUPO_ID = 'grupo-1'`) a todas las llamadas de `crearPartidoAbierto` (que a su vez pasa `grupoId` a `partidosService.crearPartido`), y a `anotarse`/`bajarse`/`promover`/`sancionarManualmente`. Reemplazar los `beforeEach`/helpers:

```javascript
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const gruposService = require('../../src/services/gruposService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

const POSICIONES_DEFAULT = { posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' };
const GRUPO_ID = 'grupo-1';

async function crearUsuario(overrides = {}) {
  const usuario = await usuariosService.sincronizarUsuario({
    uid: 'u1',
    email: 'u1@gmail.com',
    nombre: 'Usuario Uno',
    ...overrides,
  });
  const yaMiembro = await gruposService.obtenerMembresia(GRUPO_ID, usuario.uid);
  if (!yaMiembro) {
    mockDb
      .prepare(
        `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
         VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
      )
      .run(`ug-${usuario.uid}`, GRUPO_ID, usuario.uid);
  }
  return usuario;
}

async function crearPartidoAbierto(overrides = {}) {
  const admin = await crearUsuario({ uid: 'admin-1', email: 'admin@gmail.com' });
  return partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 1,
    creadoPor: admin.uid,
    grupoId: GRUPO_ID,
    ...overrides,
  });
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (?, 'Grupo de test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run(GRUPO_ID);
});
```

Notar que `insertarGrupo` referencia `creadoPor: 'admin-1'` antes de que ese usuario exista — como `Usuarios` no tiene foreign keys activas (`db.pragma('foreign_keys = OFF')` en `testDb.js`), esto no rompe; es el mismo patrón que ya usaba `partidosService.test.js` con `Partidos.creadoPor`.

En cada test, reemplazar:
- `inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT)` → `inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT)` (y análogo para `u2`, `u3`, `no-existe`).
- `inscripcionesService.bajarse(partido.id, 'u1')` → `inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u1')`.
- `inscripcionesService.promover(partido.id, 'u1')` → `inscripcionesService.promover(partido.id, GRUPO_ID, 'u1')`.
- `inscripcionesService.sancionarManualmente(partido.id, 'u1')` → `inscripcionesService.sancionarManualmente(partido.id, GRUPO_ID, 'u1')`.

En los tests que hoy chequean sanción vía `usuariosService.obtenerUsuario('u1').estaSancionado`, cambiar a `gruposService.obtenerMembresia(GRUPO_ID, 'u1').estaSancionado`:

```javascript
  it('sanciona al usuario si era titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    await inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u1');

    const membresia = await gruposService.obtenerMembresia(GRUPO_ID, 'u1');
    expect(membresia.estaSancionado).toBe(true);
  });
```

(Aplicar el mismo cambio en el resto de las aserciones de sanción del archivo: "NO sanciona al usuario si era suplente", "rechaza con 400 si el jugador es suplente" y "da de baja y sanciona al usuario si es titular".)

También rechaza con 403 si el usuario está sancionado — ese test ya existía; sanciona primero (`await usuariosService.sancionar('u1')` → cambiar a `await gruposService.sancionar(GRUPO_ID, 'u1')`) y agrega `GRUPO_ID` a la llamada de `anotarse`.

Agregar un test nuevo de aislamiento entre grupos:

```javascript
describe('inscripcionesService.anotarse — aislamiento por grupo', () => {
  it('rechaza con 403 si el usuario no es miembro del grupo', async () => {
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'usuario-de-otro-grupo', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 404 si el partido pertenece a otro grupo', async () => {
    mockDb
      .prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES ('grupo-2', 'Otro grupo', 'TEST-0002', 'admin-1', '2026-01-01T00:00:00.000Z')`
      )
      .run();
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(
      inscripcionesService.anotarse(partido.id, 'grupo-2', 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 3: Correr los tests**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/inscripcionesService.js backend/tests/services/inscripcionesService.test.js
git commit -m "feat(backend): scope inscripcionesService sanctions by grupo membership"
```

---

### Task 9: `inscripcionesController` — leer `grupoId` de la URL

**Files:**
- Modify: `backend/src/controllers/inscripcionesController.js`

**Interfaces:**
- Consumes: `inscripcionesService` (Task 8), `partidosService.obtenerPartido` (Task 6, para el guard de `listarPorPartido`).

- [ ] **Step 1: Editar el controller**

```javascript
const inscripcionesService = require('../services/inscripcionesService');
const partidosService = require('../services/partidosService');
const usuariosService = require('../services/usuariosService');

async function anotarse(req, res) {
  const inscripcion = await inscripcionesService.anotarse(
    req.params.partidoId,
    req.params.grupoId,
    req.usuario.uid,
    req.body
  );
  res.status(201).json(inscripcion);
}

async function bajarse(req, res) {
  const inscripcion = await inscripcionesService.bajarse(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(inscripcion);
}

async function promover(req, res) {
  const inscripcion = await inscripcionesService.promover(
    req.params.partidoId,
    req.params.grupoId,
    req.params.usuarioId
  );
  res.json(inscripcion);
}

async function sancionarManualmente(req, res) {
  const inscripcion = await inscripcionesService.sancionarManualmente(
    req.params.partidoId,
    req.params.grupoId,
    req.params.usuarioId
  );
  res.json(inscripcion);
}

async function listarPorPartido(req, res) {
  const partido = await partidosService.obtenerPartido(req.params.partidoId, req.params.grupoId);
  if (!partido) {
    const error = new Error('Partido no encontrado');
    error.status = 404;
    throw error;
  }
  const inscripciones = await inscripcionesService.listarActivas(req.params.partidoId);
  const conNombre = await Promise.all(
    inscripciones.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        tipo: inscripcion.tipo,
        posicionPrincipal: inscripcion.posicionPrincipal,
        posicionSecundaria: inscripcion.posicionSecundaria,
      };
    })
  );
  res.json(conNombre);
}

async function verFormacion(req, res) {
  const formacion = await inscripcionesService.obtenerFormacion(req.params.partidoId, req.params.grupoId);
  res.json(formacion);
}

async function guardarFormacion(req, res) {
  const formacion = await inscripcionesService.guardarFormacion(
    req.params.partidoId,
    req.params.grupoId,
    req.body.asignaciones
  );
  res.json(formacion);
}

async function generarFormacionAutomatica(req, res) {
  const formacion = await inscripcionesService.generarFormacionAutomatica(req.params.partidoId, req.params.grupoId);
  res.json(formacion);
}

module.exports = {
  anotarse,
  bajarse,
  promover,
  sancionarManualmente,
  listarPorPartido,
  verFormacion,
  guardarFormacion,
  generarFormacionAutomatica,
};
```

- [ ] **Step 2: Smoke test de arranque**

Run: `cd backend && SQLITE_DB_PATH=:memory: JWT_SECRET=test-secret node -e "require('./src/app')" && echo OK`
Expected: `OK` sin excepciones.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/inscripcionesController.js
git commit -m "feat(backend): thread grupoId through inscripcionesController"
```

---

### Task 10: `resultadosService` y `votosService` con `grupoId`

**Files:**
- Modify: `backend/src/services/resultadosService.js`
- Modify: `backend/src/services/votosService.js`
- Modify: `backend/tests/services/resultadosService.test.js`
- Modify: `backend/tests/services/votosService.test.js`

**Interfaces:**
- Produces: `resultadosService.guardarResultado(partidoId, grupoId, payload)`, `resultadosService.obtenerResultado(partidoId, grupoId)`; `votosService.guardarVotos(partidoId, grupoId, votanteId, payload)`, `votosService.obtenerVotosDeVotante(partidoId, grupoId, votanteId)`. `obtenerElegibles(partidoId)` y `eliminarPorPartido(partidoId)` sin cambios.

- [ ] **Step 1: Editar `resultadosService.js`**

En `guardarResultado`, agregar el parámetro y pasarlo a `obtenerPartido`:

```javascript
async function guardarResultado(partidoId, grupoId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado === 'abierto') throw crearError('El partido todavía no cerró', 400);
  // ... resto sin cambios
}
```

En `obtenerResultado`, agregar el parámetro y el guard de scoping que hoy no existe:

```javascript
async function obtenerResultado(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const resultado = db.prepare('SELECT * FROM Resultados WHERE partidoId = ?').get(partidoId);
  if (!resultado) return null;
  // ... resto sin cambios
}
```

- [ ] **Step 2: Editar `votosService.js`**

```javascript
async function guardarVotos(partidoId, grupoId, votanteId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') {
    throw crearError('El partido todavía no tiene resultado cargado', 400);
  }
  // ... resto sin cambios
}

async function obtenerVotosDeVotante(partidoId, grupoId, votanteId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const valoraciones = db
    .prepare('SELECT jugadorId, puntaje FROM RendimientosJugador WHERE partidoId = ? AND votanteId = ?')
    .all(partidoId, votanteId);
  const mvp = db
    .prepare('SELECT jugadorId FROM VotosMvp WHERE partidoId = ? AND votanteId = ?')
    .get(partidoId, votanteId);
  return { valoraciones, mvpId: mvp ? mvp.jugadorId : null };
}
```

- [ ] **Step 3: Actualizar `resultadosService.test.js` y `votosService.test.js`**

En ambos archivos: agregar `const GRUPO_ID = 'grupo-1';`, insertar un `Grupo` en `beforeEach` (mismo patrón del Task 6/8), agregar `grupoId: GRUPO_ID` a todas las llamadas `crearPartido({...})`, y agregar `GRUPO_ID` como segundo argumento en toda llamada a `resultadosService.guardarResultado(partido.id, ...)` → `resultadosService.guardarResultado(partido.id, GRUPO_ID, ...)`, `resultadosService.obtenerResultado(partido.id)` → `resultadosService.obtenerResultado(partido.id, GRUPO_ID)`, `votosService.guardarVotos(partido.id, 'u1', ...)` → `votosService.guardarVotos(partido.id, GRUPO_ID, 'u1', ...)`, `votosService.obtenerVotosDeVotante(partido.id, 'u1')` → `votosService.obtenerVotosDeVotante(partido.id, GRUPO_ID, 'u1')`.

En `resultadosService.test.js`, agregar un test de aislamiento:

```javascript
describe('resultadosService.obtenerResultado — aislamiento por grupo', () => {
  it('rechaza con 404 si el partido pertenece a otro grupo', async () => {
    mockDb
      .prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES ('grupo-2', 'Otro grupo', 'TEST-0002', 'admin-1', '2026-01-01T00:00:00.000Z')`
      )
      .run();
    const partido = await crearPartidoConElegibles();

    await expect(resultadosService.obtenerResultado(partido.id, 'grupo-2')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/services/resultadosService.test.js tests/services/votosService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/resultadosService.js backend/src/services/votosService.js backend/tests/services/resultadosService.test.js backend/tests/services/votosService.test.js
git commit -m "feat(backend): scope resultadosService/votosService by grupo"
```

---

### Task 11: Controllers de resultados/votos + rutas anidadas de usuarios-sancionados

**Files:**
- Modify: `backend/src/controllers/resultadosController.js`
- Modify: `backend/src/controllers/votosController.js`
- Modify: `backend/src/controllers/usuariosController.js`
- Modify: `backend/src/routes/usuariosRoutes.js`
- Create: `backend/src/routes/usuariosGrupoRoutes.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `resultadosService`/`votosService` (Task 10), `gruposService.listarSancionados`/`perdonarSancion` (Task 3), `verificarMiembroGrupo` (Task 5).

- [ ] **Step 1: Editar `resultadosController.js`**

```javascript
const resultadosService = require('../services/resultadosService');

async function obtener(req, res) {
  const resultado = await resultadosService.obtenerResultado(req.params.partidoId, req.params.grupoId);
  res.json(resultado);
}

async function guardar(req, res) {
  const resultado = await resultadosService.guardarResultado(req.params.partidoId, req.params.grupoId, req.body);
  res.json(resultado);
}

module.exports = { obtener, guardar };
```

- [ ] **Step 2: Editar `votosController.js`**

```javascript
const votosService = require('../services/votosService');

async function guardar(req, res) {
  const votos = await votosService.guardarVotos(req.params.partidoId, req.params.grupoId, req.usuario.uid, req.body);
  res.json(votos);
}

async function obtenerMios(req, res) {
  const votos = await votosService.obtenerVotosDeVotante(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(votos);
}

module.exports = { guardar, obtenerMios };
```

- [ ] **Step 3: Editar `usuariosController.js`**

Reemplazar `listarSancionados`/`perdonar` para usar `gruposService`, y agregar el `require`:

```javascript
const usuariosService = require('../services/usuariosService');
const gruposService = require('../services/gruposService');

async function listarSancionados(req, res) {
  const sancionados = await gruposService.listarSancionados(req.params.grupoId);
  res.json(sancionados);
}

async function perdonar(req, res) {
  await gruposService.perdonarSancion(req.params.grupoId, req.params.uid);
  res.json({ mensaje: 'Sanción revocada' });
}
```

(Dejar el resto de las funciones del archivo — `actualizarMisPosiciones`, `actualizarMiPerfil`, `subirMiFoto`, `obtenerPerfilDeJugador`, `listarUsuarios` — sin cambios.)

- [ ] **Step 4: Nueva ruta anidada `usuariosGrupoRoutes.js`**

```javascript
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');

const router = express.Router({ mergeParams: true });

router.get('/sancionados', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(usuariosController.listarSancionados));
router.post('/:uid/perdonar', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(usuariosController.perdonar));

module.exports = router;
```

- [ ] **Step 5: Quitar esas dos rutas de `usuariosRoutes.js`**

```javascript
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const { subirFoto } = require('../middlewares/subirFoto');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');

const router = express.Router();

router.get('/', verificarToken, envolverAsync(usuariosController.listarUsuarios));
router.patch('/me/posiciones', verificarToken, envolverAsync(usuariosController.actualizarMisPosiciones));
router.patch('/me/perfil', verificarToken, envolverAsync(usuariosController.actualizarMiPerfil));
router.post('/me/foto', verificarToken, subirFoto, envolverAsync(usuariosController.subirMiFoto));
router.get('/:uid/perfil', verificarToken, envolverAsync(usuariosController.obtenerPerfilDeJugador));

module.exports = router;
```

(`verificarAdmin` ya no se importa acá — era el único otro lugar que lo usaba junto con `partidosRoutes.js`, ya migrado en el Task 7.)

- [ ] **Step 6: Montar la nueva ruta en `app.js`**

```javascript
const usuariosGrupoRoutes = require('./routes/usuariosGrupoRoutes');
...
app.use('/api/grupos/:grupoId/usuarios', usuariosGrupoRoutes);
```

- [ ] **Step 7: Smoke test de arranque completo**

Run: `cd backend && SQLITE_DB_PATH=:memory: JWT_SECRET=test-secret node -e "require('./src/app')" && echo OK`
Expected: `OK` sin excepciones — a esta altura ya no debería quedar ningún `require` roto de `verificarAdmin`.

Run: `cd backend && grep -rn "verificarAdmin" src/`
Expected: sin resultados (ninguna referencia sobreviviente).

- [ ] **Step 8: Correr toda la suite de backend**

Run: `cd backend && npx jest`
Expected: PASS en todos los archivos (incluye `usuariosService.test.js`, `partidosService.test.js`, `inscripcionesService.test.js`, `resultadosService.test.js`, `votosService.test.js`, `gruposService.test.js`, `codigoInvitacion.test.js`, `db.test.js`, más `mailer.test.js` y `recordatoriosService.test.js` que no fueron tocados y no deberían haberse roto).

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/resultadosController.js backend/src/controllers/votosController.js backend/src/controllers/usuariosController.js backend/src/routes/usuariosRoutes.js backend/src/routes/usuariosGrupoRoutes.js backend/src/app.js
git commit -m "feat(backend): nest resultados/votos/sancionados routes under grupo, remove verificarAdmin"
```

---

### Task 12: Actualizar `CLAUDE.md` con el modelo de Grupos

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** ninguna — solo documentación.

- [ ] **Step 1: Actualizar la sección 4 (Actores y Permisos)**

Agregar antes de "1. Administrador": una nota explicando que Admin/Jugador son roles **por Grupo**, no globales, y agregar un rol adicional:

```markdown
Los roles son **por Grupo**: un usuario puede ser admin de un Grupo y jugador de otro. Además existe un **Super Admin** (vía `ADMIN_EMAILS`, sin cambios respecto al mecanismo actual) que puede administrar cualquier Grupo sin ser miembro — pensado para soporte/mantenimiento, no para jugar.
```

- [ ] **Step 2: Actualizar la sección 5 (Modelo de Datos)**

Reemplazar la definición de `Usuarios` (quitar `rol`/`estaSancionado`, agregar `esSuperAdmin`) y agregar `Grupos`/`UsuariosGrupos`, y agregar `grupoId` a `Partidos`:

```markdown
### Tabla: `Usuarios`
*   `uid` (TEXT, PK, ID de Google)
*   `nombre` (TEXT)
*   `email` (TEXT, UNIQUE)
*   `esSuperAdmin` (INTEGER, 0/1 — vía `ADMIN_EMAILS`, independiente de los Grupos)
*   `fechaCreacion` (TEXT, ISO 8601)
*   `passwordHash` (TEXT, nullable — solo presente si el usuario se registró con email/password)

### Tabla: `Grupos`
*   `id` (TEXT, PK)
*   `nombre` (TEXT)
*   `codigoInvitacion` (TEXT, UNIQUE)
*   `creadoPor` (TEXT, uid del usuario que lo creó)
*   `fechaCreacion` (TEXT, ISO 8601)

### Tabla: `UsuariosGrupos`
*   `id` (TEXT, PK)
*   `grupoId` (TEXT, FK -> Grupos)
*   `usuarioId` (TEXT, FK -> Usuarios)
*   `rol` (TEXT: "admin" | "jugador" — por grupo)
*   `estaSancionado` (INTEGER, 0/1 — por grupo)
*   `fechaIngreso` (TEXT, ISO 8601)

### Tabla: `Partidos`
*   `id` (TEXT, PK, generado con `crypto.randomUUID()`)
*   `fecha` (TEXT, ISO 8601)
*   `estado` (TEXT: "abierto" | "cerrado" | "jugado")
*   `creadoPor` (TEXT, uid del Admin)
*   `grupoId` (TEXT, FK -> Grupos)
*   `cupoTitulares` (INTEGER)
*   `cupoSuplentes` (INTEGER)
```

- [ ] **Step 3: Actualizar la sección 6 (Diseño de la API)**

Agregar un bloque nuevo antes de "### Partidos":

```markdown
### Grupos
*   `POST /api/grupos`: Crea un Grupo nuevo. Body: `{ nombre }`. El usuario autenticado queda como admin de ese Grupo.
*   `POST /api/grupos/unirse`: Body: `{ codigoInvitacion }`. Une al usuario autenticado como jugador (directo, sin aprobación).
*   `GET /api/grupos/mios`: Lista los Grupos donde el usuario autenticado tiene membresía.

Las rutas de Partidos, sancionados y perdón de sanción quedan anidadas bajo `/api/grupos/:grupoId/...` y requieren membresía en ese Grupo (o Super Admin).
```

Actualizar los paths de "### Partidos" e "### Inscripciones" agregando el prefijo `/api/grupos/:grupoId` a cada uno, y mover `GET /api/usuarios/sancionados` / `POST /api/usuarios/:uid/perdonar` de la sección de Auth & Usuarios a quedar como `GET /api/grupos/:grupoId/usuarios/sancionados` / `POST /api/grupos/:grupoId/usuarios/:uid/perdonar`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for multi-tenant Grupos model"
```

---

### Task 13: Frontend — `GrupoContext`

**Files:**
- Create: `frontend/src/context/GrupoContext.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Produces: `useGrupo()` hook exponiendo `{misGrupos, grupoActivo, cargandoGrupos, errorGrupos, seleccionarGrupo(grupoId), crearGrupo(nombre), unirseAGrupo(codigo), refrescarGrupos()}`. `grupoActivo` es `{id, nombre, rol, estaSancionado, codigoInvitacion?}` o `null`. Usado por Tasks 14, 15 y 16.
- Consumes: `useAuth()` de `AuthContext` (para saber cuándo hay `perfil` y disparar la carga), `api` de `services/api.js`.

- [ ] **Step 1: Crear `GrupoContext.jsx`**

```jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const GrupoContext = createContext(null);
export const GRUPO_ACTIVO_KEY = 'furboapp_grupo_activo_id';

export function GrupoProvider({ children }) {
  const { perfil } = useAuth();
  const [misGrupos, setMisGrupos] = useState([]);
  const [grupoActivoId, setGrupoActivoId] = useState(() => localStorage.getItem(GRUPO_ACTIVO_KEY));
  const [cargandoGrupos, setCargandoGrupos] = useState(true);
  const [errorGrupos, setErrorGrupos] = useState('');

  const refrescarGrupos = useCallback(async () => {
    if (!perfil) {
      setMisGrupos([]);
      setCargandoGrupos(false);
      return;
    }
    setCargandoGrupos(true);
    try {
      const { data } = await api.get('/grupos/mios');
      setMisGrupos(data);
      setErrorGrupos('');
    } catch (error) {
      setErrorGrupos(error.message);
    } finally {
      setCargandoGrupos(false);
    }
  }, [perfil]);

  useEffect(() => {
    refrescarGrupos();
  }, [refrescarGrupos]);

  useEffect(() => {
    if (cargandoGrupos) return;
    if (grupoActivoId && !misGrupos.some((grupo) => grupo.id === grupoActivoId)) {
      const primero = misGrupos[0]?.id || null;
      if (primero) localStorage.setItem(GRUPO_ACTIVO_KEY, primero);
      else localStorage.removeItem(GRUPO_ACTIVO_KEY);
      setGrupoActivoId(primero);
    }
  }, [misGrupos, grupoActivoId, cargandoGrupos]);

  function seleccionarGrupo(grupoId) {
    setGrupoActivoId(grupoId);
    localStorage.setItem(GRUPO_ACTIVO_KEY, grupoId);
  }

  async function crearGrupo(nombre) {
    const { data } = await api.post('/grupos', { nombre });
    await refrescarGrupos();
    seleccionarGrupo(data.id);
    return data;
  }

  async function unirseAGrupo(codigoInvitacion) {
    const { data } = await api.post('/grupos/unirse', { codigoInvitacion });
    await refrescarGrupos();
    seleccionarGrupo(data.id);
    return data;
  }

  const grupoActivo = misGrupos.find((grupo) => grupo.id === grupoActivoId) || null;

  const valor = {
    misGrupos,
    grupoActivo,
    cargandoGrupos,
    errorGrupos,
    seleccionarGrupo,
    crearGrupo,
    unirseAGrupo,
    refrescarGrupos,
  };

  return <GrupoContext.Provider value={valor}>{children}</GrupoContext.Provider>;
}

export function useGrupo() {
  const contexto = useContext(GrupoContext);
  if (!contexto) {
    throw new Error('useGrupo debe usarse dentro de GrupoProvider');
  }
  return contexto;
}
```

- [ ] **Step 2: Envolver la app en `main.jsx`**

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { GrupoProvider } from './context/GrupoContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GrupoProvider>
          <App />
        </GrupoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 3: Chequeo de sintaxis**

Run: `cd frontend && npx oxlint src/context/GrupoContext.jsx src/main.jsx`
Expected: sin errores (warnings preexistentes del proyecto, si los hubiera, son aceptables).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/GrupoContext.jsx frontend/src/main.jsx
git commit -m "feat(frontend): add GrupoContext for active-group selection"
```

---

### Task 14: Frontend — pantalla de Crear/Unirse a Grupo + selector

**Files:**
- Create: `frontend/src/pages/SeleccionarGrupo.jsx`
- Create: `frontend/src/components/CrearGrupoForm.jsx`
- Create: `frontend/src/components/UnirseGrupoForm.jsx`
- Create: `frontend/src/components/SelectorGrupoActivo.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `useGrupo()` (Task 13).
- Produces: ruta `/grupos` (pantalla de selección/creación/unión), montada antes de las rutas privadas existentes cuando no hay `grupoActivo`.

- [ ] **Step 1: `CrearGrupoForm.jsx`**

```jsx
import { useState } from 'react';
import Boton from './Boton';
import { useGrupo } from '../context/GrupoContext';

export default function CrearGrupoForm() {
  const { crearGrupo } = useGrupo();
  const [nombre, setNombre] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setProcesando(true);
    try {
      await crearGrupo(nombre);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-cancha-800 p-5">
      <h2 className="text-lg font-bold text-white">Crear un grupo nuevo</h2>
      <label className="flex flex-col gap-1 text-sm text-white/70">
        Nombre del grupo
        <input
          type="text"
          required
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          placeholder="Fútbol de los Jueves"
          className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
        />
      </label>
      {error && <p className="text-sm text-sancion">{error}</p>}
      <Boton type="submit" disabled={procesando}>
        {procesando ? 'Creando…' : 'Crear grupo'}
      </Boton>
    </form>
  );
}
```

- [ ] **Step 2: `UnirseGrupoForm.jsx`**

```jsx
import { useState } from 'react';
import Boton from './Boton';
import { useGrupo } from '../context/GrupoContext';

export default function UnirseGrupoForm() {
  const { unirseAGrupo } = useGrupo();
  const [codigo, setCodigo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setProcesando(true);
    try {
      await unirseAGrupo(codigo);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-cancha-800 p-5">
      <h2 className="text-lg font-bold text-white">Unirme a un grupo</h2>
      <label className="flex flex-col gap-1 text-sm text-white/70">
        Código de invitación
        <input
          type="text"
          required
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          placeholder="JUEVES-A1B2"
          className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 uppercase text-white"
        />
      </label>
      {error && <p className="text-sm text-sancion">{error}</p>}
      <Boton type="submit" disabled={procesando}>
        {procesando ? 'Uniéndome…' : 'Unirme'}
      </Boton>
    </form>
  );
}
```

- [ ] **Step 3: `SeleccionarGrupo.jsx`**

```jsx
import CrearGrupoForm from '../components/CrearGrupoForm';
import UnirseGrupoForm from '../components/UnirseGrupoForm';
import { useGrupo } from '../context/GrupoContext';

export default function SeleccionarGrupo() {
  const { errorGrupos } = useGrupo();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="font-display text-3xl leading-none text-white">Elegí tu grupo</h1>
        <p className="mt-2 text-sm text-white/60">Creá un grupo nuevo o unite a uno con un código de invitación.</p>
      </header>
      {errorGrupos && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{errorGrupos}</p>}
      <CrearGrupoForm />
      <UnirseGrupoForm />
    </div>
  );
}
```

- [ ] **Step 4: `SelectorGrupoActivo.jsx`**

```jsx
import { useState } from 'react';
import { useGrupo } from '../context/GrupoContext';

export default function SelectorGrupoActivo() {
  const { misGrupos, grupoActivo, seleccionarGrupo } = useGrupo();
  const [abierto, setAbierto] = useState(false);

  if (!grupoActivo) return null;

  return (
    <div className="relative px-2">
      <button
        onClick={() => setAbierto((valor) => !valor)}
        className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-left text-sm font-semibold text-white"
      >
        <span className="truncate">{grupoActivo.nombre}</span>
        <span className="text-white/50">▾</span>
      </button>
      {abierto && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-cancha-900 py-1 shadow-lg">
          {misGrupos.map((grupo) => (
            <li key={grupo.id}>
              <button
                onClick={() => {
                  seleccionarGrupo(grupo.id);
                  setAbierto(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  grupo.id === grupoActivo.id ? 'text-pasto-500' : 'text-white/80 hover:bg-white/5'
                }`}
              >
                {grupo.nombre}
              </button>
            </li>
          ))}
          <li>
            <a
              href="/grupos"
              className="block w-full px-3 py-2 text-left text-sm text-white/60 hover:bg-white/5"
            >
              Crear o unirme a otro grupo
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wiring en `App.jsx`**

Agregar el import y la ruta `/grupos`, y redirigir a `/grupos` cuando no hay `grupoActivo`:

```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useGrupo } from './context/GrupoContext';
import Login from './pages/Login';
import SeleccionarGrupo from './pages/SeleccionarGrupo';
import Home from './pages/Home';
import Perfil from './pages/Perfil';
import PerfilJugador from './pages/PerfilJugador';
import Jugadores from './pages/Jugadores';
import UltimosPartidos from './pages/UltimosPartidos';
import AdminPanel from './pages/AdminPanel';
import RutaPrivada from './components/RutaPrivada';
import RutaAdmin from './components/RutaAdmin';
import Layout from './components/Layout';
import Boton from './components/Boton';

export default function App() {
  const { perfil, cargando, errorAuth, cerrarSesion } = useAuth();
  const { grupoActivo, cargandoGrupos } = useGrupo();

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (errorAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{errorAuth}</p>
        <Boton onClick={cerrarSesion}>Reintentar (salir e ingresar de nuevo)</Boton>
      </div>
    );
  }

  if (perfil && !cargandoGrupos && !grupoActivo) {
    return (
      <Routes>
        <Route path="*" element={<SeleccionarGrupo />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={perfil ? <Navigate to="/inicio" replace /> : <Login />} />
      <Route path="/grupos" element={<RutaPrivada><SeleccionarGrupo /></RutaPrivada>} />
      <Route
        path="/inicio"
        element={
          <RutaPrivada>
            <Layout>
              <Home />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/perfil"
        element={
          <RutaPrivada>
            <Layout>
              <Perfil />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/jugadores"
        element={
          <RutaPrivada>
            <Layout>
              <Jugadores />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/jugadores/:uid"
        element={
          <RutaPrivada>
            <Layout>
              <PerfilJugador />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/historial"
        element={
          <RutaPrivada>
            <Layout>
              <UltimosPartidos />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/admin"
        element={
          <RutaAdmin>
            <Layout>
              <AdminPanel />
            </Layout>
          </RutaAdmin>
        }
      />
    </Routes>
  );
}
```

- [ ] **Step 6: Chequeo de sintaxis**

Run: `cd frontend && npx oxlint src/pages/SeleccionarGrupo.jsx src/components/CrearGrupoForm.jsx src/components/UnirseGrupoForm.jsx src/components/SelectorGrupoActivo.jsx src/App.jsx`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/SeleccionarGrupo.jsx frontend/src/components/CrearGrupoForm.jsx frontend/src/components/UnirseGrupoForm.jsx frontend/src/components/SelectorGrupoActivo.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add group selection/creation/join screen"
```

---

### Task 15: Frontend — `RutaAdmin`/`Layout` pasan a usar el grupo activo

**Files:**
- Modify: `frontend/src/components/RutaAdmin.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/context/AuthContext.jsx`

**Interfaces:**
- Consumes: `useGrupo()` (Task 13) para `rol`/`estaSancionado` en vez de `useAuth().esAdmin`/`estaSancionado`.

- [ ] **Step 1: Editar `RutaAdmin.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';

export default function RutaAdmin({ children }) {
  const { cargando } = useAuth();
  const { grupoActivo, cargandoGrupos } = useGrupo();

  if (cargando || cargandoGrupos) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (grupoActivo?.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}
```

- [ ] **Step 2: Editar `Layout.jsx`**

Reemplazar el uso de `estaSancionado, esAdmin` de `useAuth()` por `useGrupo()`, y agregar el selector de grupo en el nav:

```jsx
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import BadgeSancion from './BadgeSancion';
import SelectorGrupoActivo from './SelectorGrupoActivo';

// ... (ICONOS e Icono sin cambios)

export default function Layout({ children }) {
  const { perfil, cerrarSesion } = useAuth();
  const { grupoActivo } = useGrupo();
  const { pathname } = useLocation();

  const items = [
    { to: '/inicio', etiqueta: 'Inicio', icono: 'inicio' },
    { to: '/perfil', etiqueta: 'Mi Perfil', icono: 'perfil' },
    { to: '/jugadores', etiqueta: 'Jugadores', icono: 'jugadores' },
    { to: '/historial', etiqueta: 'Últimos partidos', icono: 'historial' },
  ];
  if (grupoActivo?.rol === 'admin') {
    items.push({ to: '/admin', etiqueta: 'Panel Admin', icono: 'admin' });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-white/10 bg-cancha-800 md:h-screen md:w-56 md:border-r md:sticky md:top-0">
        <div className="px-5 py-5">
          <p className="font-display text-3xl leading-none tracking-wide text-white">
            Furbo<span className="text-pasto-500">App</span>
          </p>
        </div>

        <div className="px-2 pb-2">
          <SelectorGrupoActivo />
        </div>

        <nav className="flex flex-1 gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
          {items.map((item) => {
            const activo = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  activo ? 'bg-pasto-600/20 text-pasto-500' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icono nombre={item.icono} className="h-5 w-5 shrink-0" />
                <span className="hidden sm:inline">{item.etiqueta}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 border-t border-white/10 px-3 py-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <p className="truncate text-sm font-semibold text-white/80">{perfil?.nombre}</p>
            <BadgeSancion sancionado={Boolean(grupoActivo?.estaSancionado)} />
          </div>
          <button
            onClick={cerrarSesion}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <Icono nombre="salir" className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Limpiar `AuthContext.jsx`**

Quitar `esAdmin: perfil?.rol === 'admin'` y `estaSancionado: Boolean(perfil?.estaSancionado)` del objeto `valor` (ya no existen esos campos en `perfil` — ahora viven en `grupoActivo`).

- [ ] **Step 4: Chequeo de sintaxis**

Run: `cd frontend && npx oxlint src/components/RutaAdmin.jsx src/components/Layout.jsx src/context/AuthContext.jsx`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RutaAdmin.jsx frontend/src/components/Layout.jsx frontend/src/context/AuthContext.jsx
git commit -m "feat(frontend): drive admin gate and sanction badge from active group"
```

---

### Task 16: Frontend — apuntar llamadas de partidos/sancionados al grupo activo

**Files:**
- Create: `frontend/src/utils/rutasGrupo.js`
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/AdminPanel.jsx`
- Modify: `frontend/src/pages/UltimosPartidos.jsx`

**Interfaces:**
- Produces: `rutaGrupo(grupoId, sufijo = ''): string` → `` `/grupos/${grupoId}${sufijo}` ``.
- Consumes: `useGrupo().grupoActivo.id` en cada página.

- [ ] **Step 1: Crear `rutasGrupo.js`**

```javascript
export function rutaGrupo(grupoId, sufijo = '') {
  return `/grupos/${grupoId}${sufijo}`;
}
```

- [ ] **Step 2: Editar `Home.jsx`**

Agregar el import de `useGrupo` y `rutaGrupo`, leer `grupoActivo`, y reemplazar cada path:

```jsx
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
// ...
export default function Home() {
  const { perfil, refrescarPerfil, actualizarPosicionesPerfil } = useAuth();
  const { grupoActivo, refrescarGrupos } = useGrupo();
  // ...
```

Reemplazar los llamados:
- `api.get('/partidos')` → `api.get(rutaGrupo(grupoActivo.id, '/partidos'))`
- `` api.get(`/partidos/${partido.id}/inscripciones`) `` → `` api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/inscripciones`)) ``
- `` api.get(`/partidos/${partido.id}/formacion`) `` → `` api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`)) `` (en ambos lugares donde aparece)
- `` api.post(`/partidos/${partidoId}/anotarse`, ...) `` → `` api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/anotarse`), ...) ``
- `` api.post(`/partidos/${partidoId}/bajarse`) `` → `` api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/bajarse`)) ``

En `confirmarBaja`, reemplazar `await refrescarPerfil();` por `await refrescarGrupos();` (la sanción ahora vive en el grupo, no en el perfil global) y agregar `estaSancionado={estaSancionado}` → usar `grupoActivo?.estaSancionado` en el JSX donde hoy se usa `estaSancionado` desnudo (variable que se quita de la desestructuración de `useAuth()`). También agregar la guarda de carga: si `!grupoActivo`, se puede devolver `null` (no debería ocurrir porque `App.jsx` ya redirige a `/grupos` sin uno activo, pero deja el componente seguro ante una carrera de renders).

- [ ] **Step 3: Editar `AdminPanel.jsx`**

Agregar `import { useGrupo } from '../context/GrupoContext';` y `import { rutaGrupo } from '../utils/rutasGrupo';`, y dentro del componente `const { grupoActivo } = useGrupo();`. Reemplazar:
- `api.get('/partidos')` → `api.get(rutaGrupo(grupoActivo.id, '/partidos'))`
- `api.get('/usuarios/sancionados')` → `api.get(rutaGrupo(grupoActivo.id, '/usuarios/sancionados'))`
- `` api.get(`/partidos/${partido.id}/inscripciones`) `` → `` api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/inscripciones`)) ``
- `` api.get(`/partidos/${partido.id}/formacion`) `` → `` api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`)) ``
- `` api.post('/partidos', {...}) `` → `` api.post(rutaGrupo(grupoActivo.id, '/partidos'), {...}) ``
- `` api.post(`/usuarios/${uid}/perdonar`) `` → `` api.post(rutaGrupo(grupoActivo.id, `/usuarios/${uid}/perdonar`)) ``
- `` api.post(`/partidos/${partidoId}/promover/${usuarioId}`) `` → `` api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/promover/${usuarioId}`)) ``
- `` api.delete(`/partidos/${partidoId}`) `` → `` api.delete(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}`)) ``
- `` api.post(`/partidos/${partidoId}/sancionar/${usuarioId}`) `` → `` api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/sancionar/${usuarioId}`)) ``
- `` api.put(`/partidos/${partidoParaResultado.id}/resultado`, payload) `` → `` api.put(rutaGrupo(grupoActivo.id, `/partidos/${partidoParaResultado.id}/resultado`), payload) ``

- [ ] **Step 4: Editar `UltimosPartidos.jsx`**

```jsx
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
// ...
export default function UltimosPartidos() {
  const { grupoActivo } = useGrupo();
  // ...
  useEffect(() => {
    if (!grupoActivo) return;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const { data } = await api.get(rutaGrupo(grupoActivo.id, '/partidos/historial'));
        setPartidos(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [grupoActivo]);
  // ...
}
```

- [ ] **Step 5: Chequeo de sintaxis**

Run: `cd frontend && npx oxlint src/utils/rutasGrupo.js src/pages/Home.jsx src/pages/AdminPanel.jsx src/pages/UltimosPartidos.jsx`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/rutasGrupo.js frontend/src/pages/Home.jsx frontend/src/pages/AdminPanel.jsx frontend/src/pages/UltimosPartidos.jsx
git commit -m "feat(frontend): scope partidos/sancionados requests to the active group"
```

---

### Task 17: Verificación manual end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Levantar backend y frontend**

Run: `cd backend && npm run dev` (en una terminal) y `cd frontend && npm run dev` (en otra).
Expected: ambos arrancan sin errores; el log del backend muestra `SQLite DB: ...` sin excepciones de migración.

- [ ] **Step 2: Probar migración de legado con una copia real de la DB**

Si existe una DB previa a este cambio (`backend/data/furboapp.db`), correr la migración sobre una **copia**:
Run: `cp backend/data/furboapp.db /tmp/furboapp-legacy-test.db && cd backend && SQLITE_DB_PATH=/tmp/furboapp-legacy-test.db node -e "require('./src/config/db'); const {db}=require('./src/config/db'); console.log(db.prepare('SELECT nombre FROM Grupos').all()); console.log(db.prepare('SELECT COUNT(*) n FROM UsuariosGrupos').get()); console.log(db.prepare('PRAGMA table_info(Usuarios)').all().map(c=>c.name));"`
Expected: imprime un Grupo `Legado`, una fila en `UsuariosGrupos` por cada usuario previo, y la lista de columnas de `Usuarios` ya sin `rol` ni `estaSancionado` (o, si el `DROP COLUMN` no fue soportado, con un warning en el log y esas columnas todavía presentes pero sin uso — ambos son resultados válidos).

Si no existe una DB previa (instalación nueva), este paso no aplica — anotar y seguir.

- [ ] **Step 3: Flujo de dos grupos en el navegador**

Usar el skill `browser-automation` (o navegación manual) para:
1. Loguearse con una cuenta, crear el Grupo "Grupo A", copiar el código de invitación.
2. Crear un partido en "Grupo A".
3. Loguearse con otra cuenta (o cerrar sesión y volver a entrar con otra), crear "Grupo B".
4. Confirmar que el partido de "Grupo A" NO aparece en "Grupo B".
5. Unirse a "Grupo A" con el código desde una tercera cuenta; confirmar que ve el partido de "Grupo A" y ningún partido de "Grupo B".
6. Anotarse y darse de baja (siendo titular) en "Grupo A"; confirmar que la sanción se refleja en el badge y en el panel admin de "Grupo A", y que esa misma cuenta puede anotarse sin problema en un partido de "Grupo B" si es miembro de ambos.
7. Confirmar que `RutaAdmin` (`/admin`) solo es accesible para el admin de cada grupo respectivo.

Expected: aislamiento total entre grupos, sanción por grupo, y acceso admin correcto en cada uno.

- [ ] **Step 4: Confirmar que la suite completa de backend sigue en verde**

Run: `cd backend && npx jest`
Expected: PASS.

(No hay Step de commit — este task es solo verificación.)
