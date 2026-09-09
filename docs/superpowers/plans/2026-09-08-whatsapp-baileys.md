# Notificaciones por WhatsApp (Baileys) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un canal de notificación por WhatsApp (vía Baileys) que manda mensajes a un grupo de WhatsApp vinculado a cada Grupo de FurboApp, reusando los triggers de notificación existentes (salvo perdón de sanción) más dos recordatorios diarios nuevos.

**Architecture:** Socket Baileys único y global (`backend/src/config/whatsapp.js`) inicializado al boot del server, con auth persistida en disco. Un servicio nuevo (`whatsappNotificacionesService.js`) arma los textos y decide el envío por Grupo (solo si tiene `whatsappGrupoJid` configurado); se hookea al lado de cada llamada existente a `notificacionesService` en los mismos archivos/líneas. Dos cron jobs nuevos en `scheduler.js` cubren los recordatorios diarios recurrentes, con dedupe por día en una tabla nueva.

**Tech Stack:** Node.js, Express, better-sqlite3, `@whiskeysockets/baileys` ^6.17.16, `qrcode-terminal`, `node-cron` (ya en el stack).

**Spec:** `docs/superpowers/specs/2026-09-08-whatsapp-baileys-design.md`

## Global Constraints

- Sin tests automatizados (decisión explícita del usuario) — verificación manual en cada tarea.
- Sin pantalla frontend para vincular el JID — se configura vía API directa (curl/Postman).
- El trigger de perdón de sanción NO manda WhatsApp — queda excluido, no se toca `gruposService.perdonarSancion`.
- `@whiskeysockets/baileys` pineado en `^6.17.16` (última versión estable, no RC).
- Auth de Baileys persistida en `backend/data/whatsapp_auth/`, agregada a `backend/.gitignore`.
- Todo formateo de fecha/hora en timezone `America/Argentina/Buenos_Aires`.
- Cron jobs nuevos con `{ timezone: 'America/Argentina/Buenos_Aires' }` explícito (no depender de la timezone del host).
- Si `Grupos.whatsappGrupoJid` es `NULL`, cualquier función de envío de WhatsApp debe skippear en silencio (sin log), es el caso normal.

---

### Task 1: Dependencias, gitignore y config de entorno

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/.gitignore`

**Interfaces:**
- Produces: dependencias `@whiskeysockets/baileys` y `qrcode-terminal` instaladas y disponibles para los próximos tasks.

- [ ] **Step 1: Instalar las dependencias**

Run: `cd "backend" && npm install @whiskeysockets/baileys@^6.17.16 qrcode-terminal@^0.12.0`

- [ ] **Step 2: Verificar que quedaron en package.json**

Run: `grep -n "baileys\|qrcode-terminal" backend/package.json`
Expected: dos líneas, una por cada dependencia, dentro de `"dependencies"`.

- [ ] **Step 3: Agregar la carpeta de auth de WhatsApp al gitignore**

En `backend/.gitignore`, agregar esta línea al final del archivo:

```
data/whatsapp_auth/
```

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.gitignore
git commit -m "chore: agregar dependencias de Baileys para WhatsApp"
```

---

### Task 2: Modelo de datos — columna en Grupos y tabla de dedupe

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js`

**Interfaces:**
- Produces: columna `Grupos.whatsappGrupoJid` (TEXT, nullable) y tabla `WhatsappRecordatoriosDiarios(id, partidoId, tipo, fecha)` con unique index `(partidoId, tipo, fecha)`.

- [ ] **Step 1: Agregar la tabla nueva a schema.sql**

En `backend/src/db/schema.sql`, justo después del bloque `CREATE UNIQUE INDEX IF NOT EXISTS idx_recordatorios_votacion_unico ON RecordatoriosVotacionEnviados (...)` (línea ~160), agregar:

```sql
CREATE TABLE IF NOT EXISTS WhatsappRecordatoriosDiarios (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  tipo TEXT NOT NULL,
  fecha TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_recordatorio_diario_unico
  ON WhatsappRecordatoriosDiarios (partidoId, tipo, fecha);
```

- [ ] **Step 2: Agregar el ALTER TABLE de Grupos en db.js**

En `backend/src/config/db.js`, justo antes de la línea `module.exports = { db };` (al final del archivo), agregar:

```js
const columnasGrupos = db.prepare('PRAGMA table_info(Grupos)').all();
const tieneWhatsappGrupoJid = columnasGrupos.some((columna) => columna.name === 'whatsappGrupoJid');
if (!tieneWhatsappGrupoJid) {
  db.exec('ALTER TABLE Grupos ADD COLUMN whatsappGrupoJid TEXT');
}
```

- [ ] **Step 3: Verificar la migración corriendo el server contra una DB de prueba**

Run: `cd backend && SQLITE_DB_PATH=:memory: node -e "require('./src/config/db'); console.log('ok migración')"`
Expected: imprime `ok migración` sin errores.

Run: `cd backend && SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
console.log(db.prepare('PRAGMA table_info(Grupos)').all().some(c => c.name === 'whatsappGrupoJid'));
console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='WhatsappRecordatoriosDiarios'\").get());
"`
Expected: imprime `true` y la fila `{ name: 'WhatsappRecordatoriosDiarios' }`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js
git commit -m "feat(db): agregar columna whatsappGrupoJid y tabla de dedupe diario"
```

---

### Task 3: Módulo Baileys — ciclo de vida del socket

**Files:**
- Create: `backend/src/config/whatsapp.js`

**Interfaces:**
- Consumes: `@whiskeysockets/baileys` (`makeWASocket`, `useMultiFileAuthState`, `DisconnectReason`), `qrcode-terminal`.
- Produces:
  - `async function iniciarWhatsapp(): Promise<void>`
  - `function obtenerEstadoConexion(): 'conectado' | 'desconectado'`
  - `async function enviarMensajeGrupo(jid: string, texto: string): Promise<void>`
  - `async function listarGruposDisponibles(): Promise<Array<{ jid: string, nombre: string }>>`

- [ ] **Step 1: Crear el archivo**

```js
const path = require('node:path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

let socket = null;
let conectado = false;

function resolverAuthDir() {
  const configurado = process.env.WHATSAPP_AUTH_DIR;
  if (!configurado) return path.join(__dirname, '../../data/whatsapp_auth');
  return path.resolve(__dirname, '../..', configurado);
}

async function iniciarWhatsapp() {
  const { state, saveCreds } = await useMultiFileAuthState(resolverAuthDir());

  socket = makeWASocket({ auth: state });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (actualizacion) => {
    const { connection, lastDisconnect, qr } = actualizacion;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      conectado = true;
      console.log('WhatsApp conectado');
    }

    if (connection === 'close') {
      conectado = false;
      const motivo = lastDisconnect?.error?.output?.statusCode;
      console.warn('WhatsApp desconectado, código:', motivo);
      if (motivo !== DisconnectReason.loggedOut) {
        iniciarWhatsapp().catch((error) => console.error('Error reconectando WhatsApp:', error.message));
      } else {
        console.error('WhatsApp deslogueado. Borrá backend/data/whatsapp_auth y volvé a escanear el QR.');
      }
    }
  });
}

function obtenerEstadoConexion() {
  return conectado ? 'conectado' : 'desconectado';
}

async function enviarMensajeGrupo(jid, texto) {
  if (!socket || !conectado) {
    console.warn(`WhatsApp desconectado, no se pudo enviar mensaje a ${jid}`);
    return;
  }
  try {
    const metadata = await socket.groupMetadata(jid);
    const mentions = metadata.participants.map((participante) => participante.id);
    await socket.sendMessage(jid, { text: texto, mentions });
  } catch (error) {
    console.error(`Error enviando mensaje de WhatsApp a ${jid}:`, error.message);
  }
}

async function listarGruposDisponibles() {
  if (!socket || !conectado) return [];
  const grupos = await socket.groupFetchAllParticipating();
  return Object.values(grupos).map((grupo) => ({ jid: grupo.id, nombre: grupo.subject }));
}

module.exports = { iniciarWhatsapp, obtenerEstadoConexion, enviarMensajeGrupo, listarGruposDisponibles };
```

- [ ] **Step 2: Verificar que el módulo carga y expone las 4 funciones**

Run: `cd backend && node -e "
const w = require('./src/config/whatsapp');
console.log(Object.keys(w));
console.log(w.obtenerEstadoConexion());
"`
Expected: imprime `[ 'iniciarWhatsapp', 'obtenerEstadoConexion', 'enviarMensajeGrupo', 'listarGruposDisponibles' ]` y luego `desconectado` (todavía no se llamó `iniciarWhatsapp`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/whatsapp.js
git commit -m "feat: agregar módulo de ciclo de vida del socket de Baileys"
```

---

### Task 4: Arrancar WhatsApp al boot del server

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `iniciarWhatsapp()` de Task 3.

- [ ] **Step 1: Agregar el require y la llamada de arranque**

En `backend/server.js`, agregar el require junto a los demás (después de la línea `const { iniciarScheduler } = require('./src/config/scheduler');`):

```js
const whatsappConfig = require('./src/config/whatsapp');
```

Y agregar la llamada de arranque junto a `mailer.verificarConfigSmtp();` (antes de crear el servidor HTTP):

```js
whatsappConfig.iniciarWhatsapp().catch((error) => {
  console.error('Error iniciando WhatsApp:', error.message);
});
```

- [ ] **Step 2: Verificar que el server sigue arrancando sin romperse**

Run: `cd backend && SQLITE_DB_PATH=:memory: timeout 5 node server.js; echo "exit code: $?"`
Expected: en la salida aparece `FurboApp backend escuchando en el puerto 4000` y (al no haber sesión guardada) se imprime un QR en la terminal. El proceso termina por el `timeout` (exit code 124), no por un crash.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat: iniciar el socket de WhatsApp al arrancar el server"
```

---

### Task 5: Servicio de negocio — triggers inmediatos (nuevo partido, votación abierta/cerrada)

**Files:**
- Create: `backend/src/services/whatsappNotificacionesService.js`

**Interfaces:**
- Consumes: `db` de `../config/db`, `enviarMensajeGrupo` de `../config/whatsapp`.
- Produces:
  - `async function enviarWhatsappNuevoPartido(partidoId: string): Promise<void>`
  - `async function enviarWhatsappVotacionAbierta(partidoId: string): Promise<void>`
  - `async function enviarWhatsappVotacionCerrada(partidoId: string): Promise<void>`
  - (internas, no exportadas) `obtenerPartidoConGrupo`, `fechaLocalYMD`, `formatearDiaYHora`, `yaEnviadoHoy`, `marcarEnviadoHoy`, `textoAnotate` — estas últimas dos las usa también Task 7.

- [ ] **Step 1: Crear el archivo con los helpers y los 3 triggers inmediatos**

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');
const whatsapp = require('../config/whatsapp');

const ZONA = 'America/Argentina/Buenos_Aires';

function fechaLocalYMD(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('en-CA', { timeZone: ZONA });
}

function formatearDiaYHora(fechaIso) {
  const fecha = new Date(fechaIso);
  const dia = fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: ZONA,
  });
  const hora = fecha.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });
  return { dia, hora };
}

function obtenerPartidoConGrupo(partidoId) {
  return db
    .prepare(
      `SELECT p.*, g.nombre AS nombreGrupo, g.whatsappGrupoJid
       FROM Partidos p JOIN Grupos g ON g.id = p.grupoId
       WHERE p.id = ?`
    )
    .get(partidoId);
}

function yaEnviadoHoy(partidoId, tipo) {
  const hoy = fechaLocalYMD(new Date().toISOString());
  return Boolean(
    db
      .prepare('SELECT id FROM WhatsappRecordatoriosDiarios WHERE partidoId = ? AND tipo = ? AND fecha = ?')
      .get(partidoId, tipo, hoy)
  );
}

function marcarEnviadoHoy(partidoId, tipo) {
  const hoy = fechaLocalYMD(new Date().toISOString());
  db.prepare('INSERT OR IGNORE INTO WhatsappRecordatoriosDiarios (id, partidoId, tipo, fecha) VALUES (?, ?, ?, ?)').run(
    crypto.randomUUID(),
    partidoId,
    tipo,
    hoy
  );
}

function textoAnotate(partido) {
  const { dia, hora } = formatearDiaYHora(partido.fecha);
  return `@todos Hay partido el dia ${dia} a las ${hora} ANOTATE!!`;
}

async function enviarWhatsappNuevoPartido(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, textoAnotate(partido));
  marcarEnviadoHoy(partidoId, 'anotate');
}

async function enviarWhatsappVotacionAbierta(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const { dia, hora } = formatearDiaYHora(partido.fecha);
  const texto = `@todos Ya podés votar los equipos posibles para el partido del grupo "${partido.nombreGrupo}", ${dia} ${hora}`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

async function enviarWhatsappVotacionCerrada(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const { dia, hora } = formatearDiaYHora(partido.fecha);
  const texto = `@todos Se cerró la votación de equipos del partido de tu grupo "${partido.nombreGrupo}", ${dia} ${hora}. Mirá en qué equipo quedaste`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

module.exports = {
  enviarWhatsappNuevoPartido,
  enviarWhatsappVotacionAbierta,
  enviarWhatsappVotacionCerrada,
};
```

> Nota: la Task 7 agrega más funciones a este mismo archivo y reemplaza este `module.exports` por uno que incluye las 8 funciones. Este export de 3 funciones ya es completo y usable tal cual para lo que hookea la Task 6.

- [ ] **Step 2: Verificar que el módulo carga y que `whatsappGrupoJid` nulo skippea en silencio**

Run: `cd backend && SQLITE_DB_PATH=:memory: node -e "
const crypto = require('node:crypto');
const { db } = require('./src/config/db');
const s = require('./src/services/whatsappNotificacionesService');

const uid = crypto.randomUUID();
db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?, ?, ?, ?)').run(uid, 'Admin', 'a@a.com', new Date().toISOString());
const grupoId = crypto.randomUUID();
db.prepare('INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion) VALUES (?, ?, ?, ?, ?)').run(grupoId, 'G1', 'COD1', uid, new Date().toISOString());
const partidoId = crypto.randomUUID();
db.prepare('INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(partidoId, new Date(Date.now()+86400000).toISOString(), 'abierto', uid, grupoId, 10, 2);

s.enviarWhatsappNuevoPartido(partidoId).then(() => console.log('ok, no crashea sin JID configurado'));
"`
Expected: imprime `ok, no crashea sin JID configurado` sin lanzar excepción (el Grupo no tiene `whatsappGrupoJid`, así que no intenta mandar nada).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/whatsappNotificacionesService.js
git commit -m "feat: agregar triggers inmediatos de WhatsApp (nuevo partido, votacion abierta/cerrada)"
```

---

### Task 6: Hookear los triggers inmediatos en los services existentes

**Files:**
- Modify: `backend/src/services/partidosService.js:1-46`
- Modify: `backend/src/services/formacionesPropuestasService.js:1-75,153-172`

**Interfaces:**
- Consumes: `enviarWhatsappNuevoPartido`, `enviarWhatsappVotacionAbierta`, `enviarWhatsappVotacionCerrada` de Task 5.

- [ ] **Step 1: Hookear "nuevo partido" en partidosService.js**

Agregar el require junto al de `notificacionesService` (línea 3):

```js
const whatsappNotificacionesService = require('./whatsappNotificacionesService');
```

Y justo después del bloque existente (línea 44-46):

```js
  notificacionesService.enviarNotificacionNuevoPartido(nuevoPartido.id).catch((error) => {
    console.error('Error enviando notificación de nuevo partido:', error.message);
  });

  whatsappNotificacionesService.enviarWhatsappNuevoPartido(nuevoPartido.id).catch((error) => {
    console.error('Error enviando WhatsApp de nuevo partido:', error.message);
  });
```

- [ ] **Step 2: Hookear "votación abierta" y "votación cerrada" en formacionesPropuestasService.js**

Agregar el require junto al de `notificacionesService` (línea 5):

```js
const whatsappNotificacionesService = require('./whatsappNotificacionesService');
```

Dentro de `crearPropuesta`, junto al bloque `if (numero === 5) { notificacionesService.enviarNotificacionVotacionAbierta(...) }` (línea 70-74):

```js
  if (numero === 5) {
    notificacionesService.enviarNotificacionVotacionAbierta(partidoId).catch((error) => {
      console.error('Error enviando notificación de votación abierta:', error.message);
    });
    whatsappNotificacionesService.enviarWhatsappVotacionAbierta(partidoId).catch((error) => {
      console.error('Error enviando WhatsApp de votación abierta:', error.message);
    });
  }
```

Dentro de `aplicarGanadora`, junto al bloque existente (línea 169-171):

```js
  notificacionesService.enviarNotificacionVotacionCerrada(partidoId).catch((error) => {
    console.error('Error enviando notificación de votación cerrada:', error.message);
  });
  whatsappNotificacionesService.enviarWhatsappVotacionCerrada(partidoId).catch((error) => {
    console.error('Error enviando WhatsApp de votación cerrada:', error.message);
  });
```

- [ ] **Step 3: Verificar que ambos archivos siguen cargando sin errores de sintaxis**

Run: `cd backend && node -e "require('./src/services/partidosService'); require('./src/services/formacionesPropuestasService'); console.log('ok requires')"`
Expected: imprime `ok requires`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/partidosService.js backend/src/services/formacionesPropuestasService.js
git commit -m "feat: hookear WhatsApp en triggers de nuevo partido y votacion abierta/cerrada"
```

---

### Task 7: Servicio de negocio — recordatorio partido, post-partido, recordatorios de votación y crons diarios

**Files:**
- Modify: `backend/src/services/whatsappNotificacionesService.js`

**Interfaces:**
- Consumes: helpers internos de Task 5 (`obtenerPartidoConGrupo`, `formatearDiaYHora`, `fechaLocalYMD`, `yaEnviadoHoy`, `marcarEnviadoHoy`, `textoAnotate`).
- Produces:
  - `async function enviarWhatsappRecordatorioPartido(partidoId: string): Promise<void>`
  - `async function enviarWhatsappRecordatoriosVotacion(partidoId: string, ventana: number): Promise<void>`
  - `async function enviarWhatsappPostPartido(partidoId: string): Promise<void>`
  - `async function enviarWhatsappRecordatoriosDiariosAnotate(): Promise<void>`
  - `async function enviarWhatsappRecordatoriosDiariosPostPartido(): Promise<void>`

- [ ] **Step 1: Agregar las 5 funciones y reemplazar el `module.exports`**

Agregar antes del `module.exports` de `backend/src/services/whatsappNotificacionesService.js`:

```js
function contarTitulares(partidoId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`
    )
    .get(partidoId).total;
}

async function enviarWhatsappRecordatorioPartido(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const texto = `@todos Sos titular en el partido del grupo ${partido.nombreGrupo}. No seas Pancho/García y llega a horario`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

async function enviarWhatsappRecordatoriosVotacion(partidoId, ventana) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const texto = `@todos Todavía no votaste - faltan ${ventana}hs. Acordate de votar tu formación, después no hay quejas por los equipos`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

async function enviarWhatsappPostPartido(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  await whatsapp.enviarMensajeGrupo(
    partido.whatsappGrupoJid,
    '@todos Valoren la actuacion de los participantes del partido'
  );
  marcarEnviadoHoy(partidoId, 'post_partido');
}

async function enviarWhatsappRecordatoriosDiariosAnotate() {
  const hoy = fechaLocalYMD(new Date().toISOString());

  const partidos = db
    .prepare(
      `SELECT p.*, g.nombre AS nombreGrupo, g.whatsappGrupoJid
       FROM Partidos p JOIN Grupos g ON g.id = p.grupoId
       WHERE p.estado = 'abierto' AND g.whatsappGrupoJid IS NOT NULL`
    )
    .all();

  for (const partido of partidos) {
    const diaPartido = fechaLocalYMD(partido.fecha);
    if (diaPartido <= hoy) continue;
    if (contarTitulares(partido.id) >= partido.cupoTitulares) continue;
    if (yaEnviadoHoy(partido.id, 'anotate')) continue;

    await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, textoAnotate(partido));
    marcarEnviadoHoy(partido.id, 'anotate');
  }
}

async function enviarWhatsappRecordatoriosDiariosPostPartido() {
  const partidos = db
    .prepare(
      `SELECT p.*, g.whatsappGrupoJid
       FROM Partidos p JOIN Grupos g ON g.id = p.grupoId
       WHERE p.estado = 'jugado' AND p.votacionEquiposCerrada = 0 AND g.whatsappGrupoJid IS NOT NULL`
    )
    .all();

  for (const partido of partidos) {
    if (yaEnviadoHoy(partido.id, 'post_partido')) continue;

    await whatsapp.enviarMensajeGrupo(
      partido.whatsappGrupoJid,
      '@todos Valoren la actuacion de los participantes del partido'
    );
    marcarEnviadoHoy(partido.id, 'post_partido');
  }
}
```

Reemplazar el `module.exports` (el placeholder de Task 5) por:

```js
module.exports = {
  enviarWhatsappNuevoPartido,
  enviarWhatsappVotacionAbierta,
  enviarWhatsappVotacionCerrada,
  enviarWhatsappRecordatorioPartido,
  enviarWhatsappRecordatoriosVotacion,
  enviarWhatsappPostPartido,
  enviarWhatsappRecordatoriosDiariosAnotate,
  enviarWhatsappRecordatoriosDiariosPostPartido,
};
```

- [ ] **Step 2: Verificar la condición de cupo lleno y el dedupe diario**

Run: `cd backend && SQLITE_DB_PATH=:memory: node -e "
const crypto = require('node:crypto');
const { db } = require('./src/config/db');
const s = require('./src/services/whatsappNotificacionesService');

const uid = crypto.randomUUID();
db.prepare('INSERT INTO Usuarios (uid, nombre, email, fechaCreacion) VALUES (?, ?, ?, ?)').run(uid, 'Admin', 'a@a.com', new Date().toISOString());
const grupoId = crypto.randomUUID();
db.prepare('INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion, whatsappGrupoJid) VALUES (?, ?, ?, ?, ?, ?)').run(grupoId, 'G1', 'COD1', uid, new Date().toISOString(), '123@g.us');
const partidoId = crypto.randomUUID();
const fechaFutura = new Date(Date.now() + 5*86400000).toISOString();
db.prepare('INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(partidoId, fechaFutura, 'abierto', uid, grupoId, 1, 0);
db.prepare('INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), partidoId, uid, 'anotado', 'titular', 1, new Date().toISOString());

s.enviarWhatsappRecordatoriosDiariosAnotate().then(() => {
  const enviados = db.prepare('SELECT * FROM WhatsappRecordatoriosDiarios WHERE partidoId = ?').all(partidoId);
  console.log('registros dedupe (debería ser 0, cupo lleno con 1/1):', enviados.length);
});
"`
Expected: imprime `registros dedupe (debería ser 0, cupo lleno con 1/1): 0` — el cupo (1) ya está lleno con la única inscripción, así que no manda ni deja registro.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/whatsappNotificacionesService.js
git commit -m "feat: agregar recordatorios diarios de WhatsApp y triggers restantes"
```

---

### Task 8: Hookear recordatorio de partido, post-partido y recordatorios de votación en notificacionesService.js

**Files:**
- Modify: `backend/src/services/notificacionesService.js`

**Interfaces:**
- Consumes: `enviarWhatsappRecordatorioPartido`, `enviarWhatsappPostPartido`, `enviarWhatsappRecordatoriosVotacion` de Task 7.

- [ ] **Step 1: Agregar el require**

Al inicio de `backend/src/services/notificacionesService.js` (junto a los otros requires):

```js
const whatsappNotificacionesService = require('./whatsappNotificacionesService');
```

- [ ] **Step 2: Hookear dentro de `enviarNotificacionesPrePartido`**

Dentro del `for (const partido of partidos)` de `enviarNotificacionesPrePartido`, justo antes de la línea `db.prepare('UPDATE Partidos SET recordatorioEnviado = 1 WHERE id = ?').run(partido.id);`, agregar:

```js
    whatsappNotificacionesService.enviarWhatsappRecordatorioPartido(partido.id).catch((error) => {
      console.error('Error enviando WhatsApp de recordatorio de partido:', error.message);
    });

```

- [ ] **Step 3: Hookear dentro de `enviarNotificacionesPostPartido`**

Dentro del `for (const partido of partidos)` de `enviarNotificacionesPostPartido`, justo antes de la línea `db.prepare('UPDATE Partidos SET recordatorioPostPartidoEnviado = 1 WHERE id = ?').run(partido.id);`, agregar:

```js
    whatsappNotificacionesService.enviarWhatsappPostPartido(partido.id).catch((error) => {
      console.error('Error enviando WhatsApp de post-partido:', error.message);
    });

```

- [ ] **Step 4: Hookear dentro de `enviarRecordatoriosVotacion`**

Dentro del `for (const partido of partidos)` de `enviarRecordatoriosVotacion`, justo después de calcular `titularesSinVoto` y antes del `const titulo = ...`, agregar:

```js
      if (titularesSinVoto.length > 0) {
        whatsappNotificacionesService.enviarWhatsappRecordatoriosVotacion(partido.id, ventana).catch((error) => {
          console.error('Error enviando WhatsApp de recordatorio de votación:', error.message);
        });
      }

```

- [ ] **Step 5: Verificar que el archivo sigue cargando sin errores**

Run: `cd backend && node -e "require('./src/services/notificacionesService'); console.log('ok require')"`
Expected: imprime `ok require`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/notificacionesService.js
git commit -m "feat: hookear WhatsApp en recordatorio de partido, post-partido y recordatorios de votacion"
```

---

### Task 9: Cron jobs diarios en el scheduler

**Files:**
- Modify: `backend/src/config/scheduler.js`

**Interfaces:**
- Consumes: `enviarWhatsappRecordatoriosDiariosAnotate`, `enviarWhatsappRecordatoriosDiariosPostPartido` de Task 7.

- [ ] **Step 1: Agregar el require y los dos cron.schedule**

En `backend/src/config/scheduler.js`, agregar el require junto a los otros:

```js
const whatsappNotificacionesService = require('../services/whatsappNotificacionesService');
```

Y dentro de `iniciarScheduler()`, antes del `console.log('Scheduler de notificaciones iniciado');`, agregar:

```js
  cron.schedule(
    '0 13 * * *',
    async () => {
      try {
        await whatsappNotificacionesService.enviarWhatsappRecordatoriosDiariosAnotate();
      } catch (error) {
        console.error('Error en cron WhatsApp diario (anotate):', error.message);
      }
    },
    { timezone: 'America/Argentina/Buenos_Aires' }
  );

  cron.schedule(
    '0 15 * * *',
    async () => {
      try {
        await whatsappNotificacionesService.enviarWhatsappRecordatoriosDiariosPostPartido();
      } catch (error) {
        console.error('Error en cron WhatsApp diario (post-partido):', error.message);
      }
    },
    { timezone: 'America/Argentina/Buenos_Aires' }
  );
```

- [ ] **Step 2: Verificar que el scheduler arranca sin errores**

Run: `cd backend && SQLITE_DB_PATH=:memory: node -e "
const { iniciarScheduler } = require('./src/config/scheduler');
iniciarScheduler();
console.log('ok scheduler');
"`
Expected: imprime `Scheduler de notificaciones iniciado` y luego `ok scheduler`, sin excepciones.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/scheduler.js
git commit -m "feat: agregar cron jobs diarios de WhatsApp (13hs y 15hs)"
```

---

### Task 10: Endpoint para vincular el JID del grupo de WhatsApp a un Grupo

**Files:**
- Modify: `backend/src/services/gruposService.js`
- Modify: `backend/src/controllers/gruposController.js`
- Modify: `backend/src/routes/gruposRoutes.js`

**Interfaces:**
- Produces: `PUT /api/grupos/:grupoId/whatsapp` (requiere rol admin del Grupo), body `{ jid: string }`, responde `{ id, whatsappGrupoJid }`.

- [ ] **Step 1: Agregar `vincularWhatsapp` a gruposService.js**

Agregar antes de `module.exports` en `backend/src/services/gruposService.js`:

```js
async function vincularWhatsapp(grupoId, jid) {
  const grupo = db.prepare('SELECT id FROM Grupos WHERE id = ?').get(grupoId);
  if (!grupo) throw crearError('Grupo no encontrado', 404);

  db.prepare('UPDATE Grupos SET whatsappGrupoJid = ? WHERE id = ?').run(jid, grupoId);
  return { id: grupoId, whatsappGrupoJid: jid };
}
```

Y agregar `vincularWhatsapp` al `module.exports`.

- [ ] **Step 2: Agregar el controlador**

Agregar en `backend/src/controllers/gruposController.js`, antes del `module.exports`:

```js
async function vincularWhatsapp(req, res) {
  const { grupoId } = req.params;
  const { jid } = req.body;
  if (!jid || typeof jid !== 'string') {
    return res.status(400).json({ error: 'jid es obligatorio' });
  }
  const grupo = await gruposService.vincularWhatsapp(grupoId, jid);
  res.json(grupo);
}
```

Y agregar `vincularWhatsapp` al `module.exports`.

- [ ] **Step 3: Agregar la ruta**

En `backend/src/routes/gruposRoutes.js`, agregar el require de `verificarMiembroGrupo` (no está importado en este archivo todavía):

```js
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
```

Y agregar la ruta, junto a las otras rutas de `:grupoId`:

```js
router.put('/:grupoId/whatsapp', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(gruposController.vincularWhatsapp));
```

- [ ] **Step 4: Verificar el endpoint levantando el server y pegándole con curl**

Run: `cd backend && SQLITE_DB_PATH=:memory: PORT=4999 node server.js &`
Run (con un token real de un admin de un grupo existente, o revisar que responda 401 sin token): `curl -s -X PUT http://localhost:4999/api/grupos/algun-id/whatsapp -H "Content-Type: application/json" -d '{"jid":"123@g.us"}'`
Expected: responde `{"error":"Token no provisto"}` (o el mensaje que use `verificarToken`) con status 401, confirmando que la ruta existe y está protegida. Parar el server después: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/gruposService.js backend/src/controllers/gruposController.js backend/src/routes/gruposRoutes.js
git commit -m "feat: agregar endpoint para vincular el grupo de WhatsApp a un Grupo"
```

---

### Task 11: Endpoint para listar los grupos de WhatsApp disponibles

**Files:**
- Create: `backend/src/controllers/whatsappController.js`
- Create: `backend/src/routes/whatsappRoutes.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `listarGruposDisponibles()` de Task 3.
- Produces: `GET /api/whatsapp/grupos-disponibles` (requiere super admin), responde `Array<{ jid, nombre }>`.

- [ ] **Step 1: Crear el controlador**

```js
const whatsappConfig = require('../config/whatsapp');

async function listarGruposDisponibles(req, res) {
  const grupos = await whatsappConfig.listarGruposDisponibles();
  res.json(grupos);
}

module.exports = { listarGruposDisponibles };
```

- [ ] **Step 2: Crear las rutas**

```js
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarSuperAdmin = require('../middlewares/verificarSuperAdmin');
const envolverAsync = require('../utils/envolverAsync');
const whatsappController = require('../controllers/whatsappController');

const router = express.Router();

router.get('/grupos-disponibles', verificarToken, verificarSuperAdmin, envolverAsync(whatsappController.listarGruposDisponibles));

module.exports = router;
```

- [ ] **Step 3: Montar la ruta en app.js**

En `backend/src/app.js`, agregar el require junto a los otros:

```js
const whatsappRoutes = require('./routes/whatsappRoutes');
```

Y montarla junto a las demás (antes de `app.use('/api/seed', seedRoutes);`):

```js
app.use('/api/whatsapp', whatsappRoutes);
```

- [ ] **Step 4: Verificar el endpoint**

Run: `cd backend && SQLITE_DB_PATH=:memory: PORT=4999 node server.js &`
Run: `curl -s http://localhost:4999/api/whatsapp/grupos-disponibles`
Expected: responde 401 (sin token), confirmando que la ruta existe y está protegida. Parar el server: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/whatsappController.js backend/src/routes/whatsappRoutes.js backend/src/app.js
git commit -m "feat: agregar endpoint para listar grupos de WhatsApp disponibles"
```

---

## Configuración manual post-implementación (no automatizable)

1. Arrancar el backend una vez con `npm run dev` (o `npm start`) y escanear el QR que aparece en consola con el número de WhatsApp ya existente.
2. Agregar ese número a los grupos de WhatsApp reales que se quieran usar (paso manual en la app de WhatsApp).
3. Llamar `GET /api/whatsapp/grupos-disponibles` (con token de super admin) para obtener el JID de cada grupo.
4. Llamar `PUT /api/grupos/:grupoId/whatsapp` (con token de admin del Grupo) con `{ "jid": "..." }` para vincular cada Grupo de FurboApp a su grupo de WhatsApp.
