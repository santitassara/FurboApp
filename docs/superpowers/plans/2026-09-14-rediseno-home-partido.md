# Rediseño Home + info extendida de partido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `Home.jsx` con un hero para el próximo partido (título + botón anotarse/baja), tarjeta de info extendida (estadio, suelo, dirección, clima, cupo, valor), convocados con scroll fijo, formaciones blureadas hasta completar titulares, MVP de la última fecha y líderes del mes — con los campos y datos nuevos que esto requiere en el backend.

**Architecture:** Se agregan columnas nuevas a `Partidos` (numero, estadio, tipoSuelo, direccion, lat, lon, valorCuota), un `climaService.js` que geocodifica la dirección y consulta OpenWeather forecast, y una función de líderes del mes en `estadisticasService.js` expuesta como ruta nueva. El MVP de la última fecha NO necesita endpoint nuevo: se arma en el frontend combinando `GET /partidos/historial` (ya existe) y `GET /partidos/:id/resultado` (ya existe). El frontend separa el primer partido de la lista en componentes nuevos (`HeroPartido`, `TarjetaInfoPartido`, `ListaConvocadosScroll`, `MvpUltimaFecha`, `LideresDelMes`) sin tocar la lógica interna de `MapaCancha`/`ListaJugadores` existentes.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React + Vite + Tailwind v4 vía `@theme` (frontend). `fetch` global de Node 22 para llamar OpenWeather (sin dependencias nuevas).

**Spec:** `docs/superpowers/specs/2026-09-14-rediseno-home-partido-design.md`

## Global Constraints

- No agregar dependencias npm nuevas — usar `fetch` global (Node 22) para OpenWeather.
- Todos los campos nuevos de `Partido` son opcionales/nullable — partidos creados antes de esta migración deben seguir funcionando (frontend oculta lo que no está cargado).
- Clima: si el partido es a más de 5 días, mostrar el texto "Pronóstico no disponible aún" (no ocultar el bloque).
- Fallas de OpenWeather (sin `OPENWEATHER_API_KEY`, rate limit, geocoding sin resultados) nunca deben romper la carga de partidos — degradan a `clima: null` / `lat`/`lon` null.
- El hero (título grande + botón + info extendida + convocados scroll + formaciones + MVP + líderes) aplica solo al primer partido de la lista (`partidos[0]`). Partidos siguientes (si los hay) siguen usando `TarjetaPartido` tal cual está hoy.
- Colores/estilo: usar únicamente los tokens ya definidos en `frontend/src/index.css` (`cancha-900/800/700`, `pasto-500/600`, `albiceleste`, `tarjeta`, `sancion`, `font-display`) — no agregar colores nuevos.
- No se implementan "Finanzas del Picado" ni "Pizarra del Vestuario".
- Según preferencia ya establecida por el usuario para este proyecto, no se escriben tests automáticos nuevos salvo que se pida explícitamente — cada tarea de backend se verifica corriendo el server y pegándole con `curl`/el frontend a mano. Antes de tocar `partidosService.js`/`partidosController.js`, correr la suite existente (`npm test`) para tener la foto base: hoy hay 3 fallas preexistentes en `tests/services/partidosService.test.js` (comparaciones `toEqual` con columnas de más, y un 403 de `eliminarPartido` que no rechaza) que **no** son parte de este trabajo — no corresponde arreglarlas acá, solo confirmar que no aparecen fallas nuevas además de esas 3.

---

## Backend

### Task 1: Migración de columnas nuevas en `Partidos`

**Files:**
- Modify: `backend/src/db/schema.sql:45-57` (CREATE TABLE Partidos)
- Modify: `backend/src/config/db.js` (agregar bloque de migración antes de `module.exports = { db };` en la línea 282)

**Interfaces:**
- Produces: columnas `numero INTEGER`, `estadio TEXT`, `tipoSuelo TEXT`, `direccion TEXT`, `lat REAL`, `lon REAL`, `valorCuota INTEGER` en `Partidos`, disponibles para todas las tareas siguientes (backend y tests, que arman su DB en memoria solo desde `schema.sql`).

- [ ] **Step 1: Agregar las columnas al `CREATE TABLE` base**

En `backend/src/db/schema.sql`, reemplazar:

```sql
CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  recordatorioEnviado INTEGER NOT NULL DEFAULT 0,
  recordatorioPostPartidoEnviado INTEGER NOT NULL DEFAULT 0,
  votacionCerrada INTEGER NOT NULL DEFAULT 0,
  beelupUrl TEXT
);
```

por:

```sql
CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  recordatorioEnviado INTEGER NOT NULL DEFAULT 0,
  recordatorioPostPartidoEnviado INTEGER NOT NULL DEFAULT 0,
  votacionCerrada INTEGER NOT NULL DEFAULT 0,
  beelupUrl TEXT,
  numero INTEGER,
  estadio TEXT,
  tipoSuelo TEXT,
  direccion TEXT,
  lat REAL,
  lon REAL,
  valorCuota INTEGER
);
```

Esto es lo que usa `backend/tests/helpers/testDb.js` para armar la DB en memoria de los tests (solo corre `schema.sql`, no las migraciones de `db.js`), así que sin este cambio cualquier INSERT con las columnas nuevas falla en tests con "no such column".

- [ ] **Step 2: Migración para bases de datos SQLite ya existentes**

En `backend/src/config/db.js`, justo antes de la línea final `module.exports = { db };` (línea 282), agregar:

```js
const columnasPartidosExtendido = {
  numero: 'INTEGER',
  estadio: 'TEXT',
  tipoSuelo: 'TEXT',
  direccion: 'TEXT',
  lat: 'REAL',
  lon: 'REAL',
  valorCuota: 'INTEGER',
};
const columnasPartidosActuales = db.prepare('PRAGMA table_info(Partidos)').all();
for (const [columna, tipo] of Object.entries(columnasPartidosExtendido)) {
  const yaExiste = columnasPartidosActuales.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Partidos ADD COLUMN ${columna} ${tipo}`);
  }
}
```

(Mismo patrón que el bloque `columnasPerfilJugador` ya existente más arriba en el archivo.)

- [ ] **Step 3: Verificar manualmente**

Correr:
```bash
cd backend && rm -f data/furboapp.db && node -e "require('./src/config/db'); console.log('ok')"
```
Debe imprimir `ok` sin errores. Confirmar que la DB nueva tiene las columnas:
```bash
node -e "const {db}=require('./src/config/db'); console.log(db.prepare('PRAGMA table_info(Partidos)').all().map(c=>c.name))"
```
Debe listar `numero`, `estadio`, `tipoSuelo`, `direccion`, `lat`, `lon`, `valorCuota` entre las columnas.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js
git commit -m "feat(backend): agrega columnas numero/estadio/suelo/direccion/lat/lon/valorCuota a Partidos"
```

---

### Task 2: `climaService.js` — geocoding + pronóstico OpenWeather

**Files:**
- Create: `backend/src/services/climaService.js`
- Modify: `backend/.env.example` (agregar `OPENWEATHER_API_KEY=`)

**Interfaces:**
- Consumes: `process.env.OPENWEATHER_API_KEY`, `fetch` global.
- Produces: `geocodificar(direccion: string): Promise<{lat:number, lon:number} | null>` y
  `obtenerPronostico(lat: number, lon: number, fechaPartidoISO: string): Promise<{disponible:true, temp:number, descripcion:string, icono:string} | {disponible:false} | null>` —
  usados por `partidosService.crearPartido` (Task 3) y `partidosController.listar` (Task 4).

- [ ] **Step 1: Implementar el servicio**

Crear `backend/src/services/climaService.js`:

```js
const CACHE_TTL_MS = 60 * 60 * 1000;
const cachePronostico = new Map();

async function geocodificar(direccion) {
  if (!direccion || !process.env.OPENWEATHER_API_KEY) return null;
  try {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      direccion
    )}&limit=1&appid=${process.env.OPENWEATHER_API_KEY}`;
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    if (!Array.isArray(datos) || datos.length === 0) return null;
    return { lat: datos[0].lat, lon: datos[0].lon };
  } catch (error) {
    console.error('Error geocodificando dirección:', error.message);
    return null;
  }
}

async function obtenerPronostico(lat, lon, fechaPartidoISO) {
  if (lat == null || lon == null || !process.env.OPENWEATHER_API_KEY) return null;

  const fechaPartido = new Date(fechaPartidoISO);
  const diffMs = fechaPartido.getTime() - Date.now();
  if (diffMs > 5 * 24 * 60 * 60 * 1000) {
    return { disponible: false };
  }

  const claveCache = `${lat.toFixed(2)},${lon.toFixed(2)},${fechaPartido.toISOString().slice(0, 10)}`;
  const cacheado = cachePronostico.get(claveCache);
  if (cacheado && Date.now() - cacheado.timestamp < CACHE_TTL_MS) {
    return cacheado.valor;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${process.env.OPENWEATHER_API_KEY}`;
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const lista = datos.list || [];
    if (lista.length === 0) return null;

    const masCercano = lista.reduce((mejor, actual) => {
      const diffActual = Math.abs(new Date(actual.dt_txt).getTime() - fechaPartido.getTime());
      const diffMejor = Math.abs(new Date(mejor.dt_txt).getTime() - fechaPartido.getTime());
      return diffActual < diffMejor ? actual : mejor;
    }, lista[0]);

    const valor = {
      disponible: true,
      temp: masCercano.main.temp,
      descripcion: masCercano.weather?.[0]?.description || '',
      icono: masCercano.weather?.[0]?.icon || '',
    };
    cachePronostico.set(claveCache, { valor, timestamp: Date.now() });
    return valor;
  } catch (error) {
    console.error('Error obteniendo pronóstico:', error.message);
    return null;
  }
}

module.exports = { geocodificar, obtenerPronostico };
```

- [ ] **Step 2: Documentar la env var**

En `backend/.env.example`, agregar una línea nueva al final:
```
OPENWEATHER_API_KEY=
```
Recordar (no lo hace este plan por vos): agregar la key real a tu `backend/.env` local para que el clima funcione; sin ella, `climaService` degrada a `null` sin romper nada.

- [ ] **Step 3: Verificar manualmente**

Con `OPENWEATHER_API_KEY` seteada en el entorno:
```bash
cd backend && node -e "
require('dotenv').config();
const clima = require('./src/services/climaService');
clima.geocodificar('Av. Álvarez Thomas 1850, CABA').then(async (coords) => {
  console.log('coords', coords);
  if (coords) {
    const pron = await clima.obtenerPronostico(coords.lat, coords.lon, new Date(Date.now()+86400000).toISOString());
    console.log('pronostico', pron);
  }
});
"
```
Debe imprimir coordenadas válidas y un pronóstico con `disponible: true`. Sin `OPENWEATHER_API_KEY` seteada, ambas funciones deben devolver `null` sin tirar excepción.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/climaService.js backend/.env.example
git commit -m "feat(backend): agrega climaService con geocoding y pronostico de OpenWeather"
```

---

### Task 3: `partidosService.crearPartido` — numero autoincremental + estadio/suelo/dirección/valor + geocoding

**Files:**
- Modify: `backend/src/services/partidosService.js:17-51`

**Interfaces:**
- Consumes: `climaService.geocodificar` (Task 2).
- Produces: `crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor, grupoId, estadio, tipoSuelo, direccion, valorCuota })` — los 4 campos nuevos son opcionales. El partido devuelto incluye `numero`, `estadio`, `tipoSuelo`, `direccion`, `lat`, `lon`, `valorCuota`. Usado por `partidosController.crear` (Task 4).

- [ ] **Step 1: Reemplazar `crearPartido`**

En `backend/src/services/partidosService.js`, agregar el require al tope del archivo:

```js
const climaService = require('./climaService');
```

Y reemplazar la función completa:

```js
async function crearPartido({
  fecha,
  cupoTitulares,
  cupoSuplentes,
  creadoPor,
  grupoId,
  estadio,
  tipoSuelo,
  direccion,
  valorCuota,
}) {
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
  if (valorCuota !== undefined && valorCuota !== null && (!Number.isInteger(valorCuota) || valorCuota < 0)) {
    throw crearErrorValidacion('valorCuota debe ser un entero mayor o igual a 0');
  }

  const numeroFila = db
    .prepare('SELECT COALESCE(MAX(numero), 0) as maximo FROM Partidos WHERE grupoId = ?')
    .get(grupoId);
  const numero = (numeroFila?.maximo || 0) + 1;

  const direccionLimpia = typeof direccion === 'string' ? direccion.trim() : '';
  let lat = null;
  let lon = null;
  if (direccionLimpia) {
    const coordenadas = await climaService.geocodificar(direccionLimpia);
    if (coordenadas) {
      lat = coordenadas.lat;
      lon = coordenadas.lon;
    }
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
    numero,
    estadio: typeof estadio === 'string' && estadio.trim() ? estadio.trim() : null,
    tipoSuelo: typeof tipoSuelo === 'string' && tipoSuelo.trim() ? tipoSuelo.trim() : null,
    direccion: direccionLimpia || null,
    lat,
    lon,
    valorCuota: valorCuota ?? null,
  };
  db.prepare(
    `INSERT INTO Partidos
       (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes, numero, estadio, tipoSuelo, direccion, lat, lon, valorCuota)
     VALUES
       (@id, @fecha, @estado, @creadoPor, @grupoId, @cupoTitulares, @cupoSuplentes, @numero, @estadio, @tipoSuelo, @direccion, @lat, @lon, @valorCuota)`
  ).run(nuevoPartido);

  notificacionesService.enviarNotificacionNuevoPartido(nuevoPartido.id).catch((error) => {
    console.error('Error enviando notificación de nuevo partido:', error.message);
  });

  whatsappNotificacionesService.enviarWhatsappNuevoPartido(nuevoPartido.id).catch((error) => {
    console.error('Error enviando WhatsApp de nuevo partido:', error.message);
  });

  return nuevoPartido;
}
```

- [ ] **Step 2: Correr la suite existente y confirmar que no hay fallas nuevas**

```bash
cd backend && npx jest tests/services/partidosService.test.js --setupFiles dotenv/config
```
Esperado: mismas 3 fallas preexistentes (ver "Global Constraints") y el resto en verde — ninguna falla nueva por los campos agregados (son todos opcionales, así que las llamadas existentes en los tests sin esos campos deben seguir funcionando).

- [ ] **Step 3: Verificar manualmente el número autoincremental**

```bash
cd backend && node -e "
require('dotenv').config();
jest// no-op
" 2>/dev/null; node -e "
require('dotenv').config();
process.env.SQLITE_DB_PATH=':memory:';
const { db } = require('./src/config/db');
db.prepare(\"INSERT INTO Usuarios (uid,nombre,email,esSuperAdmin,fechaCreacion) VALUES ('u1','U','u@test.com',0,'2026-01-01')\").run();
db.prepare(\"INSERT INTO Grupos (id,nombre,codigoInvitacion,creadoPor,fechaCreacion) VALUES ('g1','G','COD1','u1','2026-01-01')\").run();
const partidosService = require('./src/services/partidosService');
(async () => {
  const p1 = await partidosService.crearPartido({ fecha: new Date(Date.now()+86400000).toISOString(), cupoTitulares: 10, cupoSuplentes: 5, creadoPor: 'u1', grupoId: 'g1' });
  const p2 = await partidosService.crearPartido({ fecha: new Date(Date.now()+86400000).toISOString(), cupoTitulares: 10, cupoSuplentes: 5, creadoPor: 'u1', grupoId: 'g1', estadio: 'Cancha 1', direccion: 'Test 123' });
  console.log(p1.numero, p2.numero);
})();
"
```
Esperado: imprime `1 2`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/partidosService.js
git commit -m "feat(backend): crearPartido calcula numero por grupo y acepta estadio/suelo/direccion/valorCuota"
```

---

### Task 4: `partidosController` — aceptar campos nuevos al crear + enriquecer con clima al listar

**Files:**
- Modify: `backend/src/controllers/partidosController.js`

**Interfaces:**
- Consumes: `partidosService.crearPartido` (Task 3), `climaService.obtenerPronostico` (Task 2).
- Produces: `GET /api/grupos/:grupoId/partidos` ahora devuelve cada partido con `clima: {disponible, temp, descripcion, icono} | {disponible:false} | null`. `POST /api/grupos/:grupoId/partidos` acepta `estadio`, `tipoSuelo`, `direccion`, `valorCuota` en el body.

- [ ] **Step 1: Actualizar el controller**

Reemplazar el contenido de `backend/src/controllers/partidosController.js`:

```js
const partidosService = require('../services/partidosService');
const inscripcionesService = require('../services/inscripcionesService');
const climaService = require('../services/climaService');
const estadisticasService = require('../services/estadisticasService');

async function listar(req, res) {
  const partidos = await partidosService.listarPartidosVisibles(req.params.grupoId);
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
      clima:
        partido.lat != null && partido.lon != null
          ? await climaService.obtenerPronostico(partido.lat, partido.lon, partido.fecha)
          : null,
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
  const { fecha, cupoTitulares, cupoSuplentes, estadio, tipoSuelo, direccion, valorCuota } = req.body;
  const partido = await partidosService.crearPartido({
    fecha,
    cupoTitulares,
    cupoSuplentes,
    estadio,
    tipoSuelo,
    direccion,
    valorCuota: valorCuota !== undefined && valorCuota !== null ? Number(valorCuota) : null,
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

async function lideresMes(req, res) {
  const lideres = await estadisticasService.obtenerLideresDelMes(req.params.grupoId);
  res.json(lideres);
}

module.exports = { listar, historial, crear, eliminar, lideresMes };
```

- [ ] **Step 2: Agregar la ruta de líderes del mes**

En `backend/src/routes/partidosRoutes.js`, agregar después de la línea 15 (`router.get('/historial', ...)`):

```js
router.get('/lideres-mes', verificarToken, verificarMiembroGrupo(), envolverAsync(partidosController.lideresMes));
```

(La función `obtenerLideresDelMes` se implementa en la Task 5 — esta ruta queda lista para consumirla.)

- [ ] **Step 3: Verificar manualmente**

Con el server corriendo (`npm run dev` en `backend/`) y un token válido:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/grupos/<grupoId>/partidos
```
Confirmar que cada partido trae la clave `clima` (probablemente `null` si el partido de prueba no tiene `direccion` cargada).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/partidosController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): partidos acepta campos extendidos al crear y expone clima + ruta lideres-mes"
```

---

### Task 5: `estadisticasService.obtenerLideresDelMes`

**Files:**
- Modify: `backend/src/services/estadisticasService.js`

**Interfaces:**
- Produces: `obtenerLideresDelMes(grupoId: string): Promise<{ goleadores: {usuarioId, nombre, goles}[], asistidor: {usuarioId, nombre, asistencias} | null }>` — usado por `partidosController.lideresMes` (Task 4, ya wireado).

- [ ] **Step 1: Agregar la función**

En `backend/src/services/estadisticasService.js`, agregar antes del `module.exports`:

```js
async function obtenerLideresDelMes(grupoId) {
  const usuariosService = require('./usuariosService');
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).toISOString();

  const filasGoleadores = db
    .prepare(
      `SELECT g.usuarioId, COUNT(*) as goles
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.enContra = 0 AND p.fecha >= ? AND p.fecha < ?
       GROUP BY g.usuarioId
       ORDER BY goles DESC
       LIMIT 3`
    )
    .all(grupoId, inicioMes, finMes);

  const filaAsistidor = db
    .prepare(
      `SELECT g.asistenciaUsuarioId as usuarioId, COUNT(*) as asistencias
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.asistenciaUsuarioId IS NOT NULL AND p.fecha >= ? AND p.fecha < ?
       GROUP BY g.asistenciaUsuarioId
       ORDER BY asistencias DESC
       LIMIT 1`
    )
    .get(grupoId, inicioMes, finMes);

  const goleadores = await Promise.all(
    filasGoleadores.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', goles: fila.goles };
    })
  );

  let asistidor = null;
  if (filaAsistidor) {
    const usuario = await usuariosService.obtenerUsuario(filaAsistidor.usuarioId);
    asistidor = {
      usuarioId: filaAsistidor.usuarioId,
      nombre: usuario?.nombre || 'Jugador',
      asistencias: filaAsistidor.asistencias,
    };
  }

  return { goleadores, asistidor };
}

module.exports = { obtenerEstadisticasJugador, obtenerEstadisticasTotalesJugador, obtenerLideresDelMes };
```

(Reemplaza el `module.exports` existente por este, que agrega `obtenerLideresDelMes` a los dos exports ya presentes.)

- [ ] **Step 2: Verificar manualmente**

Con el server corriendo y un grupo que tenga partidos `jugado` con goles cargados este mes:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/grupos/<grupoId>/partidos/lideres-mes
```
Esperado: `{ "goleadores": [...], "asistidor": {...} | null }`. Con un grupo sin goles este mes, debe devolver `{ "goleadores": [], "asistidor": null }` sin error.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/estadisticasService.js
git commit -m "feat(backend): agrega obtenerLideresDelMes (top goleadores + asistidor del mes)"
```

---

## Frontend

### Task 6: Helper de título hero en `utils/fecha.js`

**Files:**
- Modify: `frontend/src/utils/fecha.js`

**Interfaces:**
- Produces: `tituloHeroPartido(fechaISO: string): string` — usado por `HeroPartido.jsx` (Task 7).

- [ ] **Step 1: Agregar la función**

En `frontend/src/utils/fecha.js`, agregar debajo de `formatearFechaPartido`:

```js
export function tituloHeroPartido(fechaISO) {
  const fecha = new Date(fechaISO);
  const hoy = new Date();
  const esHoy = fecha.toDateString() === hoy.toDateString();
  const hora = fecha.toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' });

  if (esHoy) {
    return `Hoy tenés partido a las ${hora}`;
  }
  const dia = fecha.toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Próximo partido: ${dia} a las ${hora}`;
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
cd frontend && node -e "
const hoyISO = new Date().toISOString();
const manianaISO = new Date(Date.now()+86400000).toISOString();
// no podemos importar ESM directo con node -e fácil; verificación visual se hace en el navegador en Task 9.
console.log('placeholder — ver Task 9 para verificación visual real');
"
```
(La verificación real de esta función es visual, se confirma cuando se monta `HeroPartido` en Task 9 — este paso solo evita bloquear la tarea en un chequeo ciego.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/fecha.js
git commit -m "feat(frontend): agrega tituloHeroPartido para el header de Home"
```

---

### Task 7: Componente `HeroPartido.jsx`

**Files:**
- Create: `frontend/src/components/HeroPartido.jsx`

**Interfaces:**
- Consumes: `tituloHeroPartido` (Task 6), `Boton` (`frontend/src/components/Boton.jsx`, ya existe).
- Produces: `<HeroPartido partido inscripcionUsuario estaSancionado procesando onAnotarse onSolicitarBaja />` — usado por `Home.jsx` (Task 12).

- [ ] **Step 1: Crear el componente**

```jsx
import Boton from './Boton';
import { tituloHeroPartido } from '../utils/fecha';

export default function HeroPartido({
  partido,
  inscripcionUsuario,
  estaSancionado,
  procesando,
  onAnotarse,
  onSolicitarBaja,
}) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const partidoCompleto = ocupados.titulares >= partido.cupoTitulares && ocupados.suplentes >= partido.cupoSuplentes;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <h1 className="font-display text-4xl leading-none text-white">{tituloHeroPartido(partido.fecha)}</h1>

      {inscripcionUsuario ? (
        <Boton variante="peligro" onClick={onSolicitarBaja} disabled={procesando}>
          {procesando ? 'Procesando…' : 'Darme de baja'}
        </Boton>
      ) : (
        <Boton variante="primario" onClick={onAnotarse} disabled={estaSancionado || partidoCompleto || procesando}>
          {procesando
            ? 'Procesando…'
            : estaSancionado
            ? 'Estás sancionado'
            : partidoCompleto
            ? 'Partido completo'
            : 'Anotarme'}
        </Boton>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/HeroPartido.jsx
git commit -m "feat(frontend): agrega HeroPartido (titulo + boton anotarse/baja)"
```

---

### Task 8: Componente `TarjetaInfoPartido.jsx`

**Files:**
- Create: `frontend/src/components/TarjetaInfoPartido.jsx`

**Interfaces:**
- Consumes: `formatearFechaPartido` (`frontend/src/utils/fecha.js`, ya existe).
- Produces: `<TarjetaInfoPartido partido />` — usado por `Home.jsx` (Task 12). Espera que `partido` pueda traer `numero`, `estadio`, `tipoSuelo`, `direccion`, `valorCuota`, `clima` (todos opcionales/null).

- [ ] **Step 1: Crear el componente**

```jsx
import { formatearFechaPartido } from '../utils/fecha';

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(valor);
}

export default function TarjetaInfoPartido({ partido }) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const totalConfirmados = ocupados.titulares + ocupados.suplentes;
  const totalCupo = partido.cupoTitulares + partido.cupoSuplentes;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/60">
        <span className="capitalize">{formatearFechaPartido(partido.fecha)}</span>
        {partido.numero && <span className="rounded-full bg-white/10 px-2 py-1">Fecha #{partido.numero}</span>}
      </div>

      {(partido.estadio || partido.tipoSuelo || partido.direccion) && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
          {partido.estadio && <span>🏟️ {partido.estadio}</span>}
          {partido.tipoSuelo && <span>🌱 {partido.tipoSuelo}</span>}
          {partido.direccion && <span>📍 {partido.direccion}</span>}
        </div>
      )}

      {partido.clima && (
        <div className="mb-3 text-sm text-white/70">
          {partido.clima.disponible ? (
            <span>☀️ {Math.round(partido.clima.temp)}°C, {partido.clima.descripcion}</span>
          ) : (
            <span className="text-white/40">Pronóstico no disponible aún</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-white/70">
          {totalConfirmados}/{totalCupo} confirmados
        </span>
        {typeof partido.valorCuota === 'number' && (
          <span className="text-sm font-bold text-pasto-500">Cuota: {formatearMoneda(partido.valorCuota)}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TarjetaInfoPartido.jsx
git commit -m "feat(frontend): agrega TarjetaInfoPartido (estadio/suelo/direccion/clima/cupo/valor)"
```

---

### Task 9: Componente `ListaConvocadosScroll.jsx`

**Files:**
- Create: `frontend/src/components/ListaConvocadosScroll.jsx`

**Interfaces:**
- Consumes: `ListaJugadores` (`frontend/src/components/ListaJugadores.jsx`, sin cambios).
- Produces: `<ListaConvocadosScroll {...propsDeListaJugadores} />` — mismas props que `ListaJugadores`, usado por `Home.jsx` (Task 12).

- [ ] **Step 1: Crear el wrapper**

```jsx
import ListaJugadores from './ListaJugadores';

export default function ListaConvocadosScroll(props) {
  return (
    <div className="max-h-80 overflow-y-auto pr-1">
      <ListaJugadores {...props} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ListaConvocadosScroll.jsx
git commit -m "feat(frontend): agrega ListaConvocadosScroll (alto fijo + scroll sobre ListaJugadores)"
```

---

### Task 10: Componente `MvpUltimaFecha.jsx`

**Files:**
- Create: `frontend/src/components/MvpUltimaFecha.jsx`

**Interfaces:**
- Consumes: `api` (`frontend/src/services/api.js`), `rutaGrupo` (`frontend/src/utils/rutasGrupo.js`). Endpoints ya existentes: `GET /partidos/historial`, `GET /partidos/:id/resultado` (este último devuelve `{ marcador, goles: [{usuarioId, enContra, asistenciaUsuarioId}], rendimientos: [{usuarioId, promedio}], jugadorDestacado: { jugadores: [{usuarioId, nombre}], votos, totalElegibles } }`).
- Produces: `<MvpUltimaFecha grupoId />` — usado por `Home.jsx` (Task 12). Renderiza `null` si no hay partido jugado o no hay votos de MVP.

- [ ] **Step 1: Crear el componente**

```jsx
import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function MvpUltimaFecha({ grupoId }) {
  const [mvp, setMvp] = useState(null);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const { data: historial } = await api.get(rutaGrupo(grupoId, '/partidos/historial'));
        const ultimo = historial[0];
        if (!ultimo) return;

        const { data: resultado } = await api.get(rutaGrupo(grupoId, `/partidos/${ultimo.id}/resultado`));
        if (!resultado?.jugadorDestacado?.jugadores?.length) return;

        const destacado = resultado.jugadorDestacado.jugadores[0];
        const goles = resultado.goles.filter((g) => g.usuarioId === destacado.usuarioId && !g.enContra).length;
        const asistencias = resultado.goles.filter((g) => g.asistenciaUsuarioId === destacado.usuarioId).length;
        const rendimiento = resultado.rendimientos.find((r) => r.usuarioId === destacado.usuarioId);
        const porcentajeVotos =
          resultado.jugadorDestacado.totalElegibles > 0
            ? Math.round((resultado.jugadorDestacado.votos / resultado.jugadorDestacado.totalElegibles) * 100)
            : 0;

        if (!cancelado) {
          setMvp({
            nombre: destacado.nombre,
            goles,
            asistencias,
            valoracion: rendimiento?.promedio ?? null,
            porcentajeVotos,
          });
        }
      } catch (err) {
        console.error('Error cargando MVP de la última fecha:', err.message);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [grupoId]);

  if (!mvp) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 text-lg font-bold text-white">MVP de la última fecha</h3>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cancha-700 text-lg font-bold text-white">
          {mvp.nombre?.trim()?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{mvp.nombre}</p>
          <p className="text-sm text-white/60">
            {mvp.goles} Goles • {mvp.asistencias} Asistencias
            {mvp.valoracion !== null && ` • Calificación ${mvp.valoracion}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-pasto-600/20 px-3 py-1 text-xs font-bold text-pasto-500">
          {mvp.porcentajeVotos}% votos
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MvpUltimaFecha.jsx
git commit -m "feat(frontend): agrega MvpUltimaFecha (reusa historial + resultado existentes)"
```

---

### Task 11: Componente `LideresDelMes.jsx`

**Files:**
- Create: `frontend/src/components/LideresDelMes.jsx`

**Interfaces:**
- Consumes: `api`, `rutaGrupo`, endpoint nuevo `GET /partidos/lideres-mes` (Task 4/5) que devuelve `{ goleadores: [{usuarioId, nombre, goles}], asistidor: {usuarioId, nombre, asistencias} | null }`.
- Produces: `<LideresDelMes grupoId />` — usado por `Home.jsx` (Task 12).

- [ ] **Step 1: Crear el componente**

```jsx
import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function LideresDelMes({ grupoId }) {
  const [lideres, setLideres] = useState(null);

  useEffect(() => {
    let cancelado = false;
    api
      .get(rutaGrupo(grupoId, '/partidos/lideres-mes'))
      .then(({ data }) => {
        if (!cancelado) setLideres(data);
      })
      .catch((err) => console.error('Error cargando líderes del mes:', err.message));
    return () => {
      cancelado = true;
    };
  }, [grupoId]);

  if (!lideres || (lideres.goleadores.length === 0 && !lideres.asistidor)) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 text-lg font-bold text-white">Líderes del mes</h3>
      {lideres.goleadores.length > 0 && (
        <ol className="mb-3 flex flex-col gap-1">
          {lideres.goleadores.map((jugador, indice) => (
            <li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/80">
              <span>{indice + 1}. {jugador.nombre}</span>
              <span className="font-bold text-pasto-500">{jugador.goles} Goles</span>
            </li>
          ))}
        </ol>
      )}
      {lideres.asistidor && (
        <p className="flex items-center justify-between text-sm text-albiceleste">
          <span>★ {lideres.asistidor.nombre}</span>
          <span className="font-bold">{lideres.asistidor.asistencias} Asistencias</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LideresDelMes.jsx
git commit -m "feat(frontend): agrega LideresDelMes (top goleadores + asistidor)"
```

---

### Task 12: Rewire de `Home.jsx`

**Files:**
- Modify: `frontend/src/pages/Home.jsx:148-244` (el bloque `return (...)` del componente)

**Interfaces:**
- Consumes: `HeroPartido` (Task 7), `TarjetaInfoPartido` (Task 8), `ListaConvocadosScroll` (Task 9), `MvpUltimaFecha` (Task 10), `LideresDelMes` (Task 11). Todo lo demás en `Home.jsx` (estado, `cargarPartidos`, `anotarse`, `confirmarBaja`, `solicitarBaja`, modales) queda igual.

- [ ] **Step 1: Agregar los imports nuevos**

Al tope de `frontend/src/pages/Home.jsx`, agregar:

```js
import HeroPartido from '../components/HeroPartido';
import TarjetaInfoPartido from '../components/TarjetaInfoPartido';
import ListaConvocadosScroll from '../components/ListaConvocadosScroll';
import MvpUltimaFecha from '../components/MvpUltimaFecha';
import LideresDelMes from '../components/LideresDelMes';
```

- [ ] **Step 2: Separar el primer partido del resto y reemplazar el bloque de render**

Reemplazar (líneas 187-244, el `<div className="flex flex-col gap-4">...</div>` con el `.map`) por:

```jsx
<div className="flex flex-col gap-6">
  {partidos.map((partido, indice) =>
    indice === 0 ? (
      <PartidoConEstado key={partido.id} partido={partido}>
        <div className="flex flex-col gap-4">
          <HeroPartido
            partido={partido}
            inscripcionUsuario={inscripcionDelUsuario(partido.id)}
            estaSancionado={grupoActivo?.estaSancionado}
            procesando={partidoEnProceso === partido.id}
            onAnotarse={() => setPartidoParaAnotarse(partido.id)}
            onSolicitarBaja={() => solicitarBaja(partido)}
          />

          <TarjetaInfoPartido partido={partido} />

          <div
            className={formacionesPorPartido[partido.id] ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : ''}
          >
            <div>
              <ListaConvocadosScroll
                jugadores={inscripcionesPorPartido[partido.id] || []}
                formacion={formacionesPorPartido[partido.id]}
                equiposDefinidos={Boolean(propuestasPorPartido[partido.id]?.votacionEquiposCerrada)}
                grupoId={grupoActivo.id}
              />
            </div>

            {(() => {
              const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
              const esperandoTitulares = ocupados.titulares < partido.cupoTitulares;
              if (!formacionesPorPartido[partido.id]) return null;
              return (
                <div id={`mapa-cancha-${partido.id}`} className="relative">
                  <div className={esperandoTitulares ? 'pointer-events-none blur-sm' : ''}>
                    <MapaCancha
                      partidoId={partido.id}
                      formacion={formacionesPorPartido[partido.id]}
                      esAdmin={grupoActivo?.rol === 'admin'}
                      onGuardado={(data) =>
                        setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))
                      }
                      propuestasInfo={propuestasPorPartido[partido.id]}
                      previewPropuesta={previewPorPartido[partido.id] || null}
                      onPropuesto={cargarPartidos}
                      onSalirPreview={() =>
                        setPreviewPorPartido((anterior) => ({ ...anterior, [partido.id]: null }))
                      }
                      jugadores={inscripcionesPorPartido[partido.id] || []}
                      onPromovido={cargarPartidos}
                    />
                  </div>
                  {esperandoTitulares && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-cancha-900/60">
                      <p className="rounded-lg bg-black/70 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">
                        Esperando a todos los titulares
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (
            <EquiposPosibles
              grupoId={grupoActivo.id}
              partidoId={partido.id}
              datos={propuestasPorPartido[partido.id]}
              esAdmin={grupoActivo?.rol === 'admin'}
              soyTitular={inscripcionDelUsuario(partido.id)?.tipo === 'titular'}
              onActualizado={cargarPartidos}
              onVerEnCancha={(propuesta) => {
                setPreviewPorPartido((anterior) => ({
                  ...anterior,
                  [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
                }));
                document
                  .getElementById(`mapa-cancha-${partido.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          )}

          <MvpUltimaFecha grupoId={grupoActivo.id} />
          <LideresDelMes grupoId={grupoActivo.id} />
        </div>
      </PartidoConEstado>
    ) : (
      <PartidoConEstado key={partido.id} partido={partido}>
        <div
          className={formacionesPorPartido[partido.id] ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : ''}
        >
          {formacionesPorPartido[partido.id] && (
            <div id={`mapa-cancha-${partido.id}`}>
              <MapaCancha
                partidoId={partido.id}
                formacion={formacionesPorPartido[partido.id]}
                esAdmin={grupoActivo?.rol === 'admin'}
                onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
                propuestasInfo={propuestasPorPartido[partido.id]}
                previewPropuesta={previewPorPartido[partido.id] || null}
                onPropuesto={cargarPartidos}
                onSalirPreview={() => setPreviewPorPartido((anterior) => ({ ...anterior, [partido.id]: null }))}
                jugadores={inscripcionesPorPartido[partido.id] || []}
                onPromovido={cargarPartidos}
              />
            </div>
          )}
          <TarjetaPartido
            partido={partido}
            inscripcionUsuario={inscripcionDelUsuario(partido.id)}
            estaSancionado={grupoActivo?.estaSancionado}
            procesando={partidoEnProceso === partido.id}
            onAnotarse={() => setPartidoParaAnotarse(partido.id)}
            onSolicitarBaja={() => solicitarBaja(partido)}
            jugadores={inscripcionesPorPartido[partido.id] || []}
            formacion={formacionesPorPartido[partido.id]}
            equiposDefinidos={Boolean(propuestasPorPartido[partido.id]?.votacionEquiposCerrada)}
            grupoId={grupoActivo.id}
          />
        </div>
        {propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (
          <EquiposPosibles
            grupoId={grupoActivo.id}
            partidoId={partido.id}
            datos={propuestasPorPartido[partido.id]}
            esAdmin={grupoActivo?.rol === 'admin'}
            soyTitular={inscripcionDelUsuario(partido.id)?.tipo === 'titular'}
            onActualizado={cargarPartidos}
            onVerEnCancha={(propuesta) => {
              setPreviewPorPartido((anterior) => ({
                ...anterior,
                [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
              }));
              document
                .getElementById(`mapa-cancha-${partido.id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        )}
      </PartidoConEstado>
    )
  )}
</div>
```

El bloque `else` (índice > 0) es una copia literal del render actual — no cambia comportamiento para partidos que no son el próximo.

- [ ] **Step 3: Levantar y verificar en el navegador**

```bash
cd backend && npm run dev
```
En otra terminal:
```bash
cd frontend && npm run dev
```
Abrir `http://localhost:5173`, entrar a un grupo con al menos un partido abierto. Confirmar:
- El primer partido muestra título hero ("Hoy tenés partido a las HH:MM" si la fecha es hoy, o "Próximo partido: ...") con el botón anotarse/baja al lado.
- Debajo, la tarjeta de info (fecha, `#numero` si el partido lo tiene, estadio/suelo/dirección si están cargados, clima o "Pronóstico no disponible aún", confirmados/cupo, cuota si está cargada).
- El listado de convocados scrollea dentro de una caja de alto fijo.
- Si los titulares no están completos, el mapa de formaciones (cuando existe) se ve blureado con el texto "Esperando a todos los titulares".
- MVP y líderes del mes aparecen debajo (o no se renderizan si no hay datos).
- Si hay un segundo partido abierto/cerrado, se sigue viendo con la tarjeta simple de antes.
- Anotarse y darse de baja desde el botón del hero siguen funcionando (abren los modales de siempre).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat(frontend): rediseña Home con hero, info extendida, convocados scroll, mvp y lideres del mes"
```

---

### Task 13: Formulario de creación de partido en `AdminPanel.jsx` — campos nuevos

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx:11` (`FORMULARIO_INICIAL`)
- Modify: `frontend/src/pages/AdminPanel.jsx:70-89` (`crearPartido`)
- Modify: `frontend/src/pages/AdminPanel.jsx:213-252` (el `<form>` de creación)

**Interfaces:**
- Consumes: `POST /api/grupos/:grupoId/partidos` extendido (Task 4) — acepta `estadio`, `tipoSuelo`, `direccion`, `valorCuota`.

- [ ] **Step 1: Extender el estado inicial del formulario**

Reemplazar:
```js
const FORMULARIO_INICIAL = { fecha: '', cupoTitulares: 10, cupoSuplentes: 5 };
```
por:
```js
const FORMULARIO_INICIAL = {
  fecha: '',
  cupoTitulares: 10,
  cupoSuplentes: 5,
  estadio: '',
  tipoSuelo: '',
  direccion: '',
  valorCuota: '',
};
```

- [ ] **Step 2: Enviar los campos nuevos al crear**

En `crearPartido`, reemplazar el body del `api.post`:
```js
await api.post(rutaGrupo(grupoActivo.id, '/partidos'), {
  fecha: new Date(formulario.fecha).toISOString(),
  cupoTitulares: Number(formulario.cupoTitulares),
  cupoSuplentes: Number(formulario.cupoSuplentes),
});
```
por:
```js
await api.post(rutaGrupo(grupoActivo.id, '/partidos'), {
  fecha: new Date(formulario.fecha).toISOString(),
  cupoTitulares: Number(formulario.cupoTitulares),
  cupoSuplentes: Number(formulario.cupoSuplentes),
  estadio: formulario.estadio || undefined,
  tipoSuelo: formulario.tipoSuelo || undefined,
  direccion: formulario.direccion || undefined,
  valorCuota: formulario.valorCuota !== '' ? Number(formulario.valorCuota) : undefined,
});
```

- [ ] **Step 3: Agregar los inputs al formulario**

Dentro del `<form onSubmit={crearPartido} ...>`, después del campo "Cupo suplentes" (antes del `<Boton type="submit">`), agregar:

```jsx
<label className="flex flex-1 flex-col gap-1 text-sm text-white/70">
  Estadio
  <input
    type="text"
    value={formulario.estadio}
    onChange={(evento) => setFormulario({ ...formulario, estadio: evento.target.value })}
    className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
    placeholder="Ej. El Monumental F7"
  />
</label>
<label className="flex flex-1 flex-col gap-1 text-sm text-white/70">
  Tipo de suelo
  <input
    type="text"
    value={formulario.tipoSuelo}
    onChange={(evento) => setFormulario({ ...formulario, tipoSuelo: evento.target.value })}
    className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
    placeholder="Ej. Sintético Cubierto Pro 7vs7"
  />
</label>
<label className="flex flex-1 flex-col gap-1 text-sm text-white/70">
  Dirección
  <input
    type="text"
    value={formulario.direccion}
    onChange={(evento) => setFormulario({ ...formulario, direccion: evento.target.value })}
    className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
    placeholder="Ej. Av. Álvarez Thomas 1850, CABA"
  />
</label>
<label className="flex flex-col gap-1 text-sm text-white/70">
  Valor por jugador
  <input
    type="number"
    min="0"
    value={formulario.valorCuota}
    onChange={(evento) => setFormulario({ ...formulario, valorCuota: evento.target.value })}
    className="w-28 rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
    placeholder="3000"
  />
</label>
```

- [ ] **Step 4: Verificar manualmente**

Con backend y frontend corriendo, entrar como admin al panel, crear un partido cargando estadio/suelo/dirección/valor, confirmar que el partido creado aparece en Home (Task 12) con esos datos y, si `OPENWEATHER_API_KEY` está seteada, con clima.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminPanel.jsx
git commit -m "feat(frontend): form de crear partido admite estadio/suelo/direccion/valorCuota"
```

---

## Self-Review Notes

- **Cobertura del spec:** modelo de datos (Task 1), clima/geocoding (Task 2, 3, 4), número autoincremental (Task 3), líderes del mes (Task 4, 5), MVP sin endpoint nuevo (Task 10), hero + info extendida + convocados scroll + blur de formaciones (Task 7, 8, 9, 12), form de admin (Task 13). Finanzas/pizarra: fuera de alcance, sin tarea (correcto).
- **Consistencia de tipos:** `partido.clima` es `null | {disponible:false} | {disponible:true, temp, descripcion, icono}` en todas las tareas que lo tocan (4, 8). `lideres-mes` devuelve siempre `{goleadores, asistidor}` (5, 11). `crearPartido` y el controller usan los mismos nombres de campo (`estadio`, `tipoSuelo`, `direccion`, `valorCuota`) de punta a punta.
- **Fallas preexistentes:** confirmadas y documentadas en Global Constraints — no se agregó ninguna tarea para arreglarlas, es trabajo fuera de este alcance.
