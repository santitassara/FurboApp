# Chat "Mi Equipo" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Mi equipo" button that appears once a match's team-formation voting has closed, taking each titular player to a per-match, per-team real-time chat with only their teammates.

**Architecture:** New `MensajesEquipo` SQLite table. Backend exposes a REST endpoint to bootstrap the chat (teammates + history) and a REST endpoint to send a message (persist + broadcast). A `socket.io` server attached to the existing HTTP server pushes new messages live to clients joined to a `equipo:{partidoId}:{equipo}` room. Frontend adds a button in `Home.jsx` and a new `MiEquipo.jsx` page that fetches history via REST and listens for live messages via `socket.io-client`.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React/react-router-dom/axios (frontend), `socket.io` + `socket.io-client` (new).

**Spec:** `docs/superpowers/specs/2026-08-25-chat-mi-equipo-design.md`

## Global Constraints

- No automated tests unless explicitly requested — every task ends in a manual/scripted verification, not a Jest test file.
- Only titulares participate — the existing formation system never assigns `equipo` to suplentes; do not extend that system as part of this work.
- Team membership is computed live from `Inscripciones` (`estado='anotado' AND tipo='titular' AND equipo=...`) — no snapshot table.
- Messages are sent via REST POST only. The socket connection is receive-only (`nuevoMensaje` events); there is no `enviarMensaje` socket event.
- New tables go in `backend/src/db/schema.sql` as `CREATE TABLE IF NOT EXISTS` (this project has no formal migrations system).
- Follow existing patterns: thin controllers, business logic in `/services`, routes wired as `verificarToken, verificarMiembroGrupo(), envolverAsync(controller.metodo)`.

---

### Task 1: `MensajesEquipo` table

**Files:**
- Modify: `backend/src/db/schema.sql`

**Interfaces:**
- Produces: table `MensajesEquipo(id, partidoId, equipo, usuarioId, texto, fechaEnvio)`, used by Task 3's `miEquipoService.js`.

- [ ] **Step 1: Append the table and index to the schema**

Add at the end of `backend/src/db/schema.sql`:

```sql

CREATE TABLE IF NOT EXISTS MensajesEquipo (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  texto TEXT NOT NULL,
  fechaEnvio TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mensajes_equipo ON MensajesEquipo (partidoId, equipo, fechaEnvio);
```

- [ ] **Step 2: Verify the table gets created**

Run from `backend/`:

```bash
SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
const fila = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='MensajesEquipo'\").get();
console.log(fila);
"
```

Expected: prints `{ name: 'MensajesEquipo' }`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.sql
git commit -m "feat(backend): agregar tabla MensajesEquipo"
```

---

### Task 2: Extract `verificarTokenValor` (reusable token verification)

**Files:**
- Create: `backend/src/utils/verificarTokenValor.js`
- Modify: `backend/src/middlewares/verificarToken.js`

**Interfaces:**
- Produces: `verificarTokenValor(token: string) => Promise<{ uid, email, nombre, emailVerificado } | null>`, used by the Express middleware (this task) and by the socket handshake (Task 4).

- [ ] **Step 1: Create the pure verification function**

Create `backend/src/utils/verificarTokenValor.js`:

```javascript
const { admin } = require('../config/firebase');
const { verificarTokenPropio } = require('./jwt');

async function verificarTokenValor(token) {
  const payloadPropio = verificarTokenPropio(token);
  if (payloadPropio) {
    // Un JWT propio (login por password) no prueba la titularidad del email:
    // cualquiera puede escribir cualquier email en el formulario de registro.
    // emailVerificado debe quedar en false para que sincronizarUsuario nunca
    // promueva a admin a partir de esta vía.
    return {
      uid: payloadPropio.uid,
      email: payloadPropio.email,
      nombre: payloadPropio.nombre,
      emailVerificado: false,
    };
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      nombre: decoded.name || decoded.email,
      emailVerificado: decoded.email_verified === true,
    };
  } catch (error) {
    return null;
  }
}

module.exports = verificarTokenValor;
```

- [ ] **Step 2: Make the middleware a thin wrapper over it**

Replace the contents of `backend/src/middlewares/verificarToken.js` with:

```javascript
const verificarTokenValor = require('../utils/verificarTokenValor');

async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const usuario = await verificarTokenValor(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  req.usuario = usuario;
  next();
}

module.exports = verificarToken;
```

- [ ] **Step 3: Verify behavior is unchanged**

Run from `backend/`:

```bash
node -e "
require('dotenv').config();
const verificarTokenValor = require('./src/utils/verificarTokenValor');
verificarTokenValor('token-invalido').then((r) => console.log('token invalido ->', r));
"
```

Expected: prints `token invalido -> null`.

Then confirm the app still loads with no wiring errors:

```bash
node -e "require('./src/app'); console.log('app OK')"
```

Expected: prints `app OK` with no thrown errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/utils/verificarTokenValor.js backend/src/middlewares/verificarToken.js
git commit -m "refactor(backend): extraer verificarTokenValor para reusar en middleware y sockets"
```

---

### Task 3: `miEquipoService.js`

**Files:**
- Create: `backend/src/services/miEquipoService.js`

**Interfaces:**
- Consumes: `partidosService.obtenerPartido(partidoId, grupoId) => partido | null` (has `votacionEquiposCerrada`); `usuariosService.obtenerUsuario(uid) => { nombre, ... } | null`; `db` from `../config/db`; `MensajesEquipo` table from Task 1.
- Produces:
  - `obtenerAccesoEquipo(partidoId, grupoId, usuarioId) => Promise<{ equipo: 'A'|'B' } | null>`, used by Task 5's controller and Task 4's socket handshake.
  - `obtenerMiEquipo(partidoId, grupoId, usuarioId) => Promise<{ equipo, companeros: [{uid, nombre}], mensajes: [{id, usuarioId, nombre, texto, fechaEnvio}] }>` (throws `{status:403}` on no access), used by Task 5's controller.
  - `enviarMensaje(partidoId, grupoId, usuarioId, texto) => Promise<{id, partidoId, equipo, usuarioId, nombre, texto, fechaEnvio}>` (throws `{status:403}` on no access, `{status:400}` on invalid text), used by Task 5's controller.

- [ ] **Step 1: Write the service**

Create `backend/src/services/miEquipoService.js`:

```javascript
const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerAccesoEquipo(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido || !partido.votacionEquiposCerrada) return null;

  const inscripcion = db
    .prepare(
      `SELECT equipo FROM Inscripciones
       WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado' AND tipo = 'titular'`
    )
    .get(partidoId, usuarioId);
  if (!inscripcion || !inscripcion.equipo) return null;

  return { equipo: inscripcion.equipo };
}

async function obtenerMiEquipo(partidoId, grupoId, usuarioId) {
  const acceso = await obtenerAccesoEquipo(partidoId, grupoId, usuarioId);
  if (!acceso) throw crearError('No tenés acceso al chat de este equipo', 403);

  const companerosFilas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo = ?`
    )
    .all(partidoId, acceso.equipo);
  const companeros = await Promise.all(
    companerosFilas.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { uid: fila.usuarioId, nombre: usuario?.nombre || 'Jugador' };
    })
  );

  const mensajesFilas = db
    .prepare(
      `SELECT id, usuarioId, texto, fechaEnvio FROM MensajesEquipo
       WHERE partidoId = ? AND equipo = ?
       ORDER BY fechaEnvio ASC
       LIMIT 50`
    )
    .all(partidoId, acceso.equipo);
  const mensajes = await Promise.all(
    mensajesFilas.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { ...fila, nombre: usuario?.nombre || 'Jugador' };
    })
  );

  return { equipo: acceso.equipo, companeros, mensajes };
}

async function enviarMensaje(partidoId, grupoId, usuarioId, texto) {
  const acceso = await obtenerAccesoEquipo(partidoId, grupoId, usuarioId);
  if (!acceso) throw crearError('No tenés acceso al chat de este equipo', 403);

  const textoLimpio = typeof texto === 'string' ? texto.trim() : '';
  if (!textoLimpio) throw crearError('El mensaje no puede estar vacío', 400);
  if (textoLimpio.length > 500) throw crearError('El mensaje es demasiado largo (máximo 500 caracteres)', 400);

  const usuario = await usuariosService.obtenerUsuario(usuarioId);
  const mensaje = {
    id: crypto.randomUUID(),
    partidoId,
    equipo: acceso.equipo,
    usuarioId,
    texto: textoLimpio,
    fechaEnvio: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO MensajesEquipo (id, partidoId, equipo, usuarioId, texto, fechaEnvio)
     VALUES (@id, @partidoId, @equipo, @usuarioId, @texto, @fechaEnvio)`
  ).run(mensaje);

  return { ...mensaje, nombre: usuario?.nombre || 'Jugador' };
}

module.exports = { obtenerAccesoEquipo, obtenerMiEquipo, enviarMensaje };
```

- [ ] **Step 2: Verify with a self-contained fixture script**

Run from `backend/`:

```bash
SQLITE_DB_PATH=:memory: node -e "
require('dotenv').config();
const crypto = require('crypto');
const { db } = require('./src/config/db');
const miEquipoService = require('./src/services/miEquipoService');

const ahora = new Date().toISOString();
const grupoId = crypto.randomUUID();
const partidoId = crypto.randomUUID();
const uidA1 = crypto.randomUUID();
const uidA2 = crypto.randomUUID();
const uidB1 = crypto.randomUUID();

db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?,?,?,?)').run(uidA1, 'Ana', 'ana@test.com', ahora);
db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?,?,?,?)').run(uidA2, 'Beto', 'beto@test.com', ahora);
db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?,?,?,?)').run(uidB1, 'Cami', 'cami@test.com', ahora);
db.prepare('INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion) VALUES (?,?,?,?,?)').run(grupoId, 'Grupo Test', 'TEST-1', uidA1, ahora);
db.prepare('INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes, votacionEquiposCerrada) VALUES (?,?,?,?,?,?,?,1)').run(partidoId, ahora, 'abierto', uidA1, grupoId, 2, 0);
db.prepare('INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), partidoId, uidA1, 'anotado', 'titular', 0, ahora, 'A');
db.prepare('INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), partidoId, uidA2, 'anotado', 'titular', 1, ahora, 'A');
db.prepare('INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), partidoId, uidB1, 'anotado', 'titular', 2, ahora, 'B');

miEquipoService.obtenerMiEquipo(partidoId, grupoId, uidA1)
  .then((datos) => {
    console.log('acceso A1:', JSON.stringify(datos));
    return miEquipoService.enviarMensaje(partidoId, grupoId, uidA1, 'Hola equipo');
  })
  .then((mensaje) => {
    console.log('mensaje enviado:', JSON.stringify(mensaje));
    return miEquipoService.obtenerAccesoEquipo(partidoId, grupoId, uidB1);
  })
  .then((accesoB) => console.log('acceso B1:', JSON.stringify(accesoB)))
  .catch((error) => { console.error('ERROR:', error); process.exit(1); });
"
```

Expected:
- `acceso A1:` shows `equipo:"A"`, `companeros` with Ana and Beto, `mensajes:[]`.
- `mensaje enviado:` shows `equipo:"A"`, `texto:"Hola equipo"`, `nombre:"Ana"`.
- `acceso B1:` shows `{"equipo":"B"}`.
- No `ERROR:` line printed.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/miEquipoService.js
git commit -m "feat(backend): agregar miEquipoService (acceso, listado y envio de mensajes)"
```

---

### Task 4: Socket.io server

**Files:**
- Create: `backend/src/config/socket.js`
- Modify: `backend/server.js`
- Modify: `backend/package.json` (add `socket.io` dependency)

**Interfaces:**
- Consumes: `verificarTokenValor` (Task 2), `miEquipoService.obtenerAccesoEquipo` (Task 3), `gruposService.obtenerMembresia(grupoId, usuarioId)`, `usuariosService.obtenerUsuario(uid)`.
- Produces: `configurarSocket(servidorHttp) => io` (a `socket.io` `Server` instance). `server.js` stores it via `app.set('io', io)`, consumed by Task 5's controller to broadcast `nuevoMensaje`.

- [ ] **Step 1: Install the dependency**

```bash
cd backend && npm install socket.io
```

- [ ] **Step 2: Write the socket configuration**

Create `backend/src/config/socket.js`:

```javascript
const { Server } = require('socket.io');
const verificarTokenValor = require('../utils/verificarTokenValor');
const usuariosService = require('../services/usuariosService');
const gruposService = require('../services/gruposService');
const miEquipoService = require('../services/miEquipoService');

function configurarSocket(servidorHttp) {
  const io = new Server(servidorHttp, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.on('unirse', async ({ grupoId, partidoId, token } = {}) => {
      try {
        const usuario = await verificarTokenValor(token);
        if (!usuario) throw new Error('Token inválido');

        const perfil = await usuariosService.obtenerUsuario(usuario.uid);
        if (!perfil?.esSuperAdmin) {
          const membresia = await gruposService.obtenerMembresia(grupoId, usuario.uid);
          if (!membresia) throw new Error('No pertenecés a este grupo');
        }

        const acceso = await miEquipoService.obtenerAccesoEquipo(partidoId, grupoId, usuario.uid);
        if (!acceso) throw new Error('No tenés acceso al chat de este equipo');

        socket.join(`equipo:${partidoId}:${acceso.equipo}`);
      } catch (error) {
        socket.emit('error', { mensaje: error.message });
        socket.disconnect();
      }
    });
  });

  return io;
}

module.exports = configurarSocket;
```

- [ ] **Step 3: Wire it into the HTTP server**

In `backend/server.js`, change:

```javascript
require('dotenv').config();
const app = require('./src/app');
```

to:

```javascript
require('dotenv').config();
const http = require('node:http');
const app = require('./src/app');
const configurarSocket = require('./src/config/socket');
```

And change the bottom of the file from:

```javascript
app.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
```

to:

```javascript
const servidorHttp = http.createServer(app);
const io = configurarSocket(servidorHttp);
app.set('io', io);

servidorHttp.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
```

- [ ] **Step 4: Verify the socket server responds**

Run from `backend/`:

```bash
npm run dev &
sleep 1
curl -s "http://localhost:4000/socket.io/?EIO=4&transport=polling"
kill %1
```

Expected: output starts with `0{"sid":"..."` (the engine.io handshake payload), confirming `socket.io` is mounted on the same HTTP server. If the port is busy, stop whatever is already running on 4000 first.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/socket.js backend/server.js backend/package.json backend/package-lock.json
git commit -m "feat(backend): montar servidor socket.io sobre el http server existente"
```

---

### Task 5: REST endpoints for "Mi equipo"

**Files:**
- Create: `backend/src/controllers/miEquipoController.js`
- Modify: `backend/src/routes/partidosRoutes.js`

**Interfaces:**
- Consumes: `miEquipoService.obtenerMiEquipo` / `.enviarMensaje` (Task 3), `req.app.get('io')` (Task 4).
- Produces: `GET /api/grupos/:grupoId/partidos/:partidoId/mi-equipo`, `POST /api/grupos/:grupoId/partidos/:partidoId/mi-equipo/mensajes`, consumed by Task 7's frontend page.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/miEquipoController.js`:

```javascript
const miEquipoService = require('../services/miEquipoService');

async function obtener(req, res) {
  const datos = await miEquipoService.obtenerMiEquipo(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(datos);
}

async function enviarMensaje(req, res) {
  const mensaje = await miEquipoService.enviarMensaje(
    req.params.partidoId,
    req.params.grupoId,
    req.usuario.uid,
    req.body.texto
  );
  const io = req.app.get('io');
  io.to(`equipo:${req.params.partidoId}:${mensaje.equipo}`).emit('nuevoMensaje', mensaje);
  res.status(201).json(mensaje);
}

module.exports = { obtener, enviarMensaje };
```

- [ ] **Step 2: Wire the routes**

In `backend/src/routes/partidosRoutes.js`, add the require near the other controller requires:

```javascript
const miEquipoController = require('../controllers/miEquipoController');
```

And add these two routes before `module.exports = router;`:

```javascript
router.get(
  '/:partidoId/mi-equipo',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(miEquipoController.obtener)
);
router.post(
  '/:partidoId/mi-equipo/mensajes',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(miEquipoController.enviarMensaje)
);
```

- [ ] **Step 3: Verify end-to-end against a running server**

This reuses the same fixture shape as Task 3's script, but inserted into the real dev DB so the running server can see it, and exercised over HTTP with a real JWT.

Run from `backend/`:

```bash
node -e "
require('dotenv').config();
const crypto = require('crypto');
const { db } = require('./src/config/db');
const { firmarToken } = require('./src/utils/jwt');

const ahora = new Date().toISOString();
const grupoId = crypto.randomUUID();
const partidoId = crypto.randomUUID();
const uidA1 = crypto.randomUUID();
const uidA2 = crypto.randomUUID();

db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?,?,?,?)').run(uidA1, 'Ana', 'ana@verificacion.com', ahora);
db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?,?,?,?)').run(uidA2, 'Beto', 'beto@verificacion.com', ahora);
db.prepare('INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion) VALUES (?,?,?,?,?)').run(grupoId, 'Grupo Verificacion', 'VERIF-1', uidA1, ahora);
db.prepare('INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), grupoId, uidA1, 'jugador', 0, ahora);
db.prepare('INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes, votacionEquiposCerrada) VALUES (?,?,?,?,?,?,?,1)').run(partidoId, ahora, 'abierto', uidA1, grupoId, 2, 0);
db.prepare('INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), partidoId, uidA1, 'anotado', 'titular', 0, ahora, 'A');
db.prepare('INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), partidoId, uidA2, 'anotado', 'titular', 1, ahora, 'A');

const token = firmarToken({ uid: uidA1, email: 'ana@verificacion.com', nombre: 'Ana' });
console.log('GRUPO_ID=' + grupoId);
console.log('PARTIDO_ID=' + partidoId);
console.log('TOKEN=' + token);
"
```

Copy the three printed values, then (with `npm run dev` running in another terminal):

```bash
curl -s -H "Authorization: Bearer <TOKEN>" "http://localhost:4000/api/grupos/<GRUPO_ID>/partidos/<PARTIDO_ID>/mi-equipo"
```

Expected: JSON with `"equipo":"A"` and `companeros` listing Ana and Beto.

```bash
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"texto":"Vamos equipo"}' \
  "http://localhost:4000/api/grupos/<GRUPO_ID>/partidos/<PARTIDO_ID>/mi-equipo/mensajes"
```

Expected: `201` JSON with `"texto":"Vamos equipo"`. Re-running the first `GET` should now include this message in `mensajes`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/miEquipoController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): exponer GET/POST mi-equipo con broadcast por socket.io"
```

---

### Task 6: "Mi equipo" button in Home

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: existing `propuestasPorPartido[partido.id].votacionEquiposCerrada` (from `GET .../formaciones-propuestas`, already loaded), existing `formacionesPorPartido[partido.id].jugadores` (from `GET .../formacion`, already loaded, titulares only).
- Produces: navigation to `/mi-equipo/:partidoId` (route created in Task 7).

- [ ] **Step 1: Add navigation and the button**

In `frontend/src/pages/Home.jsx`, add the import:

```javascript
import { useNavigate } from 'react-router-dom';
import Boton from '../components/Boton';
```

Inside `export default function Home() {`, right after the existing hooks, add:

```javascript
const navigate = useNavigate();
```

After `inscripcionDelUsuario`, add a helper:

```javascript
function miEquipoAsignado(partidoId) {
  const inscripcion = inscripcionDelUsuario(partidoId);
  if (inscripcion?.tipo !== 'titular') return null;
  const jugador = formacionesPorPartido[partidoId]?.jugadores?.find((j) => j.usuarioId === perfil?.uid);
  return jugador?.equipo || null;
}
```

Inside the `partidos.map((partido) => (...))` block, right after the closing `</div>` of the `formacionesPorPartido[partido.id] ? 'grid ...' : ''` block (before the `{propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (...)}` block), add:

```jsx
{propuestasPorPartido[partido.id]?.votacionEquiposCerrada && miEquipoAsignado(partido.id) && (
  <Boton variante="ghost" onClick={() => navigate(`/mi-equipo/${partido.id}`)}>
    Mi equipo
  </Boton>
)}
```

- [ ] **Step 2: Verify manually**

Run `cd frontend && npm run dev`, open the app, and confirm:
- For a partido where `votacionEquiposCerrada` is still `0` (or there's no `propuestasPorPartido` entry), no "Mi equipo" button renders.
- No console errors on the Home page.

(Full confirmation that the button appears when voting is closed happens in Task 8, once there's a real closed-vote fixture to look at.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat(frontend): boton Mi equipo en Home cuando la votacion de equipos cierra"
```

---

### Task 7: `MiEquipo.jsx` page and route

**Files:**
- Create: `frontend/src/pages/MiEquipo.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/package.json` (add `socket.io-client` dependency)

**Interfaces:**
- Consumes: `GET /api/grupos/:grupoId/partidos/:partidoId/mi-equipo`, `POST .../mi-equipo/mensajes` (Task 5), socket `nuevoMensaje`/`error` events and `unirse` emit (Task 4), `useGrupo().grupoActivo.id`, `SERVER_URL` from `services/api.js`, `auth`/`TOKEN_KEY` for the socket handshake token.
- Produces: route `/mi-equipo/:partidoId`, reachable from Task 6's button.

- [ ] **Step 1: Install the dependency**

```bash
cd frontend && npm install socket.io-client
```

- [ ] **Step 2: Write the page**

Create `frontend/src/pages/MiEquipo.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { SERVER_URL } from '../services/api';
import { auth } from '../config/firebase';
import { TOKEN_KEY } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import Boton from '../components/Boton';

async function obtenerTokenActual() {
  if (auth?.currentUser) return auth.currentUser.getIdToken();
  return localStorage.getItem(TOKEN_KEY);
}

export default function MiEquipo() {
  const { partidoId } = useParams();
  const { grupoActivo } = useGrupo();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const listaRef = useRef(null);

  useEffect(() => {
    if (!grupoActivo) return undefined;
    let cancelado = false;
    let socket;

    async function iniciar() {
      try {
        const { data } = await api.get(`/grupos/${grupoActivo.id}/partidos/${partidoId}/mi-equipo`);
        if (cancelado) return;
        setDatos(data);
        setMensajes(data.mensajes);
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }

      const token = await obtenerTokenActual();
      socket = io(SERVER_URL);
      socket.emit('unirse', { grupoId: grupoActivo.id, partidoId, token });
      socket.on('nuevoMensaje', (mensaje) => {
        setMensajes((anteriores) => [...anteriores, mensaje]);
      });
      socket.on('error', ({ mensaje }) => {
        if (!cancelado) setError(mensaje);
      });
    }

    iniciar();

    return () => {
      cancelado = true;
      socket?.disconnect();
    };
  }, [grupoActivo, partidoId]);

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensajes]);

  async function enviar(evento) {
    evento.preventDefault();
    const textoLimpio = texto.trim();
    if (!textoLimpio) return;
    setEnviando(true);
    setError('');
    try {
      await api.post(`/grupos/${grupoActivo.id}/partidos/${partidoId}/mi-equipo/mensajes`, { texto: textoLimpio });
      setTexto('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <p className="text-white/60">Cargando…</p>;
  }

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error || 'No tenés acceso a este chat'}</p>
        <Boton variante="ghost" onClick={() => navigate('/inicio')}>
          Volver al inicio
        </Boton>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-3xl text-white">Mi equipo</h1>

      <div className="rounded-xl border border-white/10 bg-cancha-800 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-pasto-500">Equipo {datos.equipo}</p>
        <div className="flex flex-wrap gap-2 text-sm text-white/80">
          {datos.companeros.map((companero) => (
            <span key={companero.uid} className="rounded-full bg-cancha-700 px-3 py-1">
              {companero.nombre}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      <div
        ref={listaRef}
        className="flex h-96 flex-col gap-2 overflow-y-auto rounded-xl border border-white/10 bg-cancha-800 p-4"
      >
        {mensajes.map((mensaje) => (
          <div key={mensaje.id} className="text-sm text-white/80">
            <span className="font-semibold text-white">{mensaje.nombre}: </span>
            {mensaje.texto}
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className="flex gap-2">
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={500}
          placeholder="Escribí un mensaje…"
          className="flex-1 rounded-lg border border-white/20 bg-cancha-700 px-3 py-2 text-white placeholder:text-white/40"
        />
        <Boton type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </Boton>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Register the route**

In `frontend/src/App.jsx`, add the import:

```javascript
import MiEquipo from './pages/MiEquipo';
```

And add this route next to the other `RutaPrivada` routes (e.g. after `/historial`):

```jsx
<Route
  path="/mi-equipo/:partidoId"
  element={
    <RutaPrivada>
      <Layout>
        <MiEquipo />
      </Layout>
    </RutaPrivada>
  }
/>
```

- [ ] **Step 4: Verify manually**

Run `cd frontend && npm run dev` (with the backend from Task 5 also running against the seeded fixture, or a real match whose voting you close through the app), then:
- Navigate directly to `/mi-equipo/<un-partido-sin-acceso>` and confirm the "No tenés acceso a este chat" state renders with a working "Volver al inicio" button.
- Click "Mi equipo" from Home for a match where you're a titular and voting has closed, and confirm the teammates list and (possibly empty) message list render with no console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MiEquipo.jsx frontend/src/App.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): pagina Mi equipo con chat en tiempo real via socket.io"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Full flow in the browser**

With both `backend` (`npm run dev`) and `frontend` (`npm run dev`) running:

1. As an admin, create a match with a small `cupoTitulares` (e.g. 2) in a real group, and get two users anotados as titulares.
2. Propose a formation, assign both titulares to team A (or split across A/B with more players — adjust cupo as needed to reach a real close), and close the voting (via voting it through or the admin's manual "Cerrar votación").
3. Confirm the "Mi equipo" button appears on Home for both titulares, and does not appear for a user who is a suplente or not in that match.
4. Open two browser sessions (or one normal + one incognito) logged in as the two teammates, both on the `/mi-equipo/<partidoId>` page.
5. Send a message from one session; confirm it appears in the other session within a second or two, without a manual refresh.
6. Refresh one session's page; confirm the message history still shows the sent message (proves SQLite persistence, not just the live socket).
7. If the match has a second team (B), confirm a user on team B never sees team A's messages and vice versa.

- [ ] **Step 2: Report results**

No commit for this task — if any check fails, fix the relevant earlier task and re-verify before considering the feature done.
