# Programación automática de creación de partidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un admin pueda definir reglas semanales ("los lunes 20:00 creá el partido del viernes 20:00 en Parador 4, cuota $10.000") y que el backend cree esos partidos solo, con la configuración editable desde el panel de admin.

**Architecture:** Tabla nueva `ProgramacionesPartido` con un `proximoDisparo` persistido. El `cron.schedule('* * * * *')` que ya existe en `backend/src/config/scheduler.js` barre las filas vencidas y crea el partido reusando `partidosService.crearPartido`. El cálculo de días de semana y horas se hace en hora de Argentina con `Intl`, sin dependencias nuevas. El frontend agrega un componente de sección al panel de admin.

**Tech Stack:** Node.js + Express, better-sqlite3, node-cron (ya instalados). React + Vite + TailwindCSS en el frontend. Sin librerías nuevas.

**Spec:** `docs/superpowers/specs/2026-09-20-programacion-partidos-design.md`

## Global Constraints

- Sin dependencias nuevas en `backend/package.json` ni en `frontend/package.json`.
- Zona horaria fija: `America/Argentina/Buenos_Aires`, igual que el resto del backend.
- Fechas persistidas en ISO 8601 UTC (`Date.prototype.toISOString()`), como el resto del esquema.
- Día de semana: entero 0 a 6, con 0 = domingo, igual que `Date.prototype.getDay()`.
- Horas de configuración: string `'HH:MM'` en 24 horas, hora de Argentina.
- Errores de validación: `error.status = 400` y mensaje en castellano, patrón de `partidosService.js`.
- Rutas de admin: `verificarToken` + `verificarMiembroGrupo('admin')` + `envolverAsync`.
- **Sin tests automatizados.** Es una preferencia explícita del usuario para este proyecto. Cada tarea cierra con una verificación manual concreta en vez de un ciclo TDD.
- Comentarios y nombres de variables en castellano, como el resto del código.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `backend/src/db/schema.sql` (modificar) | Definición de la tabla `ProgramacionesPartido` y su índice. |
| `backend/src/utils/programacionFechas.js` (crear) | Aritmética de fechas en hora de Argentina. Funciones puras, sin acceso a base de datos. |
| `backend/src/services/programacionesService.js` (crear) | CRUD de programaciones, validaciones y el barrido que crea los partidos. |
| `backend/src/controllers/programacionesController.js` (crear) | Parseo del request y delegación al servicio. |
| `backend/src/routes/programacionesRoutes.js` (crear) | Rutas REST anidadas bajo el grupo. |
| `backend/src/app.js` (modificar) | Montaje del router nuevo. |
| `backend/src/config/scheduler.js` (modificar) | Enganche del barrido al cron por minuto y corrida al arrancar. |
| `frontend/src/components/ProgramacionPartidos.jsx` (crear) | Sección completa de UI: lista, alta, edición, pausa y borrado. |
| `frontend/src/pages/AdminPanel.jsx` (modificar) | Renderiza el componente como una sección más. |

`programacionFechas.js` va separado del servicio a propósito: es la parte con más lógica sutil y la única que conviene poder probar a mano en un REPL sin tocar la base.

---

### Task 1: Tabla `ProgramacionesPartido`

**Files:**
- Modify: `backend/src/db/schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `ProgramacionesPartido` con las columnas listadas abajo, e índice `idx_programaciones_disparo`.

- [ ] **Step 1: Agregar la tabla al final de `backend/src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS ProgramacionesPartido (
  id TEXT PRIMARY KEY,
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  nombre TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  diaSemanaDisparo INTEGER NOT NULL,
  horaDisparo TEXT NOT NULL,
  diaSemanaPartido INTEGER NOT NULL,
  horaPartido TEXT NOT NULL,
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  estadio TEXT,
  tipoSuelo TEXT,
  direccion TEXT,
  valorCuota INTEGER,
  proximoDisparo TEXT NOT NULL,
  ultimoDisparo TEXT,
  ultimoPartidoId TEXT REFERENCES Partidos(id),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_programaciones_disparo
  ON ProgramacionesPartido (activa, proximoDisparo);
```

No hace falta el patrón de `ALTER TABLE` condicional de `db.js`: es una tabla nueva y `db.js` ya ejecuta `schema.sql` completo en cada arranque, así que `CREATE TABLE IF NOT EXISTS` la crea sola en bases existentes.

- [ ] **Step 2: Verificar que la tabla se crea**

```bash
cd backend && node -e "require('./src/config/db'); const { db } = require('./src/config/db'); console.log(db.prepare('PRAGMA table_info(ProgramacionesPartido)').all().map(c => c.name).join(', '));"
```

Esperado: imprime las 19 columnas, empezando por `id, grupoId, nombre, activa, ...`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.sql
git commit -m "feat(back) tabla ProgramacionesPartido"
```

---

### Task 2: Aritmética de fechas en hora de Argentina

**Files:**
- Create: `backend/src/utils/programacionFechas.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ZONA: string`
  - `calcularProximoDisparo(programacion, desde: Date): Date` — próxima ocurrencia de `diaSemanaDisparo` a `horaDisparo`, estrictamente posterior a `desde`.
  - `calcularUltimoDisparo(programacion, hasta: Date): Date` — ocurrencia más reciente de `diaSemanaDisparo` a `horaDisparo` en o antes de `hasta`.
  - `calcularFechaPartido(programacion, momentoDisparo: Date): Date` — primera ocurrencia de `diaSemanaPartido` a `horaPartido` posterior a `momentoDisparo`; si el día de semana del partido coincide con el del disparo, la de 7 días después.
  - `formatearHoraArgentina(fecha: Date): string`

  En los tres casos `programacion` es un objeto con al menos `{ diaSemanaDisparo, horaDisparo, diaSemanaPartido, horaPartido }`.

- [ ] **Step 1: Crear `backend/src/utils/programacionFechas.js`**

```js
const ZONA = 'America/Argentina/Buenos_Aires';

const DIAS_CORTOS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// El offset se resuelve por fecha en vez de hardcodear -03:00: si Argentina
// vuelve a usar horario de verano, los cálculos siguen siendo correctos.
function offsetZonaMinutos(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    timeZoneName: 'longOffset',
  }).formatToParts(fecha);
  const nombreZona = partes.find((parte) => parte.type === 'timeZoneName')?.value ?? '';
  const coincidencia = /GMT([+-])(\d{2}):(\d{2})/.exec(nombreZona);
  if (!coincidencia) return 0;
  const signo = coincidencia[1] === '-' ? -1 : 1;
  return signo * (Number(coincidencia[2]) * 60 + Number(coincidencia[3]));
}

function partesLocales(fecha) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo) => Number(partes.find((parte) => parte.type === tipo).value);
  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    horas: valor('hour'),
    minutos: valor('minute'),
  };
}

function diaSemanaLocal(fecha) {
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'short' }).format(fecha);
  return DIAS_CORTOS.indexOf(nombre);
}

// Construye un Date UTC a partir de una hora de pared argentina. El offset se
// aplica en dos pasos porque el offset correcto depende del instante final.
function desdeHoraLocal(anio, mesIndice, dia, horas, minutos) {
  const tentativa = Date.UTC(anio, mesIndice, dia, horas, minutos);
  const offsetInicial = offsetZonaMinutos(new Date(tentativa));
  const corregida = new Date(tentativa - offsetInicial * 60000);
  const offsetFinal = offsetZonaMinutos(corregida);
  if (offsetFinal === offsetInicial) return corregida;
  return new Date(tentativa - offsetFinal * 60000);
}

function partesHora(horaTexto) {
  const [horas, minutos] = String(horaTexto).split(':').map(Number);
  return { horas, minutos };
}

function proximaOcurrencia(desde, diaSemana, horaTexto, minimoDias = 0) {
  const { horas, minutos } = partesHora(horaTexto);
  const { anio, mes, dia } = partesLocales(desde);
  let delta = (diaSemana - diaSemanaLocal(desde) + 7) % 7;
  if (delta < minimoDias) delta += 7;
  let candidata = desdeHoraLocal(anio, mes - 1, dia + delta, horas, minutos);
  if (candidata <= desde) {
    candidata = desdeHoraLocal(anio, mes - 1, dia + delta + 7, horas, minutos);
  }
  return candidata;
}

function ultimaOcurrencia(hasta, diaSemana, horaTexto) {
  const { horas, minutos } = partesHora(horaTexto);
  const { anio, mes, dia } = partesLocales(hasta);
  const delta = (diaSemanaLocal(hasta) - diaSemana + 7) % 7;
  let candidata = desdeHoraLocal(anio, mes - 1, dia - delta, horas, minutos);
  if (candidata > hasta) {
    candidata = desdeHoraLocal(anio, mes - 1, dia - delta - 7, horas, minutos);
  }
  return candidata;
}

function calcularProximoDisparo(programacion, desde) {
  return proximaOcurrencia(desde, programacion.diaSemanaDisparo, programacion.horaDisparo);
}

function calcularUltimoDisparo(programacion, hasta) {
  return ultimaOcurrencia(hasta, programacion.diaSemanaDisparo, programacion.horaDisparo);
}

function calcularFechaPartido(programacion, momentoDisparo) {
  // Si el partido cae el mismo día de semana que el disparo, se va a la semana
  // siguiente: sin esto, "los viernes creá el partido del viernes" abriría la
  // inscripción para dentro de unos minutos.
  const minimoDias = programacion.diaSemanaPartido === programacion.diaSemanaDisparo ? 7 : 0;
  return proximaOcurrencia(momentoDisparo, programacion.diaSemanaPartido, programacion.horaPartido, minimoDias);
}

function formatearHoraArgentina(fecha) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha);
}

module.exports = {
  ZONA,
  calcularProximoDisparo,
  calcularUltimoDisparo,
  calcularFechaPartido,
  formatearHoraArgentina,
};
```

- [ ] **Step 2: Verificar el cálculo a mano**

```bash
cd backend && node -e "
const f = require('./src/utils/programacionFechas');
const prog = { diaSemanaDisparo: 1, horaDisparo: '20:00', diaSemanaPartido: 5, horaPartido: '20:00' };
// 2026-09-20 es domingo
const domingo = new Date('2026-09-20T15:00:00.000Z');
const disparo = f.calcularProximoDisparo(prog, domingo);
console.log('disparo:', f.formatearHoraArgentina(disparo));
console.log('partido:', f.formatearHoraArgentina(f.calcularFechaPartido(prog, disparo)));
const mismoDia = { diaSemanaDisparo: 5, horaDisparo: '20:00', diaSemanaPartido: 5, horaPartido: '20:00' };
const d2 = f.calcularProximoDisparo(mismoDia, domingo);
console.log('mismo dia -> disparo:', f.formatearHoraArgentina(d2), '| partido:', f.formatearHoraArgentina(f.calcularFechaPartido(mismoDia, d2)));
console.log('ultimo disparo:', f.formatearHoraArgentina(f.calcularUltimoDisparo(prog, new Date('2026-09-23T15:00:00.000Z'))));
"
```

Esperado:
- `disparo` cae un **lunes 20:00** (lunes 21/09).
- `partido` cae el **viernes 20:00** siguiente (viernes 25/09).
- En el caso de mismo día: disparo viernes 20:00 y partido el viernes de **7 días después**, no el mismo.
- `ultimo disparo` desde el miércoles 23/09 devuelve el **lunes 21/09 20:00**.

Si alguno no coincide, el bug está en `proximaOcurrencia` / `ultimaOcurrencia`; no seguir a la Task 3 hasta que los cuatro salgan bien.

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/programacionFechas.js
git commit -m "feat(back) utilidades de fechas para programaciones"
```

---

### Task 3: Servicio de programaciones (CRUD)

**Files:**
- Create: `backend/src/services/programacionesService.js`

**Interfaces:**
- Consumes: `calcularProximoDisparo` de `utils/programacionFechas`.
- Produces:
  - `listarProgramaciones(grupoId: string): Array<fila>`
  - `obtenerProgramacion(programacionId: string, grupoId: string): fila | null`
  - `crearProgramacion(datos: object, grupoId: string, creadoPor: string): fila`
  - `actualizarProgramacion(programacionId: string, grupoId: string, cambios: object): fila`
  - `eliminarProgramacion(programacionId: string, grupoId: string): void`

  `datos` y `cambios` aceptan las claves `nombre`, `activa`, `diaSemanaDisparo`, `horaDisparo`, `diaSemanaPartido`, `horaPartido`, `cupoTitulares`, `cupoSuplentes`, `estadio`, `tipoSuelo`, `direccion`, `valorCuota`.

- [ ] **Step 1: Crear `backend/src/services/programacionesService.js`**

```js
const crypto = require('node:crypto');
const { db } = require('../config/db');
const { calcularProximoDisparo } = require('../utils/programacionFechas');

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

function normalizarTexto(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function normalizarEntero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : NaN;
}

function normalizarHora(valor) {
  if (typeof valor !== 'string') return null;
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!coincidencia) return null;
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

// Toma los campos crudos del request y devuelve la programación completa ya
// validada, mezclando sobre `base` (la fila existente, en el caso de edición).
function normalizarYValidar(datos, base = {}) {
  const tomar = (clave) => (datos[clave] !== undefined ? datos[clave] : base[clave]);

  const diaSemanaDisparo = normalizarEntero(tomar('diaSemanaDisparo'));
  const diaSemanaPartido = normalizarEntero(tomar('diaSemanaPartido'));
  for (const [nombreCampo, valor] of [
    ['diaSemanaDisparo', diaSemanaDisparo],
    ['diaSemanaPartido', diaSemanaPartido],
  ]) {
    if (!Number.isInteger(valor) || valor < 0 || valor > 6) {
      throw crearErrorValidacion(`${nombreCampo} debe ser un entero entre 0 (domingo) y 6 (sábado)`);
    }
  }

  const horaDisparo = normalizarHora(tomar('horaDisparo'));
  if (!horaDisparo) throw crearErrorValidacion('horaDisparo debe tener formato HH:MM');
  const horaPartido = normalizarHora(tomar('horaPartido'));
  if (!horaPartido) throw crearErrorValidacion('horaPartido debe tener formato HH:MM');

  const cupoTitulares = normalizarEntero(tomar('cupoTitulares'));
  if (!Number.isInteger(cupoTitulares) || cupoTitulares <= 0) {
    throw crearErrorValidacion('cupoTitulares debe ser un entero mayor a 0');
  }
  const cupoSuplentes = normalizarEntero(tomar('cupoSuplentes'));
  if (!Number.isInteger(cupoSuplentes) || cupoSuplentes < 0) {
    throw crearErrorValidacion('cupoSuplentes debe ser un entero mayor o igual a 0');
  }

  const valorCuota = normalizarEntero(tomar('valorCuota'));
  if (valorCuota !== null && (!Number.isInteger(valorCuota) || valorCuota < 0)) {
    throw crearErrorValidacion('valorCuota debe ser un entero mayor o igual a 0');
  }

  const activaCruda = tomar('activa');
  const activa = activaCruda === undefined || activaCruda === null ? 1 : Number(Boolean(Number(activaCruda)));

  return {
    nombre: normalizarTexto(tomar('nombre')),
    activa,
    diaSemanaDisparo,
    horaDisparo,
    diaSemanaPartido,
    horaPartido,
    cupoTitulares,
    cupoSuplentes,
    estadio: normalizarTexto(tomar('estadio')),
    tipoSuelo: normalizarTexto(tomar('tipoSuelo')),
    direccion: normalizarTexto(tomar('direccion')),
    valorCuota,
  };
}

function listarProgramaciones(grupoId) {
  return db
    .prepare('SELECT * FROM ProgramacionesPartido WHERE grupoId = ? ORDER BY proximoDisparo ASC')
    .all(grupoId);
}

function obtenerProgramacion(programacionId, grupoId) {
  const fila = db.prepare('SELECT * FROM ProgramacionesPartido WHERE id = ?').get(programacionId);
  if (!fila || fila.grupoId !== grupoId) return null;
  return fila;
}

function crearProgramacion(datos, grupoId, creadoPor) {
  const validada = normalizarYValidar(datos);
  const nueva = {
    ...validada,
    id: crypto.randomUUID(),
    grupoId,
    proximoDisparo: calcularProximoDisparo(validada, new Date()).toISOString(),
    ultimoDisparo: null,
    ultimoPartidoId: null,
    creadoPor,
    fechaCreacion: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO ProgramacionesPartido
       (id, grupoId, nombre, activa, diaSemanaDisparo, horaDisparo, diaSemanaPartido, horaPartido,
        cupoTitulares, cupoSuplentes, estadio, tipoSuelo, direccion, valorCuota,
        proximoDisparo, ultimoDisparo, ultimoPartidoId, creadoPor, fechaCreacion)
     VALUES
       (@id, @grupoId, @nombre, @activa, @diaSemanaDisparo, @horaDisparo, @diaSemanaPartido, @horaPartido,
        @cupoTitulares, @cupoSuplentes, @estadio, @tipoSuelo, @direccion, @valorCuota,
        @proximoDisparo, @ultimoDisparo, @ultimoPartidoId, @creadoPor, @fechaCreacion)`
  ).run(nueva);

  return nueva;
}

function actualizarProgramacion(programacionId, grupoId, cambios) {
  const existente = obtenerProgramacion(programacionId, grupoId);
  if (!existente) throw crearError('Programación no encontrada', 404);

  const validada = normalizarYValidar(cambios, existente);

  const cambioElDisparo =
    validada.diaSemanaDisparo !== existente.diaSemanaDisparo || validada.horaDisparo !== existente.horaDisparo;
  // Al reactivar una programación pausada, el proximoDisparo guardado puede
  // estar vencido hace semanas: se recalcula para que no dispare de inmediato.
  const seReactivo = validada.activa === 1 && existente.activa === 0;

  const proximoDisparo =
    cambioElDisparo || seReactivo
      ? calcularProximoDisparo(validada, new Date()).toISOString()
      : existente.proximoDisparo;

  db.prepare(
    `UPDATE ProgramacionesPartido SET
       nombre = @nombre, activa = @activa,
       diaSemanaDisparo = @diaSemanaDisparo, horaDisparo = @horaDisparo,
       diaSemanaPartido = @diaSemanaPartido, horaPartido = @horaPartido,
       cupoTitulares = @cupoTitulares, cupoSuplentes = @cupoSuplentes,
       estadio = @estadio, tipoSuelo = @tipoSuelo, direccion = @direccion,
       valorCuota = @valorCuota, proximoDisparo = @proximoDisparo
     WHERE id = @id`
  ).run({ ...validada, proximoDisparo, id: programacionId });

  return obtenerProgramacion(programacionId, grupoId);
}

function eliminarProgramacion(programacionId, grupoId) {
  const existente = obtenerProgramacion(programacionId, grupoId);
  if (!existente) throw crearError('Programación no encontrada', 404);
  db.prepare('DELETE FROM ProgramacionesPartido WHERE id = ?').run(programacionId);
}

module.exports = {
  listarProgramaciones,
  obtenerProgramacion,
  crearProgramacion,
  actualizarProgramacion,
  eliminarProgramacion,
};
```

- [ ] **Step 2: Verificar el CRUD contra una base en memoria**

```bash
cd backend && SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
db.prepare('INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion) VALUES (?,?,?,0,?)').run('u1','Test','t@t.com', new Date().toISOString());
db.prepare('INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion) VALUES (?,?,?,?,?)').run('g1','Grupo','ABC','u1', new Date().toISOString());
const s = require('./src/services/programacionesService');
const p = s.crearProgramacion({ nombre: 'Viernes', diaSemanaDisparo: 1, horaDisparo: '20:00', diaSemanaPartido: 5, horaPartido: '20:00', cupoTitulares: 10, cupoSuplentes: 5, estadio: 'Parador 4', valorCuota: 10000 }, 'g1', 'u1');
console.log('creada:', p.id, p.proximoDisparo);
const editada = s.actualizarProgramacion(p.id, 'g1', { estadio: 'Parador 7', valorCuota: 12000 });
console.log('editada:', editada.estadio, editada.valorCuota, 'disparo intacto:', editada.proximoDisparo === p.proximoDisparo);
console.log('lista:', s.listarProgramaciones('g1').length);
try { s.crearProgramacion({ diaSemanaDisparo: 9, horaDisparo: '20:00', diaSemanaPartido: 5, horaPartido: '20:00', cupoTitulares: 10, cupoSuplentes: 5 }, 'g1', 'u1'); } catch (e) { console.log('validacion dia:', e.status, e.message); }
try { s.crearProgramacion({ diaSemanaDisparo: 1, horaDisparo: '25:99', diaSemanaPartido: 5, horaPartido: '20:00', cupoTitulares: 10, cupoSuplentes: 5 }, 'g1', 'u1'); } catch (e) { console.log('validacion hora:', e.status, e.message); }
s.eliminarProgramacion(p.id, 'g1');
console.log('tras borrar:', s.listarProgramaciones('g1').length);
"
```

Esperado: imprime la programación creada con un `proximoDisparo` futuro, `disparo intacto: true` (editar la cancha no mueve el disparo), `lista: 1`, las dos validaciones con `400` y su mensaje, y `tras borrar: 0`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/programacionesService.js
git commit -m "feat(back) CRUD de programaciones de partido"
```

---

### Task 4: Barrido que crea los partidos

**Files:**
- Modify: `backend/src/services/programacionesService.js`
- Modify: `backend/src/config/scheduler.js`

**Interfaces:**
- Consumes: `calcularUltimoDisparo`, `calcularProximoDisparo`, `calcularFechaPartido` de `utils/programacionFechas`; `partidosService.crearPartido`.
- Produces: `ejecutarProgramacionesVencidas(): Promise<void>`, exportada por `programacionesService`.

- [ ] **Step 1: Ampliar los imports de `programacionesService.js`**

Reemplazar la línea de import de fechas por:

```js
const {
  calcularProximoDisparo,
  calcularUltimoDisparo,
  calcularFechaPartido,
} = require('../utils/programacionFechas');
```

`partidosService` **no** se importa arriba: se hace `require` dentro de la función, como ya hace `partidosService.eliminarPartido` con sus dependencias, para no arrastrar el ciclo de carga de notificaciones y WhatsApp al levantar el servicio.

- [ ] **Step 2: Agregar el barrido antes del `module.exports`**

```js
function existePartidoEnFecha(grupoId, fechaIso) {
  const fila = db.prepare('SELECT id FROM Partidos WHERE grupoId = ? AND fecha = ?').get(grupoId, fechaIso);
  return Boolean(fila);
}

async function ejecutarProgramacion(programacion, ahora) {
  const partidosService = require('./partidosService');

  // Se parte del disparo vencido más reciente, no del guardado en la fila: si
  // el backend estuvo caído tres semanas, igual corresponde crear el partido
  // de esta semana y no intentar uno cuya fecha ya pasó.
  const momentoDisparo = calcularUltimoDisparo(programacion, ahora);
  const fechaPartido = calcularFechaPartido(programacion, momentoDisparo);
  const fechaPartidoIso = fechaPartido.toISOString();

  let partidoCreadoId = programacion.ultimoPartidoId;
  let huboDisparo = false;

  if (fechaPartido <= ahora) {
    console.warn(
      `Programación ${programacion.id}: la fecha calculada ${fechaPartidoIso} ya pasó, se saltea la ocurrencia`
    );
  } else if (existePartidoEnFecha(programacion.grupoId, fechaPartidoIso)) {
    console.warn(
      `Programación ${programacion.id}: ya existe un partido del grupo para ${fechaPartidoIso}, no se duplica`
    );
  } else {
    const partido = await partidosService.crearPartido({
      fecha: fechaPartidoIso,
      cupoTitulares: programacion.cupoTitulares,
      cupoSuplentes: programacion.cupoSuplentes,
      estadio: programacion.estadio,
      tipoSuelo: programacion.tipoSuelo,
      direccion: programacion.direccion,
      valorCuota: programacion.valorCuota,
      creadoPor: programacion.creadoPor,
      grupoId: programacion.grupoId,
    });
    partidoCreadoId = partido.id;
    huboDisparo = true;
    console.log(`Programación ${programacion.id}: partido ${partido.id} creado para ${fechaPartidoIso}`);
  }

  db.prepare(
    `UPDATE ProgramacionesPartido
       SET proximoDisparo = @proximoDisparo, ultimoDisparo = @ultimoDisparo, ultimoPartidoId = @ultimoPartidoId
     WHERE id = @id`
  ).run({
    id: programacion.id,
    proximoDisparo: calcularProximoDisparo(programacion, ahora).toISOString(),
    ultimoDisparo: huboDisparo ? ahora.toISOString() : programacion.ultimoDisparo,
    ultimoPartidoId: partidoCreadoId,
  });
}

async function ejecutarProgramacionesVencidas() {
  const ahora = new Date();
  const vencidas = db
    .prepare(
      'SELECT * FROM ProgramacionesPartido WHERE activa = 1 AND proximoDisparo <= ? ORDER BY proximoDisparo ASC'
    )
    .all(ahora.toISOString());

  for (const programacion of vencidas) {
    try {
      await ejecutarProgramacion(programacion, ahora);
    } catch (error) {
      // Una programación con datos malos no puede frenar a las demás.
      console.error(`Error ejecutando programación ${programacion.id}:`, error.message);
    }
  }
}
```

`calcularProximoDisparo(programacion, ahora)` siempre devuelve un instante estrictamente posterior a `ahora`, así que una fila vencida nunca vuelve a entrar en el mismo barrido ni queda en bucle.

- [ ] **Step 3: Exportar la función nueva**

Agregar `ejecutarProgramacionesVencidas,` al `module.exports` de `programacionesService.js`.

- [ ] **Step 4: Enganchar al scheduler**

En `backend/src/config/scheduler.js`, agregar el require arriba junto a los otros servicios:

```js
const programacionesService = require('../services/programacionesService');
```

Dentro del `cron.schedule('* * * * *', ...)`, después del bloque de cierre de votaciones:

```js
    try {
      await programacionesService.ejecutarProgramacionesVencidas();
    } catch (error) {
      console.error('Error en scheduler de programaciones de partido:', error.message);
    }
```

Y antes del `console.log('Scheduler de notificaciones iniciado');`, una corrida de arranque para recuperar disparos perdidos sin esperar al próximo minuto:

```js
  programacionesService.ejecutarProgramacionesVencidas().catch((error) => {
    console.error('Error en la corrida inicial de programaciones:', error.message);
  });
```

- [ ] **Step 5: Verificar el barrido, el catch-up y el anti-duplicado**

```bash
cd backend && SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
const ahora = new Date();
db.prepare('INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion) VALUES (?,?,?,0,?)').run('u1','Test','t@t.com', ahora.toISOString());
db.prepare('INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion) VALUES (?,?,?,?,?)').run('g1','Grupo','ABC','u1', ahora.toISOString());
const s = require('./src/services/programacionesService');
const p = s.crearProgramacion({ diaSemanaDisparo: 1, horaDisparo: '20:00', diaSemanaPartido: 5, horaPartido: '20:00', cupoTitulares: 10, cupoSuplentes: 5, estadio: 'Parador 4', valorCuota: 10000 }, 'g1', 'u1');
// Simula un disparo perdido hace tres semanas.
db.prepare('UPDATE ProgramacionesPartido SET proximoDisparo = ? WHERE id = ?').run(new Date(Date.now() - 21*24*3600*1000).toISOString(), p.id);
(async () => {
  await s.ejecutarProgramacionesVencidas();
  const partidos = db.prepare('SELECT fecha, estadio, valorCuota FROM Partidos WHERE grupoId = ?').all('g1');
  console.log('partidos tras catch-up:', JSON.stringify(partidos));
  const fila = db.prepare('SELECT proximoDisparo, ultimoPartidoId FROM ProgramacionesPartido WHERE id = ?').get(p.id);
  console.log('proximo disparo futuro:', new Date(fila.proximoDisparo) > new Date(), '| ultimoPartidoId seteado:', Boolean(fila.ultimoPartidoId));
  // Segundo barrido inmediato: no debe crear nada porque el disparo ya es futuro.
  await s.ejecutarProgramacionesVencidas();
  console.log('partidos tras segundo barrido:', db.prepare('SELECT COUNT(*) c FROM Partidos').get().c);
})();
"
```

Esperado: exactamente **un** partido, con `estadio: 'Parador 4'` y `valorCuota: 10000`, y una `fecha` que cae un viernes 20:00 futuro; `proximo disparo futuro: true`; `ultimoPartidoId seteado: true`; y `partidos tras segundo barrido: 1`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/programacionesService.js backend/src/config/scheduler.js
git commit -m "feat(back) barrido que crea partidos programados"
```

---

### Task 5: Controlador, rutas y montaje

**Files:**
- Create: `backend/src/controllers/programacionesController.js`
- Create: `backend/src/routes/programacionesRoutes.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `programacionesService.{listarProgramaciones, crearProgramacion, actualizarProgramacion, eliminarProgramacion}`.
- Produces: `GET/POST /api/grupos/:grupoId/programaciones`, `PUT/DELETE /api/grupos/:grupoId/programaciones/:programacionId`.

- [ ] **Step 1: Crear `backend/src/controllers/programacionesController.js`**

```js
const programacionesService = require('../services/programacionesService');

async function listar(req, res) {
  res.json(programacionesService.listarProgramaciones(req.params.grupoId));
}

async function crear(req, res) {
  const programacion = programacionesService.crearProgramacion(req.body, req.params.grupoId, req.usuario.uid);
  res.status(201).json(programacion);
}

async function actualizar(req, res) {
  const programacion = programacionesService.actualizarProgramacion(
    req.params.programacionId,
    req.params.grupoId,
    req.body
  );
  res.json(programacion);
}

async function eliminar(req, res) {
  programacionesService.eliminarProgramacion(req.params.programacionId, req.params.grupoId);
  res.status(204).send();
}

module.exports = { listar, crear, actualizar, eliminar };
```

- [ ] **Step 2: Crear `backend/src/routes/programacionesRoutes.js`**

```js
const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const programacionesController = require('../controllers/programacionesController');

const router = express.Router({ mergeParams: true });

router.get('/', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(programacionesController.listar));
router.post('/', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(programacionesController.crear));
router.put(
  '/:programacionId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(programacionesController.actualizar)
);
router.delete(
  '/:programacionId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(programacionesController.eliminar)
);

module.exports = router;
```

- [ ] **Step 3: Montar el router en `backend/src/app.js`**

Agregar el require junto a los demás:

```js
const programacionesRoutes = require('./routes/programacionesRoutes');
```

Y el montaje inmediatamente después de la línea de `usuariosGrupoRoutes`, **antes** de `app.use('/api/grupos', gruposRoutes)`:

```js
app.use('/api/grupos/:grupoId/programaciones', emitirActualizacionGrupo, programacionesRoutes);
```

El orden importa: `gruposRoutes` está montado en el prefijo más corto y se quedaría con la ruta si fuera primero.

- [ ] **Step 4: Verificar que el servidor levanta y las rutas responden**

```bash
cd backend && node -e "require('./src/app'); console.log('app carga ok');"
```

Esperado: imprime `app carga ok` sin excepciones.

Después, con el backend corriendo (`npm run dev` en `backend/`) y un token de admin en `$TOKEN` y un grupo en `$GRUPO`:

```bash
curl -s -X POST "http://localhost:4000/api/grupos/$GRUPO/programaciones" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nombre":"Viernes","diaSemanaDisparo":1,"horaDisparo":"20:00","diaSemanaPartido":5,"horaPartido":"20:00","cupoTitulares":10,"cupoSuplentes":5,"estadio":"Parador 4","valorCuota":10000}'
curl -s "http://localhost:4000/api/grupos/$GRUPO/programaciones" -H "Authorization: Bearer $TOKEN"
```

Esperado: el POST devuelve 201 con la programación y su `proximoDisparo`; el GET devuelve un array con esa fila. Con un token de jugador (no admin), ambas devuelven 403.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/programacionesController.js backend/src/routes/programacionesRoutes.js backend/src/app.js
git commit -m "feat(back) API de programaciones de partido"
```

---

### Task 6: Sección de programaciones en el panel de admin

**Files:**
- Create: `frontend/src/components/ProgramacionPartidos.jsx`
- Modify: `frontend/src/pages/AdminPanel.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/grupos/:grupoId/programaciones`; `api` de `services/api`; `rutaGrupo` de `utils/rutasGrupo`; `Boton` de `components/Boton`.
- Produces: componente `ProgramacionPartidos({ grupoId })` por default export.

- [ ] **Step 1: Crear `frontend/src/components/ProgramacionPartidos.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import Boton from './Boton';

const DIAS = [
  { valor: 0, nombre: 'Domingo' },
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
];

const FORMULARIO_INICIAL = {
  nombre: '',
  diaSemanaDisparo: 1,
  horaDisparo: '20:00',
  diaSemanaPartido: 5,
  horaPartido: '20:00',
  cupoTitulares: 10,
  cupoSuplentes: 5,
  estadio: '',
  tipoSuelo: '',
  direccion: '',
  valorCuota: '',
};

const CLASE_INPUT = 'rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white';
const CLASE_LABEL = 'flex flex-col gap-1 text-sm text-white/70';

function nombreDia(valor) {
  return DIAS.find((dia) => dia.valor === Number(valor))?.nombre ?? '';
}

function formatearProximoDisparo(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProgramacionPartidos({ grupoId }) {
  const [programaciones, setProgramaciones] = useState([]);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [formularioVisible, setFormularioVisible] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [accionEnCurso, setAccionEnCurso] = useState(false);

  const cargar = useCallback(async () => {
    if (!grupoId) return;
    try {
      const { data } = await api.get(rutaGrupo(grupoId, '/programaciones'));
      setProgramaciones(data);
    } catch (err) {
      setError(err.message);
    }
  }, [grupoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actualizarCampo(campo, valor) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  function abrirAlta() {
    setEditandoId(null);
    setFormulario(FORMULARIO_INICIAL);
    setFormularioVisible(true);
  }

  function abrirEdicion(programacion) {
    setEditandoId(programacion.id);
    setFormulario({
      nombre: programacion.nombre ?? '',
      diaSemanaDisparo: programacion.diaSemanaDisparo,
      horaDisparo: programacion.horaDisparo,
      diaSemanaPartido: programacion.diaSemanaPartido,
      horaPartido: programacion.horaPartido,
      cupoTitulares: programacion.cupoTitulares,
      cupoSuplentes: programacion.cupoSuplentes,
      estadio: programacion.estadio ?? '',
      tipoSuelo: programacion.tipoSuelo ?? '',
      direccion: programacion.direccion ?? '',
      valorCuota: programacion.valorCuota ?? '',
    });
    setFormularioVisible(true);
  }

  function cerrarFormulario() {
    setFormularioVisible(false);
    setEditandoId(null);
    setFormulario(FORMULARIO_INICIAL);
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    const cuerpo = {
      nombre: formulario.nombre || null,
      diaSemanaDisparo: Number(formulario.diaSemanaDisparo),
      horaDisparo: formulario.horaDisparo,
      diaSemanaPartido: Number(formulario.diaSemanaPartido),
      horaPartido: formulario.horaPartido,
      cupoTitulares: Number(formulario.cupoTitulares),
      cupoSuplentes: Number(formulario.cupoSuplentes),
      estadio: formulario.estadio || null,
      tipoSuelo: formulario.tipoSuelo || null,
      direccion: formulario.direccion || null,
      valorCuota: formulario.valorCuota !== '' ? Number(formulario.valorCuota) : null,
    };
    try {
      if (editandoId) {
        await api.put(rutaGrupo(grupoId, `/programaciones/${editandoId}`), cuerpo);
        setMensaje('Programación actualizada.');
      } else {
        await api.post(rutaGrupo(grupoId, '/programaciones'), cuerpo);
        setMensaje('Programación creada.');
      }
      cerrarFormulario();
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function alternarActiva(programacion) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.put(rutaGrupo(grupoId, `/programaciones/${programacion.id}`), {
        activa: programacion.activa ? 0 : 1,
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function eliminar(programacion) {
    const etiqueta = programacion.nombre || `${nombreDia(programacion.diaSemanaPartido)} ${programacion.horaPartido}`;
    if (!window.confirm(`¿Borrar la programación "${etiqueta}"? Los partidos ya creados no se tocan.`)) return;
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.delete(rutaGrupo(grupoId, `/programaciones/${programacion.id}`));
      setMensaje('Programación eliminada.');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-cancha-800 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-white">Partidos automáticos</h2>
        <Boton variante="ghost" className="px-3 py-1 text-xs" onClick={abrirAlta} disabled={accionEnCurso}>
          Nueva programación
        </Boton>
      </div>

      {error && <p className="mb-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
      {mensaje && <p className="mb-3 rounded-lg bg-pasto-600/20 px-4 py-2 text-sm text-pasto-500">{mensaje}</p>}

      {programaciones.length === 0 ? (
        <p className="text-sm text-white/50">
          No hay partidos automáticos. Creá una programación para que la fecha se abra sola todas las semanas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {programaciones.map((programacion) => (
            <li key={programacion.id} className="rounded-lg border border-white/10 bg-cancha-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="font-semibold text-white">
                    {programacion.nombre || `Partido de los ${nombreDia(programacion.diaSemanaPartido).toLowerCase()}`}
                    {!programacion.activa && <span className="ml-2 text-xs text-white/50">(pausada)</span>}
                  </p>
                  <p className="text-sm text-white/70">
                    Se crea los {nombreDia(programacion.diaSemanaDisparo).toLowerCase()} {programacion.horaDisparo} →
                    partido {nombreDia(programacion.diaSemanaPartido).toLowerCase()} {programacion.horaPartido}
                  </p>
                  <p className="text-sm text-white/50">
                    {[
                      programacion.estadio,
                      `${programacion.cupoTitulares}+${programacion.cupoSuplentes}`,
                      programacion.valorCuota != null ? `$${programacion.valorCuota.toLocaleString('es-AR')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {Boolean(programacion.activa) && (
                    <p className="mt-1 text-xs text-white/40">
                      Próxima creación: {formatearProximoDisparo(programacion.proximoDisparo)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Boton
                    variante="ghost"
                    className="px-3 py-1 text-xs"
                    onClick={() => abrirEdicion(programacion)}
                    disabled={accionEnCurso}
                  >
                    Editar
                  </Boton>
                  <Boton
                    variante="ghost"
                    className="px-3 py-1 text-xs"
                    onClick={() => alternarActiva(programacion)}
                    disabled={accionEnCurso}
                  >
                    {programacion.activa ? 'Pausar' : 'Reanudar'}
                  </Boton>
                  <Boton
                    variante="peligro"
                    className="px-3 py-1 text-xs"
                    onClick={() => eliminar(programacion)}
                    disabled={accionEnCurso}
                  >
                    Borrar
                  </Boton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formularioVisible && (
        <form onSubmit={guardar} className="mt-5 flex flex-wrap items-end gap-4 border-t border-white/10 pt-5">
          <label className={`${CLASE_LABEL} min-w-[200px] flex-1`}>
            Nombre (opcional)
            <input
              type="text"
              value={formulario.nombre}
              onChange={(evento) => actualizarCampo('nombre', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Viernes Parador 4"
            />
          </label>
          <label className={CLASE_LABEL}>
            Día de creación
            <select
              value={formulario.diaSemanaDisparo}
              onChange={(evento) => actualizarCampo('diaSemanaDisparo', evento.target.value)}
              className={CLASE_INPUT}
            >
              {DIAS.map((dia) => (
                <option key={dia.valor} value={dia.valor}>
                  {dia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={CLASE_LABEL}>
            Hora de creación
            <input
              type="time"
              required
              value={formulario.horaDisparo}
              onChange={(evento) => actualizarCampo('horaDisparo', evento.target.value)}
              className={CLASE_INPUT}
            />
          </label>
          <label className={CLASE_LABEL}>
            Día del partido
            <select
              value={formulario.diaSemanaPartido}
              onChange={(evento) => actualizarCampo('diaSemanaPartido', evento.target.value)}
              className={CLASE_INPUT}
            >
              {DIAS.map((dia) => (
                <option key={dia.valor} value={dia.valor}>
                  {dia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={CLASE_LABEL}>
            Hora del partido
            <input
              type="time"
              required
              value={formulario.horaPartido}
              onChange={(evento) => actualizarCampo('horaPartido', evento.target.value)}
              className={CLASE_INPUT}
            />
          </label>
          <label className={CLASE_LABEL}>
            Cupo titulares
            <input
              type="number"
              min="1"
              required
              value={formulario.cupoTitulares}
              onChange={(evento) => actualizarCampo('cupoTitulares', evento.target.value)}
              className={`${CLASE_INPUT} w-28`}
            />
          </label>
          <label className={CLASE_LABEL}>
            Cupo suplentes
            <input
              type="number"
              min="0"
              required
              value={formulario.cupoSuplentes}
              onChange={(evento) => actualizarCampo('cupoSuplentes', evento.target.value)}
              className={`${CLASE_INPUT} w-28`}
            />
          </label>
          <label className={`${CLASE_LABEL} min-w-[180px] flex-1`}>
            Estadio
            <input
              type="text"
              value={formulario.estadio}
              onChange={(evento) => actualizarCampo('estadio', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Parador 4"
            />
          </label>
          <label className={`${CLASE_LABEL} min-w-[180px] flex-1`}>
            Tipo de suelo
            <input
              type="text"
              value={formulario.tipoSuelo}
              onChange={(evento) => actualizarCampo('tipoSuelo', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Sintético Cubierto Pro 7vs7"
            />
          </label>
          <label className={`${CLASE_LABEL} min-w-[220px] flex-1`}>
            Dirección
            <input
              type="text"
              value={formulario.direccion}
              onChange={(evento) => actualizarCampo('direccion', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Av. Álvarez Thomas 1850, CABA"
            />
          </label>
          <label className={CLASE_LABEL}>
            Valor por jugador
            <input
              type="number"
              min="0"
              step="1"
              value={formulario.valorCuota}
              onChange={(evento) => actualizarCampo('valorCuota', evento.target.value)}
              className={`${CLASE_INPUT} w-28`}
              placeholder="10000"
            />
          </label>
          <div className="flex gap-2">
            <Boton type="submit" disabled={accionEnCurso}>
              {accionEnCurso ? 'Procesando…' : editandoId ? 'Guardar cambios' : 'Crear programación'}
            </Boton>
            <Boton type="button" variante="ghost" onClick={cerrarFormulario} disabled={accionEnCurso}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Renderizar la sección en `frontend/src/pages/AdminPanel.jsx`**

Agregar el import junto a los demás componentes:

```jsx
import ProgramacionPartidos from '../components/ProgramacionPartidos';
```

Y en el JSX, inmediatamente después del `</section>` de "Crear partido para {grupoActivo.nombre}" y antes de la sección "Sancionados":

```jsx
      <ProgramacionPartidos grupoId={grupoActivo.id} />
```

- [ ] **Step 3: Verificar en el navegador**

Levantar backend (`npm run dev` en `backend/`) y frontend (`npm run dev` en `frontend/`), entrar al panel de admin de un grupo y comprobar:

1. Aparece la sección "Partidos automáticos" con el texto de lista vacía.
2. "Nueva programación" abre el formulario; crear una con día de creación lunes 20:00 y día del partido viernes 20:00 la agrega a la lista con la línea "Se crea los lunes 20:00 → partido viernes 20:00" y una próxima creación futura.
3. "Editar" precarga los valores; cambiar el estadio y guardar actualiza la fila sin mover la próxima creación.
4. "Pausar" la marca como `(pausada)` y oculta la próxima creación; "Reanudar" la vuelve a activar.
5. "Borrar" pide confirmación y la saca de la lista.
6. Para ver un disparo real sin esperar: crear una programación con hora de creación un minuto en el futuro y comprobar que al minuto siguiente aparece el partido nuevo en la sección "Partidos" del panel.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProgramacionPartidos.jsx frontend/src/pages/AdminPanel.jsx
git commit -m "feat(front) seccion de partidos automaticos en panel de admin"
```
