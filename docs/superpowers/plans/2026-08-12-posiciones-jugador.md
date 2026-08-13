# Posición del jugador (principal y secundaria) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar la posición principal y secundaria de cada jugador: una vez como default de perfil (obligatorio post-login) y de nuevo, editable puntualmente, cada vez que se anota a un partido; mostrarla en el roster del partido.

**Architecture:** Doble almacenamiento — `Usuarios.posicionPrincipal/posicionSecundaria` como default de perfil, `Inscripciones.posicionPrincipal/posicionSecundaria` como valor real de cada inscripción (prellenado desde el perfil, no lo modifica). Un catálogo fijo de 4 posiciones compartido entre backend y frontend. Un único componente de modal reutilizable (`ModalPosicion`) cubre ambos triggers de UI.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React + Tailwind (frontend), Jest (tests de backend existentes).

## Global Constraints

- Catálogo de posiciones: exactamente `arquero`, `defensor`, `mediocampista`, `delantero` (minúsculas, sin tildes, sin agregar ni quitar valores).
- Ambas posiciones son obligatorias y deben ser distintas entre sí, siempre (perfil y anotarse).
- La posición es puramente informativa: no cambia la lógica de cupos/titular-suplente/sanciones.
- Seguir el patrón de nombres en español ya usado en el proyecto (funciones, componentes, mensajes de error) y el patrón de errores existente (`error.status` + `manejadorErrores.js` → `{ error: mensaje }`).
- **No agregar tests automatizados nuevos para esta feature** (preferencia explícita del usuario para este proyecto). La única excepción es actualizar los tests existentes que se rompen por el cambio de firma de `inscripcionesService.anotarse` — eso es mantenimiento obligatorio, no tests nuevos.
- Migraciones de esquema en `db.js` siguen el patrón ya usado para `passwordHash` (chequear con `PRAGMA table_info` y `ALTER TABLE ... ADD COLUMN` si falta), porque el archivo sqlite de desarrollo ya existe y `CREATE TABLE IF NOT EXISTS` no altera tablas existentes.

---

### Task 1: Catálogo de posiciones + esquema de base de datos

**Files:**
- Create: `backend/src/constants/posiciones.js`
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js:23-27`

**Interfaces:**
- Produces: `POSICIONES` (array de 4 strings), `sonPosicionesValidas(principal, secundaria)` (bool) — usado por `usuariosService` e `inscripcionesService` en tasks siguientes.

- [ ] **Step 1: Crear el catálogo compartido**

Crear `backend/src/constants/posiciones.js`:

```js
const POSICIONES = ['arquero', 'defensor', 'mediocampista', 'delantero'];

function sonPosicionesValidas(principal, secundaria) {
  return (
    POSICIONES.includes(principal) &&
    POSICIONES.includes(secundaria) &&
    principal !== secundaria
  );
}

module.exports = { POSICIONES, sonPosicionesValidas };
```

- [ ] **Step 2: Agregar las columnas al esquema (para DBs nuevas)**

En `backend/src/db/schema.sql`, el `CREATE TABLE IF NOT EXISTS Usuarios` queda:

```sql
CREATE TABLE IF NOT EXISTS Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jugador')),
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL,
  passwordHash TEXT,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT
);
```

Y el `CREATE TABLE IF NOT EXISTS Inscripciones` queda:

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
  posicionSecundaria TEXT
);
```

(El resto del archivo, incluyendo `Partidos` y el índice, no cambia.)

- [ ] **Step 3: Migrar la DB existente en `db.js`**

En `backend/src/config/db.js`, después del bloque existente de `passwordHash` (líneas 23-27):

```js
const columnasUsuarios = db.prepare('PRAGMA table_info(Usuarios)').all();
const tienePasswordHash = columnasUsuarios.some((columna) => columna.name === 'passwordHash');
if (!tienePasswordHash) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordHash TEXT');
}
```

agregar:

```js
const tienePosicionPrincipalUsuario = columnasUsuarios.some((columna) => columna.name === 'posicionPrincipal');
if (!tienePosicionPrincipalUsuario) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN posicionPrincipal TEXT');
}
const tienePosicionSecundariaUsuario = columnasUsuarios.some((columna) => columna.name === 'posicionSecundaria');
if (!tienePosicionSecundariaUsuario) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN posicionSecundaria TEXT');
}

const columnasInscripciones = db.prepare('PRAGMA table_info(Inscripciones)').all();
const tienePosicionPrincipalInscripcion = columnasInscripciones.some(
  (columna) => columna.name === 'posicionPrincipal'
);
if (!tienePosicionPrincipalInscripcion) {
  db.exec('ALTER TABLE Inscripciones ADD COLUMN posicionPrincipal TEXT');
}
const tienePosicionSecundariaInscripcion = columnasInscripciones.some(
  (columna) => columna.name === 'posicionSecundaria'
);
if (!tienePosicionSecundariaInscripcion) {
  db.exec('ALTER TABLE Inscripciones ADD COLUMN posicionSecundaria TEXT');
}
```

(Debe quedar antes de `module.exports = { db };`.)

- [ ] **Step 4: Verificar la migración contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
console.log('Usuarios:', db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name));
console.log('Inscripciones:', db.prepare('PRAGMA table_info(Inscripciones)').all().map((c) => c.name));
"
```
Expected: ambas listas incluyen `posicionPrincipal` y `posicionSecundaria`.

- [ ] **Step 5: Verificar que la migración no rompe una DB ya existente sin las columnas**

Run:
```bash
cd "backend" && rm -f /tmp/furboapp-migracion-test.db* && node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/furboapp-migracion-test.db');
db.exec(\"CREATE TABLE Usuarios (uid TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL, rol TEXT NOT NULL, estaSancionado INTEGER NOT NULL DEFAULT 0, fechaCreacion TEXT NOT NULL)\");
db.exec(\"CREATE TABLE Inscripciones (id TEXT PRIMARY KEY, partidoId TEXT NOT NULL, usuarioId TEXT NOT NULL, estado TEXT NOT NULL, tipo TEXT NOT NULL, orden INTEGER NOT NULL, fechaInscripcion TEXT NOT NULL)\");
db.close();
" && SQLITE_DB_PATH=/tmp/furboapp-migracion-test.db node -e "
const { db } = require('./src/config/db');
console.log('Usuarios:', db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name));
console.log('Inscripciones:', db.prepare('PRAGMA table_info(Inscripciones)').all().map((c) => c.name));
" && rm -f /tmp/furboapp-migracion-test.db*
```
Expected: ambas listas incluyen las columnas nuevas sin errores (simula el caso real: DB de desarrollo ya creada antes de este cambio).

- [ ] **Step 6: Commit**

```bash
git add backend/src/constants/posiciones.js backend/src/db/schema.sql backend/src/config/db.js
git commit -m "feat(backend): agregar catálogo de posiciones y columnas en Usuarios/Inscripciones"
```

---

### Task 2: Endpoint para fijar la posición default del perfil

**Files:**
- Modify: `backend/src/services/usuariosService.js`
- Modify: `backend/src/controllers/usuariosController.js`
- Modify: `backend/src/routes/usuariosRoutes.js`

**Interfaces:**
- Consumes: `sonPosicionesValidas` de `backend/src/constants/posiciones.js` (Task 1).
- Produces: `usuariosService.actualizarPosiciones(uid, { posicionPrincipal, posicionSecundaria })` → Promise<usuario>. Ruta `PATCH /api/usuarios/me/posiciones`.

- [ ] **Step 1: Agregar la función al servicio**

En `backend/src/services/usuariosService.js`, agregar el require al inicio del archivo (junto a los otros requires):

```js
const { sonPosicionesValidas } = require('../constants/posiciones');
```

Agregar la función nueva después de `sancionar` (después de la línea `async function sancionar(uid) { ... }`):

```js
async function actualizarPosiciones(uid, { posicionPrincipal, posicionSecundaria } = {}) {
  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    const error = new Error('Posiciones inválidas');
    error.status = 400;
    throw error;
  }
  db.prepare('UPDATE Usuarios SET posicionPrincipal = ?, posicionSecundaria = ? WHERE uid = ?').run(
    posicionPrincipal,
    posicionSecundaria,
    uid
  );
  return obtenerUsuario(uid);
}
```

Agregar `actualizarPosiciones` al `module.exports` al final del archivo.

- [ ] **Step 2: Agregar el controller**

En `backend/src/controllers/usuariosController.js`, agregar:

```js
async function actualizarMisPosiciones(req, res) {
  const usuario = await usuariosService.actualizarPosiciones(req.usuario.uid, req.body);
  res.json(usuario);
}
```

Actualizar el `module.exports` a `{ listarSancionados, perdonar, actualizarMisPosiciones }`.

- [ ] **Step 3: Agregar la ruta**

En `backend/src/routes/usuariosRoutes.js`, agregar después de las rutas existentes (antes de `module.exports`):

```js
router.patch('/me/posiciones', verificarToken, envolverAsync(usuariosController.actualizarMisPosiciones));
```

- [ ] **Step 4: Verificar manualmente contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const usuariosService = require('./src/services/usuariosService');
(async () => {
  await usuariosService.sincronizarUsuario({ uid: 'test1', email: 't1@gmail.com', nombre: 'Test Uno' });
  const actualizado = await usuariosService.actualizarPosiciones('test1', { posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
  console.log('OK:', actualizado.posicionPrincipal, actualizado.posicionSecundaria);
  try {
    await usuariosService.actualizarPosiciones('test1', { posicionPrincipal: 'arquero', posicionSecundaria: 'arquero' });
    console.log('ERROR: no debería haber aceptado posiciones iguales');
  } catch (e) {
    console.log('OK rechazo esperado:', e.status, e.message);
  }
})();
"
```
Expected:
```
OK: arquero defensor
OK rechazo esperado: 400 Posiciones inválidas
```

- [ ] **Step 5: Correr la suite de backend existente para confirmar que nada se rompió**

Run: `cd "backend" && npm test`
Expected: todos los tests existentes en verde (este task no toca `anotarse`, así que no debería haber impacto).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/usuariosService.js backend/src/controllers/usuariosController.js backend/src/routes/usuariosRoutes.js
git commit -m "feat(backend): agregar endpoint PATCH /usuarios/me/posiciones"
```

---

### Task 3: `anotarse` exige y persiste la posición de esa inscripción

**Files:**
- Modify: `backend/src/services/inscripcionesService.js`
- Modify: `backend/src/controllers/inscripcionesController.js:4-7`
- Modify: `backend/tests/services/inscripcionesService.test.js`

**Interfaces:**
- Consumes: `sonPosicionesValidas` de `backend/src/constants/posiciones.js` (Task 1).
- Produces: `inscripcionesService.anotarse(partidoId, usuarioId, { posicionPrincipal, posicionSecundaria })` → Promise<inscripcion> (la inscripción devuelta ahora incluye `posicionPrincipal`/`posicionSecundaria`). Consumido por el controller en este mismo task y por el frontend en Task 7.

- [ ] **Step 1: Agregar el require y cambiar la firma de `anotarse`**

En `backend/src/services/inscripcionesService.js`, agregar al inicio del archivo:

```js
const { sonPosicionesValidas } = require('../constants/posiciones');
```

Reemplazar la función `anotarse` completa (líneas 30-66) por:

```js
async function anotarse(partidoId, usuarioId, { posicionPrincipal, posicionSecundaria } = {}) {
  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    throw crearError('Posiciones inválidas', 400);
  }

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

- [ ] **Step 2: Pasar el body al service desde el controller**

En `backend/src/controllers/inscripcionesController.js`, reemplazar:

```js
async function anotarse(req, res) {
  const inscripcion = await inscripcionesService.anotarse(req.params.partidoId, req.usuario.uid);
  res.status(201).json(inscripcion);
}
```

por:

```js
async function anotarse(req, res) {
  const inscripcion = await inscripcionesService.anotarse(req.params.partidoId, req.usuario.uid, req.body);
  res.status(201).json(inscripcion);
}
```

- [ ] **Step 3: Actualizar los tests existentes que llaman a `anotarse`**

El cambio de firma rompe los 26 call-sites existentes en `backend/tests/services/inscripcionesService.test.js` (antes no pasaban posiciones). Reemplazar el archivo completo por:

```js
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

const POSICIONES_DEFAULT = { posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' };

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
  it('rechaza con 400 si las posiciones son inválidas', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, 'u1', { posicionPrincipal: 'arquero', posicionSecundaria: 'arquero' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 404 si el usuario no existe', async () => {
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, 'no-existe', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 403 si el usuario está sancionado', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await usuariosService.sancionar('u1');
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 400 si ya tiene una inscripción activa', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);

    await expect(
      inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('asigna tipo titular si hay lugar y persiste las posiciones', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();

    const inscripcion = await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);

    expect(inscripcion.tipo).toBe('titular');
    expect(inscripcion.posicionPrincipal).toBe('defensor');
    expect(inscripcion.posicionSecundaria).toBe('mediocampista');
  });

  it('asigna tipo suplente si los titulares están completos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);

    const inscripcion = await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);

    expect(inscripcion.tipo).toBe('suplente');
  });

  it('rechaza con 400 "Partido completo" si titulares y suplentes están llenos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await crearUsuario({ uid: 'u3', email: 'u3@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);

    await expect(
      inscripcionesService.anotarse(partido.id, 'u3', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si el partido no está abierto', async () => {
    const partido = await crearPartidoAbierto();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(
      inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 400 });
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
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);

    await inscripcionesService.bajarse(partido.id, 'u1');

    const usuario = await usuariosService.obtenerUsuario('u1');
    expect(usuario.estaSancionado).toBe(true);
  });

  it('NO sanciona al usuario si era suplente', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);

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
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);

    await expect(inscripcionesService.promover(partido.id, 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si no hay cupo de titular libre', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);

    await expect(inscripcionesService.promover(partido.id, 'u2')).rejects.toMatchObject({ status: 400 });
  });

  it('promueve a titular si hay cupo libre', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);
    await inscripcionesService.bajarse(partido.id, 'u1');

    const inscripcion = await inscripcionesService.promover(partido.id, 'u2');

    expect(inscripcion.tipo).toBe('titular');
  });

  it('rechaza con 404 si el partido no existe', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);
    mockDb.prepare('DELETE FROM Partidos WHERE id = ?').run(partido.id);

    await expect(inscripcionesService.promover(partido.id, 'u2')).rejects.toMatchObject({ status: 404 });
  });
});

describe('inscripcionesService.sancionarManualmente', () => {
  it('rechaza con 404 si no hay inscripción activa', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.sancionarManualmente(partido.id, 'u1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rechaza con 400 si el jugador es suplente', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);

    await expect(inscripcionesService.sancionarManualmente(partido.id, 'u2')).rejects.toMatchObject({
      status: 400,
    });

    const usuario = await usuariosService.obtenerUsuario('u2');
    expect(usuario.estaSancionado).toBe(false);
  });

  it('da de baja y sanciona al usuario si es titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);

    const inscripcion = await inscripcionesService.sancionarManualmente(partido.id, 'u1');

    expect(inscripcion.estado).toBe('dado_de_baja');
    const usuario = await usuariosService.obtenerUsuario('u1');
    expect(usuario.estaSancionado).toBe(true);
  });
});

describe('inscripcionesService.listarActivas', () => {
  it('devuelve solo inscripciones con estado anotado', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, 'u2', POSICIONES_DEFAULT);
    await inscripcionesService.bajarse(partido.id, 'u2');

    const activas = await inscripcionesService.listarActivas(partido.id);

    expect(activas.map((i) => i.usuarioId)).toEqual(['u1']);
  });
});
```

(Se agregó un solo caso nuevo — "rechaza con 400 si las posiciones son inválidas" — porque sin él el cambio de comportamiento más importante del task quedaría sin cubrir por ningún test existente. El resto de los cambios son solo el agregado de `POSICIONES_DEFAULT` a las llamadas ya existentes.)

- [ ] **Step 4: Correr la suite de backend**

Run: `cd "backend" && npm test`
Expected: todos los tests en verde, incluyendo el nuevo caso de posiciones inválidas.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/inscripcionesService.js backend/src/controllers/inscripcionesController.js backend/tests/services/inscripcionesService.test.js
git commit -m "feat(backend): anotarse exige y persiste posicion principal/secundaria"
```

---

### Task 4: Exponer las posiciones en el listado de inscripciones

**Files:**
- Modify: `backend/src/controllers/inscripcionesController.js:24-37`

**Interfaces:**
- Consumes: filas de `Inscripciones` ya devueltas por `inscripcionesService.listarActivas` (Task 3 ya persiste `posicionPrincipal`/`posicionSecundaria` en esas filas).
- Produces: cada objeto de la respuesta de `GET /partidos/:partidoId/inscripciones` ahora incluye `posicionPrincipal`, `posicionSecundaria`. Consumido por `ListaJugadores.jsx` en Task 8.

- [ ] **Step 1: Agregar los campos a la respuesta**

En `backend/src/controllers/inscripcionesController.js`, reemplazar `listarPorPartido`:

```js
async function listarPorPartido(req, res) {
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
```

- [ ] **Step 2: Verificar manualmente contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const usuariosService = require('./src/services/usuariosService');
const partidosService = require('./src/services/partidosService');
const inscripcionesService = require('./src/services/inscripcionesService');
(async () => {
  const admin = await usuariosService.sincronizarUsuario({ uid: 'admin1', email: 'a@gmail.com', nombre: 'Admin' });
  const partido = await partidosService.crearPartido({ fecha: '2099-01-01T20:00:00.000Z', cupoTitulares: 2, cupoSuplentes: 1, creadoPor: admin.uid });
  await usuariosService.sincronizarUsuario({ uid: 'u1', email: 'u1@gmail.com', nombre: 'Jugador Uno' });
  await inscripcionesService.anotarse(partido.id, 'u1', { posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
  const activas = await inscripcionesService.listarActivas(partido.id);
  console.log(activas);
})();
"
```
Expected: la fila de `u1` incluye `posicionPrincipal: 'arquero'` y `posicionSecundaria: 'defensor'`.

- [ ] **Step 3: Correr la suite de backend**

Run: `cd "backend" && npm test`
Expected: todo en verde (no hay tests directos sobre `listarPorPartido`, es un controller; este step confirma que no rompimos nada).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/inscripcionesController.js
git commit -m "feat(backend): exponer posicion principal/secundaria en listado de inscripciones"
```

---

### Task 5: Catálogo de posiciones + componente `ModalPosicion` (frontend)

**Files:**
- Create: `frontend/src/constants/posiciones.js`
- Create: `frontend/src/components/ModalPosicion.jsx`

**Interfaces:**
- Produces: `POSICIONES` (array de `{ valor, etiqueta }`), `etiquetaPosicion(valor)` — usado por `ModalPosicion` y por `ListaJugadores` (Task 8). Componente `ModalPosicion` con props `abierto`, `procesando`, `permitirCancelar`, `posicionPrincipalInicial`, `posicionSecundariaInicial`, `onConfirmar(posicionPrincipal, posicionSecundaria)`, `onCancelar` — usado por `Home.jsx` (Tasks 6 y 7).

- [ ] **Step 1: Crear el catálogo compartido**

Crear `frontend/src/constants/posiciones.js`:

```js
export const POSICIONES = [
  { valor: 'arquero', etiqueta: 'Arquero' },
  { valor: 'defensor', etiqueta: 'Defensor' },
  { valor: 'mediocampista', etiqueta: 'Mediocampista' },
  { valor: 'delantero', etiqueta: 'Delantero' },
];

export function etiquetaPosicion(valor) {
  return POSICIONES.find((posicion) => posicion.valor === valor)?.etiqueta || 'Sin posición';
}
```

- [ ] **Step 2: Crear el componente `ModalPosicion`**

Crear `frontend/src/components/ModalPosicion.jsx`:

```jsx
import { useEffect, useState } from 'react';
import Boton from './Boton';
import { POSICIONES } from '../constants/posiciones';

export default function ModalPosicion({
  abierto,
  procesando,
  permitirCancelar,
  posicionPrincipalInicial,
  posicionSecundariaInicial,
  onConfirmar,
  onCancelar,
}) {
  const [posicionPrincipal, setPosicionPrincipal] = useState(posicionPrincipalInicial || '');
  const [posicionSecundaria, setPosicionSecundaria] = useState(posicionSecundariaInicial || '');

  useEffect(() => {
    if (abierto) {
      setPosicionPrincipal(posicionPrincipalInicial || '');
      setPosicionSecundaria(posicionSecundariaInicial || '');
    }
  }, [abierto, posicionPrincipalInicial, posicionSecundariaInicial]);

  if (!abierto) return null;

  const posicionesIguales = posicionPrincipal && posicionSecundaria && posicionPrincipal === posicionSecundaria;
  const puedeConfirmar = posicionPrincipal && posicionSecundaria && !posicionesIguales && !procesando;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-cancha-800 p-6">
        <h2 className="mb-2 text-lg font-bold text-tarjeta">¿En qué posición jugás?</h2>
        <p className="mb-4 text-sm text-white/70">
          Elegí tu posición principal y una secundaria, por si en algún momento hace falta rotar.
        </p>

        <div className="mb-3 flex flex-col gap-1 text-left">
          <label className="text-xs uppercase text-white/50">Posición principal</label>
          <select
            value={posicionPrincipal}
            onChange={(evento) => setPosicionPrincipal(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" disabled>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-2 flex flex-col gap-1 text-left">
          <label className="text-xs uppercase text-white/50">Posición secundaria</label>
          <select
            value={posicionSecundaria}
            onChange={(evento) => setPosicionSecundaria(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" disabled>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {posicionesIguales && (
          <p className="mb-2 text-sm text-sancion">La secundaria tiene que ser distinta de la principal.</p>
        )}

        <div className="mt-4 flex justify-center gap-3">
          {permitirCancelar && (
            <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
              Cancelar
            </Boton>
          )}
          <Boton
            variante="primario"
            onClick={() => onConfirmar(posicionPrincipal, posicionSecundaria)}
            disabled={!puedeConfirmar}
          >
            {procesando ? 'Guardando…' : 'Confirmar'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que el build del frontend sigue funcionando**

Run: `cd "frontend" && npm run build`
Expected: build exitoso (el componente todavía no se usa en ninguna página, pero debe compilar sin errores de sintaxis/import).

- [ ] **Step 4: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos en los archivos creados.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/constants/posiciones.js frontend/src/components/ModalPosicion.jsx
git commit -m "feat(frontend): agregar catalogo de posiciones y componente ModalPosicion"
```

---

### Task 6: Setup obligatorio de posición post-login (`AuthContext` + `Home`, trigger 1)

**Files:**
- Modify: `frontend/src/context/AuthContext.jsx`
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `ModalPosicion` (Task 5).
- Produces: `useAuth().actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria)` → Promise<void>, actualiza `perfil` en el contexto. Consumido también en Task 7.

- [ ] **Step 1: Agregar el método al `AuthContext`**

En `frontend/src/context/AuthContext.jsx`, agregar la función después de `registrarse` (antes de `cerrarSesion`):

```js
async function actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria) {
  const { data } = await api.patch('/usuarios/me/posiciones', { posicionPrincipal, posicionSecundaria });
  setPerfil(data);
}
```

Agregar `actualizarPosicionesPerfil` al objeto `valor` que se expone en el provider (junto a `registrarse`, `cerrarSesion`, etc.).

- [ ] **Step 2: Renderizar el modal obligatorio en `Home.jsx`**

En `frontend/src/pages/Home.jsx`:

Agregar el import:
```js
import ModalPosicion from '../components/ModalPosicion';
```

En la desestructuración de `useAuth()`, agregar `actualizarPosicionesPerfil`:
```js
const { perfil, estaSancionado, esAdmin, cerrarSesion, refrescarPerfil, actualizarPosicionesPerfil } = useAuth();
```

Agregar el estado nuevo junto a los demás `useState`:
```js
const [guardandoPosicionPerfil, setGuardandoPosicionPerfil] = useState(false);
```

Agregar la función (junto a las demás funciones del componente, antes del `return`):
```js
async function confirmarPosicionPerfil(posicionPrincipal, posicionSecundaria) {
  setError('');
  setGuardandoPosicionPerfil(true);
  try {
    await actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria);
  } catch (err) {
    setError(err.message);
  } finally {
    setGuardandoPosicionPerfil(false);
  }
}
```

Agregar el modal al final del JSX, junto al `ModalConfirmacionSancion` ya existente:
```jsx
<ModalPosicion
  abierto={Boolean(perfil) && !perfil.posicionPrincipal}
  procesando={guardandoPosicionPerfil}
  permitirCancelar={false}
  posicionPrincipalInicial={null}
  posicionSecundariaInicial={null}
  onConfirmar={confirmarPosicionPerfil}
/>
```

- [ ] **Step 3: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AuthContext.jsx frontend/src/pages/Home.jsx
git commit -m "feat(frontend): modal obligatorio de posicion la primera vez que el perfil no la tiene"
```

---

### Task 7: Confirmación de posición al anotarse (`Home` + `TarjetaPartido`, trigger 2)

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `ModalPosicion` (Task 5), `inscripcionesService.anotarse` vía `POST /partidos/:id/anotarse` con body (Task 3).
- Produces: ninguna interfaz nueva para otros tasks; cierra el flujo de UI.

- [ ] **Step 1: Agregar el estado del modal de anotarse**

En `frontend/src/pages/Home.jsx`, agregar junto a los demás `useState`:
```js
const [partidoParaAnotarse, setPartidoParaAnotarse] = useState(null);
```

- [ ] **Step 2: Cambiar `anotarse` para que reciba las posiciones y lo dispare el modal, no el botón**

Reemplazar la función `anotarse` existente:
```js
async function anotarse(partidoId) {
  setError('');
  setPartidoEnProceso(partidoId);
  try {
    await api.post(`/partidos/${partidoId}/anotarse`);
    await cargarPartidos();
  } catch (err) {
    setError(err.message);
  } finally {
    setPartidoEnProceso(null);
  }
}
```

por:
```js
async function anotarse(partidoId, posicionPrincipal, posicionSecundaria) {
  setError('');
  setPartidoEnProceso(partidoId);
  try {
    await api.post(`/partidos/${partidoId}/anotarse`, { posicionPrincipal, posicionSecundaria });
    await cargarPartidos();
    setPartidoParaAnotarse(null);
  } catch (err) {
    setError(err.message);
  } finally {
    setPartidoEnProceso(null);
  }
}
```

- [ ] **Step 3: Hacer que el botón "Anotarme" abra el modal en vez de llamar a la API directo**

En el `map` de `partidos` donde se renderiza `TarjetaPartido`, cambiar:
```jsx
onAnotarse={() => anotarse(partido.id)}
```
por:
```jsx
onAnotarse={() => setPartidoParaAnotarse(partido.id)}
```

- [ ] **Step 4: Agregar el modal de confirmación al JSX**

Agregar, junto al `ModalConfirmacionSancion` y al `ModalPosicion` del Task 6:
```jsx
<ModalPosicion
  abierto={Boolean(partidoParaAnotarse)}
  procesando={partidoEnProceso === partidoParaAnotarse}
  permitirCancelar
  posicionPrincipalInicial={perfil?.posicionPrincipal}
  posicionSecundariaInicial={perfil?.posicionSecundaria}
  onConfirmar={(posicionPrincipal, posicionSecundaria) =>
    anotarse(partidoParaAnotarse, posicionPrincipal, posicionSecundaria)
  }
  onCancelar={() => setPartidoParaAnotarse(null)}
/>
```

- [ ] **Step 5: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 6: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat(frontend): confirmar posicion al anotarse a un partido"
```

---

### Task 8: Mostrar la posición en el roster (`ListaJugadores`)

**Files:**
- Modify: `frontend/src/components/ListaJugadores.jsx`

**Interfaces:**
- Consumes: `etiquetaPosicion` de `frontend/src/constants/posiciones.js` (Task 5), y los campos `posicionPrincipal`/`posicionSecundaria` que ya vienen en cada `jugador` (Task 4).

- [ ] **Step 1: Mostrar la posición junto al nombre**

En `frontend/src/components/ListaJugadores.jsx`, agregar el import:
```js
import { etiquetaPosicion } from '../constants/posiciones';
```

Reemplazar el `<li>` de titulares:
```jsx
<li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
  <span>{jugador.nombre}</span>
  {onSancionar && (
    <Boton
      variante="peligro"
      className="px-3 py-1 text-xs"
      onClick={() => onSancionar(jugador.usuarioId)}
      disabled={deshabilitado}
    >
      Sancionar
    </Boton>
  )}
</li>
```
por:
```jsx
<li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
  <span>
    {jugador.nombre}
    <span className="ml-2 text-xs text-white/50">
      {etiquetaPosicion(jugador.posicionPrincipal)}
      {jugador.posicionSecundaria && ` / ${etiquetaPosicion(jugador.posicionSecundaria)}`}
    </span>
  </span>
  {onSancionar && (
    <Boton
      variante="peligro"
      className="px-3 py-1 text-xs"
      onClick={() => onSancionar(jugador.usuarioId)}
      disabled={deshabilitado}
    >
      Sancionar
    </Boton>
  )}
</li>
```

Y el `<li>` de suplentes, de:
```jsx
<li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
  <span>{jugador.nombre}</span>
  {onPromover && (
    <Boton
      variante="ghost"
      className="px-3 py-1 text-xs"
      onClick={() => onPromover(jugador.usuarioId)}
      disabled={deshabilitado}
    >
      Promover
    </Boton>
  )}
</li>
```
a:
```jsx
<li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
  <span>
    {jugador.nombre}
    <span className="ml-2 text-xs text-white/50">
      {etiquetaPosicion(jugador.posicionPrincipal)}
      {jugador.posicionSecundaria && ` / ${etiquetaPosicion(jugador.posicionSecundaria)}`}
    </span>
  </span>
  {onPromover && (
    <Boton
      variante="ghost"
      className="px-3 py-1 text-xs"
      onClick={() => onPromover(jugador.usuarioId)}
      disabled={deshabilitado}
    >
      Promover
    </Boton>
  )}
</li>
```

- [ ] **Step 2: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 3: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ListaJugadores.jsx
git commit -m "feat(frontend): mostrar posicion principal/secundaria en el roster de jugadores"
```

---

## Verificación manual sugerida (fuera del alcance de los tests automatizados)

Después de completar los 8 tasks, levantar `backend` (`npm run dev`) y `frontend` (`npm run dev`) y probar en el navegador:
1. Un jugador sin posición seteada entra a Home → aparece el modal obligatorio sin botón de cancelar; no puede cerrarlo ni interactuar con el resto de la página hasta completar ambas posiciones (distintas) y confirmar.
2. Ese mismo jugador hace clic en "Anotarme" en un partido abierto → aparece el modal prellenado con su posición de perfil, puede cambiarla puntualmente o cancelar sin que se dispare el POST.
3. Al confirmar, el jugador aparece en el roster del partido (`ListaJugadores`) con la posición elegida para esa inscripción.
4. Un admin ve el mismo flujo al anotarse (no hay caso especial para admin).
