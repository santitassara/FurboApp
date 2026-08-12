# Login con usuario/contraseña (JWT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar login con email/contraseña (JWT propio) que coexiste con el login de Google existente, sin romper ninguna ruta protegida actual.

**Architecture:** Se agrega una columna `passwordHash` a `Usuarios`, dos endpoints públicos (`/api/auth/register`, `/api/auth/login`) que emiten un JWT propio, y se extiende `verificarToken` para aceptar tanto ese JWT como el token de Firebase existente (intenta JWT propio primero, si falla cae a Firebase). El frontend guarda el JWT en `localStorage` y lo usa como fallback en el interceptor de Axios cuando no hay sesión de Firebase activa.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React/Axios (frontend), `jsonwebtoken` + `bcryptjs` (nuevas dependencias backend).

## Global Constraints

- No se escriben tests automatizados para esta feature (pedido explícito del usuario). La verificación de cada tarea es manual (scripts `node -e`, `curl`, build, y una verificación end-to-end en navegador al final).
- El registro por contraseña **nunca** otorga rol `admin`, sin importar `ADMIN_EMAILS` (spec, sección 3).
- JWT propio: payload `{ uid, email, nombre }`, `algorithm: 'HS256'`, `expiresIn: '7d'`. La verificación siempre fija `algorithms: ['HS256']` explícitamente.
- Mensajes de error de login genéricos: `"Credenciales inválidas"` sin distinguir el motivo.
- No se toca `RutaPrivada`, `RutaAdmin`, ni ninguna ruta protegida existente más allá de `verificarToken`.
- Spec completo: `docs/superpowers/specs/2026-08-12-login-password-jwt-design.md`.

---

### Task 1: Migración de base de datos — columna `passwordHash`

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js`

**Interfaces:**
- Produces: la tabla `Usuarios` tiene una columna `passwordHash TEXT` (nullable) tanto en bases nuevas como en bases SQLite ya existentes que no la tenían.

- [ ] **Step 1: Agregar la columna al schema para bases nuevas**

En `backend/src/db/schema.sql`, en el `CREATE TABLE IF NOT EXISTS Usuarios`, agregar la columna al final de la lista de columnas (antes del paréntesis de cierre):

```sql
CREATE TABLE IF NOT EXISTS Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jugador')),
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL,
  passwordHash TEXT
);
```

- [ ] **Step 2: Migrar bases ya existentes**

En `backend/src/config/db.js`, después de la línea `db.exec(fs.readFileSync(...))`, agregar:

```js
const columnasUsuarios = db.prepare('PRAGMA table_info(Usuarios)').all();
const tienePasswordHash = columnasUsuarios.some((columna) => columna.name === 'passwordHash');
if (!tienePasswordHash) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordHash TEXT');
}
```

El archivo completo de la sección relevante queda:

```js
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const columnasUsuarios = db.prepare('PRAGMA table_info(Usuarios)').all();
const tienePasswordHash = columnasUsuarios.some((columna) => columna.name === 'passwordHash');
if (!tienePasswordHash) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordHash TEXT');
}

module.exports = { db };
```

- [ ] **Step 3: Verificar manualmente — base nueva**

Desde `backend/`:

```bash
rm -f /tmp/furboapp-test.db
SQLITE_DB_PATH=/tmp/furboapp-test.db node -e "
const { db } = require('./src/config/db');
const columnas = db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name);
console.log(columnas);
if (!columnas.includes('passwordHash')) throw new Error('FALTA passwordHash');
console.log('OK: columna presente en base nueva');
"
```

Expected: imprime el array de columnas incluyendo `passwordHash` y termina con `OK: columna presente en base nueva`.

- [ ] **Step 4: Verificar manualmente — base ya existente sin la columna**

Simular una base "vieja" creando la tabla sin `passwordHash` a mano, y confirmar que la migración la agrega al cargar `db.js`:

```bash
rm -f /tmp/furboapp-test-vieja.db
node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/furboapp-test-vieja.db');
db.exec(\`CREATE TABLE Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol TEXT NOT NULL,
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL
)\`);
db.close();
"
SQLITE_DB_PATH=/tmp/furboapp-test-vieja.db node -e "
const { db } = require('./src/config/db');
const columnas = db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name);
console.log(columnas);
if (!columnas.includes('passwordHash')) throw new Error('la migración no agregó la columna');
console.log('OK: migración aplicada sobre base vieja');
"
rm -f /tmp/furboapp-test.db /tmp/furboapp-test-vieja.db
```

Expected: segundo comando imprime las columnas incluyendo `passwordHash` y termina con `OK: migración aplicada sobre base vieja`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js
git commit -m "feat(backend): agregar columna passwordHash a Usuarios con migración"
```

---

### Task 2: Utilidad JWT propia y dependencias

**Files:**
- Create: `backend/src/utils/jwt.js`
- Modify: `backend/package.json` (vía `npm install`)
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `firmarToken(usuario)` → `string` (JWT). `verificarTokenPropio(token)` → objeto payload `{ uid, email, nombre, iat, exp }` si es válido, o `null` si no lo es (nunca lanza).
- Consumes: `process.env.JWT_SECRET`.

- [ ] **Step 1: Instalar dependencias**

```bash
cd backend && npm install jsonwebtoken bcryptjs
```

- [ ] **Step 2: Agregar `JWT_SECRET` a las variables de entorno**

En `backend/.env.example`, agregar una línea:

```
JWT_SECRET=cambiame-por-un-secreto-largo-y-random
```

En `backend/.env` (archivo local, no versionado) agregar la misma variable con un valor real, por ejemplo:

```bash
grep -q '^JWT_SECRET=' backend/.env || echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> backend/.env
```

- [ ] **Step 3: Crear `backend/src/utils/jwt.js`**

```js
const jwt = require('jsonwebtoken');

const ALGORITMO = 'HS256';

function firmarToken(usuario) {
  return jwt.sign(
    { uid: usuario.uid, email: usuario.email, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { algorithm: ALGORITMO, expiresIn: '7d' }
  );
}

function verificarTokenPropio(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITMO] });
  } catch (error) {
    return null;
  }
}

module.exports = { firmarToken, verificarTokenPropio };
```

- [ ] **Step 4: Verificar manualmente — roundtrip de firma/verificación**

```bash
cd backend && JWT_SECRET=secreto-de-prueba node -e "
require('dotenv').config = () => {};
process.env.JWT_SECRET = 'secreto-de-prueba';
const { firmarToken, verificarTokenPropio } = require('./src/utils/jwt');

const token = firmarToken({ uid: 'abc123', email: 'test@test.com', nombre: 'Test' });
console.log('token:', token);

const payload = verificarTokenPropio(token);
console.log('payload:', payload);
if (payload.uid !== 'abc123' || payload.email !== 'test@test.com') throw new Error('payload incorrecto');

const invalido = verificarTokenPropio('esto.no.es.un.jwt.valido');
if (invalido !== null) throw new Error('debería devolver null con token inválido');

console.log('OK: firma y verificación funcionan');
"
```

Expected: imprime el token, el payload decodificado, y termina con `OK: firma y verificación funcionan`.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/utils/jwt.js backend/.env.example
git commit -m "feat(backend): agregar utilidad de firma/verificación de JWT propio"
```

---

### Task 3: `usuariosService` — registro y autenticación por contraseña

**Files:**
- Modify: `backend/src/services/usuariosService.js`

**Interfaces:**
- Consumes: nada nuevo de otras tareas (usa `db` de `../config/db`, que ya tiene `passwordHash` por la Task 1).
- Produces:
  - `registrarConPassword({ nombre, email, password })` → `Promise<usuario>` (forma pública, sin `passwordHash`). Lanza `Error` con `.status = 409` si el email ya tiene contraseña seteada.
  - `autenticarConPassword({ email, password })` → `Promise<usuario>` (forma pública). Lanza `Error` con `.status = 401` y mensaje `"Credenciales inválidas"` si el email no existe, no tiene contraseña, o la contraseña no matchea.
  - `filaAUsuario` deja de incluir `passwordHash` en el objeto devuelto (afecta también a `sincronizarUsuario`, `obtenerUsuario`, `listarSancionados`, que ya no debían exponerlo).

> Nota: el spec original mencionaba extraer un helper `esEmailAdmin(email)` compartido entre `sincronizarUsuario` y el registro por contraseña. Se omite: como el registro por contraseña nunca consulta `ADMIN_EMAILS` (decisión de seguridad de la sección 3 del spec), no hay lógica duplicada que extraer. `obtenerAdminEmails()` sigue usándose solo en `sincronizarUsuario`, sin cambios.

- [ ] **Step 1: Actualizar `filaAUsuario` para no exponer `passwordHash`**

Reemplazar:

```js
const filaAUsuario = (fila) => (fila ? { ...fila, estaSancionado: Boolean(fila.estaSancionado) } : null);
```

Por:

```js
const filaAUsuario = (fila) => {
  if (!fila) return null;
  const { passwordHash, ...resto } = fila;
  return { ...resto, estaSancionado: Boolean(fila.estaSancionado) };
};
```

- [ ] **Step 2: Agregar `require` de `bcryptjs` y `node:crypto`**

Al inicio del archivo, junto al require existente de `db`:

```js
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
```

- [ ] **Step 3: Agregar `registrarConPassword` y `autenticarConPassword`**

Agregar antes de `module.exports`:

```js
async function registrarConPassword({ nombre, email, password }) {
  const emailNormalizado = String(email).trim().toLowerCase();
  const existente = db.prepare('SELECT * FROM Usuarios WHERE email = ?').get(emailNormalizado);

  if (existente && existente.passwordHash) {
    const error = new Error('El email ya está registrado');
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (existente) {
    db.prepare('UPDATE Usuarios SET passwordHash = ? WHERE uid = ?').run(passwordHash, existente.uid);
    return filaAUsuario({ ...existente, passwordHash });
  }

  const nuevoUsuario = {
    uid: crypto.randomUUID(),
    nombre: String(nombre).trim(),
    email: emailNormalizado,
    rol: 'jugador',
    estaSancionado: false,
    fechaCreacion: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion, passwordHash)
     VALUES (@uid, @nombre, @email, @rol, @estaSancionado, @fechaCreacion, @passwordHash)`
  ).run({ ...nuevoUsuario, estaSancionado: 0, passwordHash });
  return filaAUsuario({ ...nuevoUsuario, passwordHash });
}

async function autenticarConPassword({ email, password }) {
  const emailNormalizado = String(email).trim().toLowerCase();
  const usuario = db.prepare('SELECT * FROM Usuarios WHERE email = ?').get(emailNormalizado);

  if (!usuario || !usuario.passwordHash) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  const coincide = await bcrypt.compare(password, usuario.passwordHash);
  if (!coincide) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  return filaAUsuario(usuario);
}
```

Y actualizar el `module.exports` final:

```js
module.exports = {
  sincronizarUsuario,
  obtenerUsuario,
  listarSancionados,
  perdonarSancion,
  sancionar,
  registrarConPassword,
  autenticarConPassword,
};
```

- [ ] **Step 4: Verificar manualmente**

```bash
cd backend && rm -f /tmp/furboapp-service-test.db && SQLITE_DB_PATH=/tmp/furboapp-service-test.db ADMIN_EMAILS=admin@test.com node -e "
(async () => {
  const usuariosService = require('./src/services/usuariosService');

  const nuevo = await usuariosService.registrarConPassword({ nombre: 'Juan', email: 'Juan@Test.com', password: '123456' });
  console.log('registrado:', nuevo);
  if (nuevo.passwordHash) throw new Error('no debería exponer passwordHash');
  if (nuevo.rol !== 'jugador') throw new Error('rol debería ser jugador');

  const login = await usuariosService.autenticarConPassword({ email: 'juan@test.com', password: '123456' });
  console.log('login OK:', login);

  try {
    await usuariosService.autenticarConPassword({ email: 'juan@test.com', password: 'incorrecta' });
    throw new Error('debería haber rechazado la contraseña incorrecta');
  } catch (error) {
    if (error.status !== 401) throw error;
    console.log('OK: rechazó contraseña incorrecta con 401');
  }

  try {
    await usuariosService.registrarConPassword({ nombre: 'Otro', email: 'juan@test.com', password: 'otra123' });
    throw new Error('debería haber rechazado el email duplicado');
  } catch (error) {
    if (error.status !== 409) throw error;
    console.log('OK: rechazó email duplicado con 409');
  }

  // Admin vía ADMIN_EMAILS nunca debe otorgarse por registro con password:
  const intentoAdmin = await usuariosService.registrarConPassword({ nombre: 'Falso Admin', email: 'admin@test.com', password: '123456' });
  if (intentoAdmin.rol !== 'jugador') throw new Error('SEGURIDAD: el registro otorgó admin');
  console.log('OK: registro con email de ADMIN_EMAILS sigue siendo jugador');

  console.log('TODO OK');
})().catch((e) => { console.error(e); process.exit(1); });
"
rm -f /tmp/furboapp-service-test.db
```

Expected: imprime cada paso y termina en `TODO OK` sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/usuariosService.js
git commit -m "feat(backend): agregar registro y autenticación por contraseña en usuariosService"
```

---

### Task 4: Endpoints `POST /api/auth/register` y `POST /api/auth/login`

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/authRoutes.js`

**Interfaces:**
- Consumes: `usuariosService.registrarConPassword`, `usuariosService.autenticarConPassword` (Task 3); `firmarToken` de `../utils/jwt` (Task 2).
- Produces: `POST /api/auth/register` y `POST /api/auth/login` (ambas públicas, sin `verificarToken`), responden `{ token, usuario }`.

- [ ] **Step 1: Actualizar `backend/src/controllers/authController.js`**

```js
const usuariosService = require('../services/usuariosService');
const { firmarToken } = require('../utils/jwt');

function lanzarError(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  throw error;
}

function validarEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function sync(req, res) {
  const usuario = await usuariosService.sincronizarUsuario(req.usuario);
  res.json(usuario);
}

async function register(req, res) {
  const { nombre, email, password } = req.body;

  if (!nombre || !String(nombre).trim()) lanzarError(400, 'El nombre es obligatorio');
  if (!validarEmail(email)) lanzarError(400, 'El email no es válido');
  if (!password || String(password).length < 6) lanzarError(400, 'La contraseña debe tener al menos 6 caracteres');

  const usuario = await usuariosService.registrarConPassword({ nombre, email, password });
  const token = firmarToken(usuario);
  res.status(201).json({ token, usuario });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!validarEmail(email)) lanzarError(400, 'El email no es válido');
  if (!password) lanzarError(400, 'La contraseña es obligatoria');

  const usuario = await usuariosService.autenticarConPassword({ email, password });
  const token = firmarToken(usuario);
  res.json({ token, usuario });
}

module.exports = { sync, register, login };
```

- [ ] **Step 2: Actualizar `backend/src/routes/authRoutes.js`**

```js
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const envolverAsync = require('../utils/envolverAsync');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', envolverAsync(authController.register));
router.post('/login', envolverAsync(authController.login));
router.post('/sync', verificarToken, envolverAsync(authController.sync));

module.exports = router;
```

- [ ] **Step 3: Verificar manualmente end-to-end con el servidor real**

En una terminal, levantar el servidor con una base descartable:

```bash
cd backend
rm -f /tmp/furboapp-endpoints-test.db
SQLITE_DB_PATH=/tmp/furboapp-endpoints-test.db PORT=4055 ADMIN_EMAILS=admin@test.com \
  FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"x","private_key":"<PEM_DE_PRUEBA_DESCARTABLE_AQUI>","client_email":"x@x.iam.gserviceaccount.com"}' \
  node --watch server.js &
sleep 1
```

En otra terminal (o la misma, luego), ejecutar las pruebas con `curl`:

```bash
# Registro
curl -s -X POST http://localhost:4055/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Juan","email":"juan@test.com","password":"123456"}' | tee /tmp/register.json
echo

# Login correcto
curl -s -X POST http://localhost:4055/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"juan@test.com","password":"123456"}'
echo

# Login incorrecto -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4055/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"juan@test.com","password":"mala"}'

# Registro duplicado -> 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4055/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Otro","email":"juan@test.com","password":"otra123"}'

# Password corta -> 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4055/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"X","email":"x@test.com","password":"123"}'
```

Expected:
- Registro devuelve 201 con `{ token, usuario }` donde `usuario.rol === "jugador"` y no tiene `passwordHash`.
- Login correcto devuelve 200 con `{ token, usuario }`.
- Login incorrecto devuelve `401`.
- Registro duplicado devuelve `409`.
- Password corta devuelve `400`.

Al terminar, apagar el servidor y limpiar:

```bash
kill %1
rm -f /tmp/furboapp-endpoints-test.db /tmp/register.json
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/authRoutes.js
git commit -m "feat(backend): agregar endpoints POST /api/auth/register y /api/auth/login"
```

---

### Task 5: Unificar `verificarToken` para aceptar JWT propio o Firebase

**Files:**
- Modify: `backend/src/middlewares/verificarToken.js`

**Interfaces:**
- Consumes: `verificarTokenPropio` de `../utils/jwt` (Task 2).
- Produces: `req.usuario = { uid, email, nombre, emailVerificado }` sin importar si el token es un JWT propio o uno de Firebase. Ninguna otra ruta protegida cambia.

- [ ] **Step 1: Reescribir `backend/src/middlewares/verificarToken.js`**

```js
const { admin } = require('../config/firebase');
const { verificarTokenPropio } = require('../utils/jwt');

async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const payloadPropio = verificarTokenPropio(token);
  if (payloadPropio) {
    req.usuario = {
      uid: payloadPropio.uid,
      email: payloadPropio.email,
      nombre: payloadPropio.nombre,
      emailVerificado: true,
    };
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.usuario = {
      uid: decoded.uid,
      email: decoded.email,
      nombre: decoded.name || decoded.email,
      emailVerificado: decoded.email_verified === true,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = verificarToken;
```

- [ ] **Step 2: Verificar manualmente — el JWT propio pasa por una ruta protegida**

Repetir el arranque del servidor de la Task 4 (mismo puerto 4055 o el que prefieras) y encadenar:

```bash
cd backend
rm -f /tmp/furboapp-mw-test.db
SQLITE_DB_PATH=/tmp/furboapp-mw-test.db PORT=4056 ADMIN_EMAILS=admin@test.com \
  FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"x","private_key":"<PEM_DE_PRUEBA_DESCARTABLE_AQUI>","client_email":"x@x.iam.gserviceaccount.com"}' \
  node --watch server.js &
sleep 1

TOKEN=$(curl -s -X POST http://localhost:4056/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Ana","email":"ana@test.com","password":"123456"}' | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).token))")

echo "token: $TOKEN"

# /auth/sync está protegida por verificarToken: debe aceptar el JWT propio
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4056/api/auth/sync \
  -H "Authorization: Bearer $TOKEN"

# Sin token -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4056/api/auth/sync

# Token basura -> 401 (no crashea el servidor)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4056/api/auth/sync \
  -H "Authorization: Bearer esto.no.es.valido"

kill %1
rm -f /tmp/furboapp-mw-test.db
```

Expected: la llamada a `/auth/sync` con el JWT propio devuelve `200`; sin token devuelve `401`; con token basura devuelve `401` (sin que el proceso del servidor se caiga).

- [ ] **Step 3: Commit**

```bash
git add backend/src/middlewares/verificarToken.js
git commit -m "feat(backend): unificar verificarToken para aceptar JWT propio o token de Firebase"
```

---

### Task 6: Frontend — `AuthContext` y `api.js`

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/context/AuthContext.jsx`

**Interfaces:**
- Produces: `useAuth()` expone además `iniciarSesionConPassword(email, password)` y `registrarse(nombre, email, password)` (ambas `async`, lanzan si la API responde error). La sesión por contraseña persiste al recargar la página vía `localStorage`.
- Consumes: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/sync` (Tasks 4-5).

- [ ] **Step 1: Actualizar el interceptor en `frontend/src/services/api.js`**

Reemplazar el interceptor de request:

```js
api.interceptors.request.use(async (config) => {
  const usuarioActual = auth?.currentUser;
  if (usuarioActual) {
    const token = await usuarioActual.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    const tokenPropio = localStorage.getItem('furboapp_token');
    if (tokenPropio) {
      config.headers.Authorization = `Bearer ${tokenPropio}`;
    }
  }
  return config;
});
```

- [ ] **Step 2: Actualizar `frontend/src/context/AuthContext.jsx`**

Reemplazar el archivo completo:

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import api from '../services/api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'furboapp_token';

export function AuthProvider({ children }) {
  const [usuarioFirebase, setUsuarioFirebase] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAuth, setErrorAuth] = useState('');

  async function intentarRestaurarSesionPropia() {
    const tokenPropio = localStorage.getItem(TOKEN_KEY);
    if (!tokenPropio) {
      setPerfil(null);
      return;
    }
    try {
      const { data } = await api.post('/auth/sync');
      setPerfil(data);
      setErrorAuth('');
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      setPerfil(null);
    }
  }

  useEffect(() => {
    if (!auth) {
      intentarRestaurarSesionPropia().finally(() => setCargando(false));
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (usuario) => {
      setUsuarioFirebase(usuario);
      try {
        if (usuario) {
          const { data } = await api.post('/auth/sync');
          setPerfil(data);
          setErrorAuth('');
        } else {
          await intentarRestaurarSesionPropia();
        }
      } catch (error) {
        setErrorAuth(error.message || 'No se pudo sincronizar el perfil.');
      } finally {
        setCargando(false);
      }
    });
    return unsubscribe;
  }, []);

  async function refrescarPerfil() {
    if (!usuarioFirebase && !localStorage.getItem(TOKEN_KEY)) {
      return;
    }
    try {
      const { data } = await api.post('/auth/sync');
      setPerfil(data);
      setErrorAuth('');
    } catch (error) {
      // No dejamos que un refresco fallido rompa la app; el perfil queda como estaba.
    }
  }

  async function iniciarSesion() {
    if (!auth || !googleProvider) {
      throw new Error('Firebase no está configurado. Completá frontend/.env con tus credenciales.');
    }
    await signInWithPopup(auth, googleProvider);
  }

  async function iniciarSesionConPassword(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setPerfil(data.usuario);
    setErrorAuth('');
  }

  async function registrarse(nombre, email, password) {
    const { data } = await api.post('/auth/register', { nombre, email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setPerfil(data.usuario);
    setErrorAuth('');
  }

  async function cerrarSesion() {
    localStorage.removeItem(TOKEN_KEY);
    if (auth && usuarioFirebase) {
      await signOut(auth);
    } else {
      setUsuarioFirebase(null);
      setPerfil(null);
    }
  }

  const valor = {
    usuarioFirebase,
    perfil,
    cargando,
    errorAuth,
    iniciarSesion,
    iniciarSesionConPassword,
    registrarse,
    cerrarSesion,
    refrescarPerfil,
    esAdmin: perfil?.rol === 'admin',
    estaSancionado: Boolean(perfil?.estaSancionado),
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return contexto;
}
```

- [ ] **Step 3: Verificar manualmente — build**

```bash
cd frontend && npm run build
```

Expected: build sin errores (no hay verificación funcional todavía sin el formulario de la Task 7 — eso se cubre en la Task 8).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.js frontend/src/context/AuthContext.jsx
git commit -m "feat(frontend): soportar sesión por JWT propio en AuthContext y api.js"
```

---

### Task 7: Frontend — formulario de login/registro en `Login.jsx`

**Files:**
- Modify: `frontend/src/pages/Login.jsx`

**Interfaces:**
- Consumes: `useAuth()` → `iniciarSesion`, `iniciarSesionConPassword`, `registrarse` (Task 6).

- [ ] **Step 1: Reescribir `frontend/src/pages/Login.jsx`**

```jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { iniciarSesion, iniciarSesionConPassword, registrarse } = useAuth();
  const [modo, setModo] = useState('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [error, setError] = useState('');

  async function manejarClickIngresar() {
    setError('');
    try {
      await iniciarSesion();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    }
  }

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError('');
    try {
      if (modo === 'registro') {
        if (password !== confirmarPassword) {
          setError('Las contraseñas no coinciden.');
          return;
        }
        await registrarse(nombre, email, password);
      } else {
        await iniciarSesionConPassword(email, password);
      }
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación.');
    }
  }

  function alternarModo() {
    setError('');
    setModo(modo === 'registro' ? 'login' : 'registro');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-pasto-500">FurboApp</h1>
      <p className="text-white/70">Organizá el picado de la semana sin quilombos.</p>

      <button
        onClick={manejarClickIngresar}
        className="rounded-lg bg-albiceleste px-6 py-3 font-semibold text-cancha-900 transition hover:brightness-110"
      >
        Ingresar con Google
      </button>

      <div className="flex w-full max-w-xs items-center gap-3 text-white/40">
        <span className="h-px flex-1 bg-white/20" />
        <span className="text-xs uppercase">o</span>
        <span className="h-px flex-1 bg-white/20" />
      </div>

      <form onSubmit={manejarSubmit} className="flex w-full max-w-xs flex-col gap-3">
        {modo === 'registro' && (
          <input
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
          className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
          required
        />
        {modo === 'registro' && (
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmarPassword}
            onChange={(evento) => setConfirmarPassword(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
            required
          />
        )}
        <button
          type="submit"
          className="rounded-lg bg-pasto-500 px-6 py-2 font-semibold text-cancha-900 transition hover:brightness-110"
        >
          {modo === 'registro' ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>

      <button type="button" onClick={alternarModo} className="text-sm text-white/60 underline">
        {modo === 'registro' ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Registrate'}
      </button>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente — build y lint**

```bash
cd frontend && npm run lint && npm run build
```

Expected: ambos comandos terminan sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Login.jsx
git commit -m "feat(frontend): agregar formulario de login/registro por contraseña"
```

---

### Task 8: Verificación end-to-end en navegador

**Files:** ninguno (solo verificación manual, sin cambios de código).

- [ ] **Step 1: Levantar backend y frontend**

Backend (base descartable):

```bash
cd backend
rm -f /tmp/furboapp-e2e.db
SQLITE_DB_PATH=/tmp/furboapp-e2e.db PORT=4000 ADMIN_EMAILS=admin@test.com node --watch server.js &
```

Frontend (con `frontend/.env` ya configurado con las credenciales de Firebase existentes; si no hay credenciales de Firebase configuradas, el botón de Google simplemente no funcionará, pero el flujo de contraseña no depende de eso):

```bash
cd frontend && npm run dev &
```

- [ ] **Step 2: Verificar el flujo completo con el navegador**

Usar el skill `browser-automation` para:
1. Abrir la app (URL que imprime `npm run dev`, normalmente `http://localhost:5173`).
2. Click en "¿No tenés cuenta? Registrate", completar nombre/email/password/confirmar, enviar.
3. Confirmar que la app queda logueada (deja de mostrar el `Login`, muestra la pantalla principal).
4. Recargar la página y confirmar que la sesión persiste (sigue logueado, no vuelve al `Login`).
5. Cerrar sesión y confirmar que vuelve a la pantalla de `Login`.
6. Volver a ingresar con el mismo email/password (modo login, no registro) y confirmar que loguea correctamente.
7. Revisar la consola del navegador y la pestaña de red por errores no esperados.

Expected: los 6 pasos funcionan sin errores de consola ni de red inesperados.

- [ ] **Step 3: Apagar los servidores y limpiar**

```bash
kill %1 %2
rm -f /tmp/furboapp-e2e.db
```

No hay commit en esta tarea (es solo verificación).
