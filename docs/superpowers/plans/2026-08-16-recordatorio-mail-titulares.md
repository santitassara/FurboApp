# Recordatorio por mail a titulares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an automatic email to every titular of a match 1 hour before it starts, listing their fellow titulares and assigned team.

**Architecture:** A new `recordatoriosService.enviarRecordatoriosPendientes()` queries `Partidos` for matches entering the 55–65 minute window, reuses existing `inscripcionesService.listarTitularesActivos` and `usuariosService.obtenerUsuario` to build recipient lists, and sends mail through a new `mailer.js` wrapper around `nodemailer`. A `setInterval` in `server.js` (same pattern as the existing `cerrarPartidosVencidosSeguro`) drives it every 5 minutes. A new `recordatorioEnviado` flag on `Partidos` makes each match idempotent.

**Tech Stack:** Node.js, Express, better-sqlite3, nodemailer (new dependency), Jest.

**Spec:** `docs/superpowers/specs/2026-08-16-recordatorio-mail-titulares-design.md`

## Global Constraints

- Scheduler is `setInterval` (5 min), not `node-cron` — matches the existing pattern in `server.js`.
- Reminder window: match `fecha` between `now + 55min` and `now + 65min`.
- New column: `Partidos.recordatorioEnviado INTEGER NOT NULL DEFAULT 0`.
- Only `tipo = 'titular' AND estado = 'anotado'` inscripciones receive mail.
- If a match has 0 titulares in the window, send nothing but still mark `recordatorioEnviado = 1`.
- Mail subject: exactly `Tu partido es en 1 hora`.
- Mail must include, when `equipo` is set, a line stating the team (`A` or `B`), the list of fellow titulares' names, and this exact closing line: `Sos titular, no faltes. No te cagués en tus amigos. La pelota no se mancha.`
- SMTP config via env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. If any is missing, `mailer.enviarMail` must no-op (resolve without throwing) and log a warning once.
- A failed individual send must be logged and must not stop sends to other titulares or block marking the match as processed.
- No new HTTP endpoints, no new tables, no retry queue.

---

### Task 1: `recordatorioEnviado` column on `Partidos`

**Files:**
- Modify: `backend/src/db/schema.sql` (add column to the `Partidos` table's `CREATE TABLE IF NOT EXISTS`)
- Modify: `backend/src/config/db.js` (add conditional `ALTER TABLE` migration, same pattern as the existing `posicionPrincipal`/`passwordHash` migrations)
- Test: `backend/tests/config/db.test.js`

**Interfaces:**
- Produces: `Partidos.recordatorioEnviado` column (INTEGER, NOT NULL, DEFAULT 0), readable via `PRAGMA table_info(Partidos)` and via any `SELECT * FROM Partidos`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/config/db.test.js`:

```javascript
  it('crea la columna recordatorioEnviado en Partidos con default 0', () => {
    const columnas = db.prepare('PRAGMA table_info(Partidos)').all();
    const columna = columnas.find((c) => c.name === 'recordatorioEnviado');
    expect(columna).toBeDefined();
    expect(columna.notnull).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/config/db.test.js -v`
Expected: FAIL — `columna` is `undefined`.

- [ ] **Step 3: Add the column to schema.sql**

In `backend/src/db/schema.sql`, inside the `Partidos` table definition, add the column so fresh databases (including test DBs built from `tests/helpers/testDb.js`) get it immediately:

```sql
CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  recordatorioEnviado INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 4: Add the migration to db.js**

In `backend/src/config/db.js`, after the existing `Inscripciones`/`RendimientosJugador` migration block and before `module.exports`, add:

```javascript
const columnasPartidos = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneRecordatorioEnviado = columnasPartidos.some((columna) => columna.name === 'recordatorioEnviado');
if (!tieneRecordatorioEnviado) {
  db.exec('ALTER TABLE Partidos ADD COLUMN recordatorioEnviado INTEGER NOT NULL DEFAULT 0');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/config/db.test.js -v`
Expected: PASS.

- [ ] **Step 6: Run the full test suite to check nothing else broke**

Run: `cd backend && npx jest`
Expected: PASS (all existing suites still green).

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js backend/tests/config/db.test.js
git commit -m "feat(backend): add recordatorioEnviado column to Partidos"
```

---

### Task 2: `mailer.js` — nodemailer wrapper

**Files:**
- Create: `backend/src/utils/mailer.js`
- Test: `backend/tests/utils/mailer.test.js`
- Modify: `backend/package.json` (add `nodemailer` dependency)
- Modify: `backend/.env.example` (document SMTP vars)

**Interfaces:**
- Produces: `async function enviarMail({ to, subject, html })` — resolves after sending, or resolves without sending (and logging a warning once) if SMTP env vars are incomplete. Never throws for missing config; propagates the underlying error if `sendMail` itself rejects (caller is responsible for catching per-recipient failures).

- [ ] **Step 1: Install nodemailer**

Run: `cd backend && npm install nodemailer@^9.0.5`

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/utils/mailer.test.js`:

```javascript
const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));

jest.mock('nodemailer', () => ({
  createTransport: (...args) => createTransportMock(...args),
}));

describe('mailer.enviarMail', () => {
  const ENV_ORIGINAL = process.env;

  beforeEach(() => {
    jest.resetModules();
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    process.env = { ...ENV_ORIGINAL };
  });

  afterAll(() => {
    process.env = ENV_ORIGINAL;
  });

  it('no envía y no lanza si falta configuración SMTP', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const { enviarMail } = require('../../src/utils/mailer');

    await expect(
      enviarMail({ to: 'jugador@mail.com', subject: 'Asunto', html: '<p>Hola</p>' })
    ).resolves.toBeUndefined();

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('envía el mail cuando la configuración SMTP está completa', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'usuario@test.com';
    process.env.SMTP_PASS = 'secreto';
    process.env.MAIL_FROM = 'FurboApp <no-reply@test.com>';
    const { enviarMail } = require('../../src/utils/mailer');

    await enviarMail({ to: 'jugador@mail.com', subject: 'Asunto', html: '<p>Hola</p>' });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      secure: false,
      auth: { user: 'usuario@test.com', pass: 'secreto' },
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'FurboApp <no-reply@test.com>',
      to: 'jugador@mail.com',
      subject: 'Asunto',
      html: '<p>Hola</p>',
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest tests/utils/mailer.test.js -v`
Expected: FAIL — `Cannot find module '../../src/utils/mailer'`.

- [ ] **Step 4: Write the implementation**

Create `backend/src/utils/mailer.js`:

```javascript
const nodemailer = require('nodemailer');

let advertenciaEmitida = false;

function tieneConfigSmtp() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
}

async function enviarMail({ to, subject, html }) {
  if (!tieneConfigSmtp()) {
    if (!advertenciaEmitida) {
      console.warn('SMTP no configurado: los mails de recordatorio no se enviarán');
      advertenciaEmitida = true;
    }
    return;
  }

  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporte.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

module.exports = { enviarMail };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest tests/utils/mailer.test.js -v`
Expected: PASS.

- [ ] **Step 6: Document the new env vars**

Add to `backend/.env.example`:

```
SMTP_HOST=smtp.tuservidor.com
SMTP_PORT=587
SMTP_USER=tuemail@gmail.com
SMTP_PASS=tucontraseña
MAIL_FROM=FurboApp <tuemail@gmail.com>
```

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/utils/mailer.js backend/tests/utils/mailer.test.js backend/.env.example
git commit -m "feat(backend): add mailer util wrapping nodemailer"
```

---

### Task 3: `recordatoriosService.js`

**Files:**
- Create: `backend/src/services/recordatoriosService.js`
- Test: `backend/tests/services/recordatoriosService.test.js`

**Interfaces:**
- Consumes:
  - `inscripcionesService.listarTitularesActivos(partidoId)` → `Promise<Array<{ usuarioId, equipo, ... }>>` (existing, `backend/src/services/inscripcionesService.js:29`)
  - `usuariosService.obtenerUsuario(uid)` → `Promise<{ uid, nombre, email, ... } | null>` (existing, `backend/src/services/usuariosService.js:84`)
  - `mailer.enviarMail({ to, subject, html })` → `Promise<void>` (Task 2)
  - `db` from `../config/db` (existing)
- Produces: `async function enviarRecordatoriosPendientes()` — no return value; reads `Partidos` in the 55–65 min window, sends mail per titular, and marks each processed match's `recordatorioEnviado = 1`. Later tasks (server.js wiring) call this with no arguments.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/recordatoriosService.test.js`:

```javascript
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const enviarMailMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/utils/mailer', () => ({ enviarMail: (...args) => enviarMailMock(...args) }));

const recordatoriosService = require('../../src/services/recordatoriosService');

const AHORA = Date.now();
const EN_UNA_HORA = new Date(AHORA + 60 * 60 * 1000).toISOString();
const EN_TRES_HORAS = new Date(AHORA + 3 * 60 * 60 * 1000).toISOString();
const HACE_UNA_HORA = new Date(AHORA - 60 * 60 * 1000).toISOString();

function insertarUsuario(uid, nombre, email) {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, email);
}

function insertarPartido(id, fecha, recordatorioEnviado = 0) {
  mockDb
    .prepare(
      `INSERT INTO Partidos (id, fecha, estado, creadoPor, cupoTitulares, cupoSuplentes, recordatorioEnviado)
       VALUES (?, ?, 'abierto', 'admin-1', 10, 5, ?)`
    )
    .run(id, fecha, recordatorioEnviado);
}

function insertarInscripcion(id, partidoId, usuarioId, tipo, equipo = null) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
       VALUES (?, ?, ?, 'anotado', ?, 0, '2026-01-01T00:00:00.000Z', ?)`
    )
    .run(id, partidoId, usuarioId, tipo, equipo);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuario('admin-1', 'Admin Uno', 'admin@mail.com');
  enviarMailMock.mockClear();
  enviarMailMock.mockResolvedValue(undefined);
});

describe('recordatoriosService.enviarRecordatoriosPendientes', () => {
  it('envía un mail por titular y marca el partido como procesado', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarUsuario('u2', 'Pedro', 'pedro@mail.com');
    insertarPartido('p1', EN_UNA_HORA);
    insertarInscripcion('i1', 'p1', 'u1', 'titular', 'A');
    insertarInscripcion('i2', 'p1', 'u2', 'titular', 'B');

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(enviarMailMock).toHaveBeenCalledTimes(2);
    expect(enviarMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@mail.com', subject: 'Tu partido es en 1 hora' })
    );
    const htmlJuan = enviarMailMock.mock.calls.find((c) => c[0].to === 'juan@mail.com')[0].html;
    expect(htmlJuan).toContain('Pedro');
    expect(htmlJuan).toContain('equipo A');
    expect(htmlJuan).toContain('Sos titular, no faltes. No te cagués en tus amigos. La pelota no se mancha.');

    const partido = mockDb.prepare('SELECT recordatorioEnviado FROM Partidos WHERE id = ?').get('p1');
    expect(partido.recordatorioEnviado).toBe(1);
  });

  it('no envía nada pero marca el partido si no hay titulares', async () => {
    insertarPartido('p2', EN_UNA_HORA);

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(enviarMailMock).not.toHaveBeenCalled();
    const partido = mockDb.prepare('SELECT recordatorioEnviado FROM Partidos WHERE id = ?').get('p2');
    expect(partido.recordatorioEnviado).toBe(1);
  });

  it('ignora partidos ya marcados como procesados', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarPartido('p3', EN_UNA_HORA, 1);
    insertarInscripcion('i1', 'p3', 'u1', 'titular');

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(enviarMailMock).not.toHaveBeenCalled();
  });

  it('ignora partidos fuera de la ventana de 1 hora', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarPartido('p4', EN_TRES_HORAS);
    insertarPartido('p5', HACE_UNA_HORA);
    insertarInscripcion('i1', 'p4', 'u1', 'titular');
    insertarInscripcion('i2', 'p5', 'u1', 'titular');

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(enviarMailMock).not.toHaveBeenCalled();
  });

  it('sigue enviando a los demás titulares si un envío individual falla', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarUsuario('u2', 'Pedro', 'pedro@mail.com');
    insertarPartido('p6', EN_UNA_HORA);
    insertarInscripcion('i1', 'p6', 'u1', 'titular');
    insertarInscripcion('i2', 'p6', 'u2', 'titular');
    enviarMailMock.mockImplementation(({ to }) => {
      if (to === 'juan@mail.com') return Promise.reject(new Error('SMTP caído'));
      return Promise.resolve();
    });

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(enviarMailMock).toHaveBeenCalledTimes(2);
    const partido = mockDb.prepare('SELECT recordatorioEnviado FROM Partidos WHERE id = ?').get('p6');
    expect(partido.recordatorioEnviado).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/services/recordatoriosService.test.js -v`
Expected: FAIL — `Cannot find module '../../src/services/recordatoriosService'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/recordatoriosService.js`:

```javascript
const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const inscripcionesService = require('./inscripcionesService');
const { enviarMail } = require('../utils/mailer');

const VENTANA_MIN_MS = 55 * 60 * 1000;
const VENTANA_MAX_MS = 65 * 60 * 1000;

function partidosPendientesDeRecordatorio() {
  const ahora = Date.now();
  const desde = new Date(ahora + VENTANA_MIN_MS).toISOString();
  const hasta = new Date(ahora + VENTANA_MAX_MS).toISOString();
  return db
    .prepare('SELECT * FROM Partidos WHERE recordatorioEnviado = 0 AND fecha >= ? AND fecha <= ?')
    .all(desde, hasta);
}

function marcarRecordatorioEnviado(partidoId) {
  db.prepare('UPDATE Partidos SET recordatorioEnviado = 1 WHERE id = ?').run(partidoId);
}

function formatearFechaHora(fechaIso) {
  return new Date(fechaIso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function armarHtml({ fechaTexto, equipo, companeros }) {
  const lineaEquipo = equipo ? `<p>Vos pertenecés al equipo ${equipo}.</p>` : '';
  const lineaCompaneros = companeros.length ? `<p>Titulares: ${companeros.join(', ')}</p>` : '';
  return [
    `<p>Tu partido es el ${fechaTexto}.</p>`,
    lineaEquipo,
    lineaCompaneros,
    '<p>Sos titular, no faltes. No te cagués en tus amigos. La pelota no se mancha.</p>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function enviarRecordatoriosDePartido(partido) {
  const inscripcionesTitulares = await inscripcionesService.listarTitularesActivos(partido.id);
  if (inscripcionesTitulares.length === 0) {
    marcarRecordatorioEnviado(partido.id);
    return;
  }

  const titulares = await Promise.all(
    inscripcionesTitulares.map(async (inscripcion) => ({
      usuario: await usuariosService.obtenerUsuario(inscripcion.usuarioId),
      equipo: inscripcion.equipo,
    }))
  );

  const fechaTexto = formatearFechaHora(partido.fecha);

  for (const titular of titulares) {
    if (!titular.usuario) continue;
    const companeros = titulares
      .filter((otro) => otro.usuario && otro.usuario.uid !== titular.usuario.uid)
      .map((otro) => otro.usuario.nombre);

    try {
      await enviarMail({
        to: titular.usuario.email,
        subject: 'Tu partido es en 1 hora',
        html: armarHtml({ fechaTexto, equipo: titular.equipo, companeros }),
      });
    } catch (error) {
      console.error(`Error enviando recordatorio a ${titular.usuario.email}:`, error);
    }
  }

  marcarRecordatorioEnviado(partido.id);
}

async function enviarRecordatoriosPendientes() {
  const partidos = partidosPendientesDeRecordatorio();
  for (const partido of partidos) {
    await enviarRecordatoriosDePartido(partido);
  }
}

module.exports = { enviarRecordatoriosPendientes };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/services/recordatoriosService.test.js -v`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/recordatoriosService.js backend/tests/services/recordatoriosService.test.js
git commit -m "feat(backend): send reminder emails to titulares 1h before match"
```

---

### Task 4: Wire the interval in `server.js`

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `recordatoriosService.enviarRecordatoriosPendientes()` (Task 3).

- [ ] **Step 1: Modify server.js**

In `backend/server.js`, add the require, the wrapped call, and the interval, following the exact pattern already used for `cerrarPartidosVencidosSeguro`:

```javascript
require('dotenv').config();
const app = require('./src/app');
const partidosService = require('./src/services/partidosService');
const recordatoriosService = require('./src/services/recordatoriosService');

const PORT = process.env.PORT || 4000;
const INTERVALO_CIERRE_MS = 60_000;
const INTERVALO_RECORDATORIOS_MS = 5 * 60_000;

function cerrarPartidosVencidosSeguro() {
  try {
    partidosService.cerrarPartidosVencidos();
  } catch (error) {
    console.error('Error cerrando partidos vencidos:', error);
  }
}

async function enviarRecordatoriosSeguro() {
  try {
    await recordatoriosService.enviarRecordatoriosPendientes();
  } catch (error) {
    console.error('Error enviando recordatorios de partido:', error);
  }
}

cerrarPartidosVencidosSeguro();
setInterval(cerrarPartidosVencidosSeguro, INTERVALO_CIERRE_MS);

enviarRecordatoriosSeguro();
setInterval(enviarRecordatoriosSeguro, INTERVALO_RECORDATORIOS_MS);

app.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
```

- [ ] **Step 2: Manually verify the server still boots**

Run: `cd backend && node -e "require('./server.js')"` (kill it after ~2s with Ctrl+C, or run `timeout 3 node server.js` on a machine that has `timeout`)
Expected: logs `FurboApp backend escuchando en el puerto ...` with no thrown errors, and if `.env` lacks SMTP vars, a single `SMTP no configurado...` warning (not a crash).

- [ ] **Step 3: Run the full test suite one last time**

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): schedule reminder email job every 5 minutes"
```
