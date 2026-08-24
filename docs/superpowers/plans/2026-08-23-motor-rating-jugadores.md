# Motor de rating progresivo de jugadores — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las votaciones de rendimiento post-partido muevan gradualmente las 6 habilidades del perfil de cada jugador, ponderadas por la posición jugada, vía un cierre de votación explícito del admin.

**Architecture:** Un endpoint nuevo (`POST .../cerrar-votacion`) congela los votos de un partido y dispara, en una única transacción, un motor de rating (`ratingService.js`) que calcula la mediana de los votos por jugador, la compara contra su OVR actual, y ajusta sus 6 habilidades con una fórmula estilo Elo ponderada por posición. El frontend agrega un botón de admin para disparar ese cierre.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend, sin cambios de librerías), React + Axios (frontend, sin cambios de librerías).

**Spec:** `docs/superpowers/specs/2026-08-23-motor-rating-jugadores-design.md`

## Global Constraints

- No se agregan tests automatizados nuevos en este plan (preferencia del usuario para este proyecto, ya establecida en trabajo previo) — cada tarea cierra con una verificación manual documentada en el paso, no con un archivo `*.test.js` nuevo. No romper la suite de Jest existente (`cd backend && npm test`).
- Rango de habilidades: 0-100 (ya validado en `usuariosService.esHabilidadValida`), sin cambios de rango.
- `K = 5` fijo (dentro del rango 3-5 sugerido por el enunciado original).
- Las 4 posiciones del sistema (`arquero`, `defensor`, `mediocampista`, `delantero`, de `backend/src/constants/posiciones.js`) no cambian — no se agregan posiciones granulares.
- Todo cambio de esquema SQLite va en dos lugares: `backend/src/db/schema.sql` (estado deseado, usado por DBs nuevas y por los tests vía `tests/helpers/testDb.js`) **y** un guard de migración en `backend/src/config/db.js` (para DBs ya existentes en disco) — así es como ya funciona este repo, no es un patrón nuevo.

---

### Task 1: Migración de esquema — `votacionCerrada` y habilidades a REAL

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js`

**Interfaces:**
- Produces: columna `Partidos.votacionCerrada` (INTEGER 0/1, default 0) y columnas `Usuarios.velocidad/pegada/tocaPase/gambeta/marcaDefensa/fisico` con tipo REAL — todas las tareas siguientes leen/escriben estas columnas.

- [ ] **Step 1: Editar `schema.sql`**

En el bloque `CREATE TABLE IF NOT EXISTS Partidos`, agregar la columna al final (antes del `)`):

```sql
  recordatorioPostPartidoEnviado INTEGER NOT NULL DEFAULT 0,
  votacionCerrada INTEGER NOT NULL DEFAULT 0
);
```

En el bloque `CREATE TABLE IF NOT EXISTS Usuarios`, cambiar el tipo de las 6 columnas de habilidad de `INTEGER` a `REAL`:

```sql
  velocidad REAL,
  pegada REAL,
  tocaPase REAL,
  gambeta REAL,
  marcaDefensa REAL,
  fisico REAL,
```

- [ ] **Step 2: Agregar el guard de migración de `votacionCerrada` en `db.js`**

Justo después del bloque existente de `recordatorioPostPartidoEnviado` (busca `tieneRecordatorioPostPartidoEnviado`), agregar:

```js
const tieneVotacionCerrada = columnasPartidos.some((columna) => columna.name === 'votacionCerrada');
if (!tieneVotacionCerrada) {
  db.exec('ALTER TABLE Partidos ADD COLUMN votacionCerrada INTEGER NOT NULL DEFAULT 0');
}
```

- [ ] **Step 3: Agregar la migración de tipo de las habilidades en `db.js`**

Al final del archivo, justo antes de `module.exports = { db };`, agregar (usa el rebuild estándar de SQLite para cambiar tipo de columna — SQLite no soporta `ALTER COLUMN TYPE` directo):

```js
const columnasUsuariosParaRebuild = db.prepare('PRAGMA table_info(Usuarios)').all();
const columnaVelocidad = columnasUsuariosParaRebuild.find((columna) => columna.name === 'velocidad');
if (columnaVelocidad && columnaVelocidad.type === 'INTEGER') {
  db.exec(`
    CREATE TABLE Usuarios_nueva (
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
      velocidad REAL,
      pegada REAL,
      tocaPase REAL,
      gambeta REAL,
      marcaDefensa REAL,
      fisico REAL,
      suscripcionPush TEXT,
      piernaHabil TEXT
    );
    INSERT INTO Usuarios_nueva SELECT
      uid, nombre, email, esSuperAdmin, fechaCreacion, passwordHash,
      posicionPrincipal, posicionSecundaria, nombreCompleto, fechaNacimiento,
      resistencia, ritmoJuego, velocidad, pegada, tocaPase, gambeta,
      marcaDefensa, fisico, suscripcionPush, piernaHabil
    FROM Usuarios;
    DROP TABLE Usuarios;
    ALTER TABLE Usuarios_nueva RENAME TO Usuarios;
  `);
}
```

Esto debe quedar como el **último** bloque de migración del archivo (después del bloque que borra `rol`/`estaSancionado`), para garantizar que todas las columnas de `Usuarios` ya existen cuando se arma la lista de columnas del rebuild.

- [ ] **Step 4: Verificar que la suite existente sigue en verde**

Run: `cd "backend" && npm test`
Expected: todos los tests pasan (usan `schema.sql` directo vía `tests/helpers/testDb.js`, así que valida el Step 1).

- [ ] **Step 5: Verificar la migración contra una copia de la DB real (sin tocar la DB real)**

```bash
cp "backend/data/furboapp.db" /tmp/furboapp-migracion-test.db
SQLITE_DB_PATH=/tmp/furboapp-migracion-test.db node -e "require('./backend/src/config/db')"
sqlite3 /tmp/furboapp-migracion-test.db "PRAGMA table_info(Usuarios);" | grep -E "velocidad|pegada|tocaPase|gambeta|marcaDefensa|fisico"
sqlite3 /tmp/furboapp-migracion-test.db "PRAGMA table_info(Partidos);" | grep votacionCerrada
sqlite3 /tmp/furboapp-migracion-test.db "SELECT COUNT(*) FROM Usuarios;"
```

Expected: las 6 columnas de habilidad muestran tipo `real`, `votacionCerrada` aparece en `Partidos`, y el `COUNT(*)` de `Usuarios` es el mismo que antes de migrar (sin pérdida de filas). Borrar `/tmp/furboapp-migracion-test.db` al terminar.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js
git commit -m "feat(backend): agregar votacionCerrada y habilidades REAL para el motor de rating"
```

---

### Task 2: Matriz de pesos por posición

**Files:**
- Create: `backend/src/constants/pesosPosicion.js`

**Interfaces:**
- Produces: `K_RATING` (number) y `PESOS_POSICION` (objeto `{ [posicion]: { velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico } }`, una fila por cada valor de `POSICIONES` en `backend/src/constants/posiciones.js`) — usado por Task 3.

- [ ] **Step 1: Crear el archivo de constantes**

```js
const K_RATING = 5;

const PESOS_POSICION = {
  delantero: {
    velocidad: 0.225,
    gambeta: 0.25,
    pegada: 0.275,
    marcaDefensa: 0.05,
    tocaPase: 0.125,
    fisico: 0.075,
  },
  mediocampista: {
    velocidad: 0.1,
    gambeta: 0.15,
    pegada: 0.1,
    marcaDefensa: 0.15,
    tocaPase: 0.35,
    fisico: 0.15,
  },
  defensor: {
    velocidad: 0.175,
    gambeta: 0.075,
    pegada: 0.05,
    marcaDefensa: 0.375,
    tocaPase: 0.125,
    fisico: 0.2,
  },
  arquero: {
    velocidad: 0.1,
    gambeta: 0,
    pegada: 0,
    marcaDefensa: 0.5,
    tocaPase: 0.15,
    fisico: 0.25,
  },
};

module.exports = { K_RATING, PESOS_POSICION };
```

- [ ] **Step 2: Verificar que cada fila suma 1.0**

Run:
```bash
node -e "
const { PESOS_POSICION } = require('./backend/src/constants/pesosPosicion');
for (const [posicion, pesos] of Object.entries(PESOS_POSICION)) {
  const suma = Object.values(pesos).reduce((a, b) => a + b, 0);
  console.log(posicion, suma);
}
"
```
Expected: las 4 líneas imprimen `1` (o `0.9999999999999999` por redondeo flotante, aceptable).

- [ ] **Step 3: Commit**

```bash
git add backend/src/constants/pesosPosicion.js
git commit -m "feat(backend): matriz de pesos por posicion para el motor de rating"
```

---

### Task 3: Motor de rating (`ratingService.js`)

**Files:**
- Create: `backend/src/services/ratingService.js`
- Modify: `backend/src/services/usuariosService.js` (exportar `CAMPOS_HABILIDAD`)

**Interfaces:**
- Consumes: `resultadosService.obtenerElegibles(partidoId): Promise<string[]>` (ya existe), `partidosService.obtenerPartido(partidoId, grupoId): Promise<Partido|null>` (ya existe), `usuariosService.obtenerUsuario(uid): Promise<Usuario|null>` (ya existe), `PESOS_POSICION`/`K_RATING` de Task 2, `CAMPOS_HABILIDAD` (nuevo export de `usuariosService`).
- Produces: `ratingService.calcularMediana(numeros: number[]): number` y `ratingService.cerrarVotacion(partidoId: string, grupoId: string): Promise<{ procesados: Array<{usuarioId, nombre, mediana, ovrPrevio, cambios}>, saltados: Array<{usuarioId, nombre, motivo}> }>` — usados por Task 5 (controller).

- [ ] **Step 1: Exportar `CAMPOS_HABILIDAD` desde `usuariosService.js`**

Ese archivo ya define, cerca de la línea 235:
```js
const CAMPOS_HABILIDAD = ['velocidad', 'pegada', 'tocaPase', 'gambeta', 'marcaDefensa', 'fisico'];
```
Agregar `CAMPOS_HABILIDAD,` al `module.exports` final de ese archivo (junto a `calcularPromedioHabilidades` y los demás).

- [ ] **Step 2: Crear `ratingService.js`**

```js
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const resultadosService = require('./resultadosService');
const usuariosService = require('./usuariosService');
const { CAMPOS_HABILIDAD } = usuariosService;
const { K_RATING, PESOS_POSICION } = require('../constants/pesosPosicion');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function calcularMediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return (ordenados[medio - 1] + ordenados[medio]) / 2;
  }
  return ordenados[medio];
}

function clamp(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function procesarPartido(partidoId, elegibles) {
  const procesados = [];
  const saltados = [];

  for (const jugadorId of elegibles) {
    const puntajes = db
      .prepare('SELECT puntaje FROM RendimientosJugador WHERE partidoId = ? AND jugadorId = ?')
      .all(partidoId, jugadorId)
      .map((fila) => fila.puntaje);

    if (puntajes.length === 0) {
      saltados.push({ usuarioId: jugadorId, motivo: 'sin_votos' });
      continue;
    }

    const usuario = db
      .prepare(
        `SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico
         FROM Usuarios WHERE uid = ?`
      )
      .get(jugadorId);

    if (CAMPOS_HABILIDAD.some((campo) => usuario[campo] == null)) {
      saltados.push({ usuarioId: jugadorId, motivo: 'perfil_incompleto' });
      continue;
    }

    const inscripcion = db
      .prepare(
        `SELECT posicionPrincipal FROM Inscripciones
         WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado' AND tipo = 'titular'`
      )
      .get(partidoId, jugadorId);
    const pesos = PESOS_POSICION[inscripcion.posicionPrincipal];

    const mediana = calcularMediana(puntajes);
    const puntajeEscalado = mediana * 10;
    const ovrPrevio =
      CAMPOS_HABILIDAD.reduce((suma, campo) => suma + usuario[campo], 0) / CAMPOS_HABILIDAD.length;

    const nuevosValores = {};
    const cambios = {};
    for (const campo of CAMPOS_HABILIDAD) {
      const delta = (K_RATING * pesos[campo] * (puntajeEscalado - ovrPrevio)) / 100;
      const nuevo = clamp(usuario[campo] + delta, 0, 100);
      nuevosValores[campo] = nuevo;
      cambios[campo] = Math.round((nuevo - usuario[campo]) * 1000) / 1000;
    }

    db.prepare(
      `UPDATE Usuarios SET
         velocidad = @velocidad, pegada = @pegada, tocaPase = @tocaPase,
         gambeta = @gambeta, marcaDefensa = @marcaDefensa, fisico = @fisico
       WHERE uid = @uid`
    ).run({ ...nuevosValores, uid: jugadorId });

    procesados.push({
      usuarioId: jugadorId,
      mediana,
      ovrPrevio: Math.round(ovrPrevio * 10) / 10,
      cambios,
    });
  }

  return { procesados, saltados };
}

async function cerrarVotacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') {
    throw crearError('El partido todavía no tiene resultado cargado', 400);
  }
  if (partido.votacionCerrada) {
    throw crearError('La votación de este partido ya está cerrada', 400);
  }

  const elegibles = await resultadosService.obtenerElegibles(partidoId);

  let resultadoCrudo;
  const ejecutar = db.transaction(() => {
    db.prepare('UPDATE Partidos SET votacionCerrada = 1 WHERE id = ?').run(partidoId);
    resultadoCrudo = procesarPartido(partidoId, elegibles);
  });
  ejecutar();

  const conNombre = async (item) => {
    const usuario = await usuariosService.obtenerUsuario(item.usuarioId);
    return { ...item, nombre: usuario?.nombre || 'Jugador' };
  };

  const procesados = await Promise.all(resultadoCrudo.procesados.map(conNombre));
  const saltados = await Promise.all(resultadoCrudo.saltados.map(conNombre));

  return { procesados, saltados };
}

module.exports = { calcularMediana, cerrarVotacion };
```

- [ ] **Step 3: Verificar manualmente con un fixture (script descartable, no se commitea)**

Crear `/tmp/verificar-rating.js`:

```js
const { crearDbDeTest } = require('./backend/tests/helpers/testDb');
const mockDb = crearDbDeTest();

require.cache[require.resolve('./backend/src/config/db')] = {
  id: require.resolve('./backend/src/config/db'),
  filename: require.resolve('./backend/src/config/db'),
  loaded: true,
  exports: { db: mockDb },
};

const usuariosService = require('./backend/src/services/usuariosService');
const partidosService = require('./backend/src/services/partidosService');
const resultadosService = require('./backend/src/services/resultadosService');
const ratingService = require('./backend/src/services/ratingService');

async function main() {
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES ('g1', 'Grupo test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run();

  await usuariosService.sincronizarUsuario({ uid: 'admin-1', email: 'admin@gmail.com', nombre: 'Admin' });
  await usuariosService.sincronizarUsuario({ uid: 'juan', email: 'juan@gmail.com', nombre: 'Juan' });
  await usuariosService.sincronizarUsuario({ uid: 'votante1', email: 'v1@gmail.com', nombre: 'Votante 1' });
  await usuariosService.sincronizarUsuario({ uid: 'votante2', email: 'v2@gmail.com', nombre: 'Votante 2' });

  // Juan arranca con las 6 habilidades en 70 (OVR = 70 exacto)
  mockDb
    .prepare(
      `UPDATE Usuarios SET velocidad=70, pegada=70, tocaPase=70, gambeta=70, marcaDefensa=70, fisico=70 WHERE uid='juan'`
    )
    .run();

  const partido = await partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 0,
    creadoPor: 'admin-1',
    grupoId: 'g1',
  });

  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo, posicionPrincipal, posicionSecundaria)
       VALUES ('i1', @partidoId, 'juan', 'anotado', 'titular', 0, '2026-01-01T00:00:00.000Z', 'A', 'delantero', 'mediocampista')`
    )
    .run({ partidoId: partido.id });
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo, posicionPrincipal, posicionSecundaria)
       VALUES ('i2', @partidoId, 'votante1', 'anotado', 'titular', 1, '2026-01-01T00:00:00.000Z', 'B', 'defensor', 'mediocampista')`
    )
    .run({ partidoId: partido.id });

  mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
  await resultadosService.guardarResultado(partido.id, 'g1', {});

  // Mediana de [8, 9] = 8.5 -> P = 85 (votos directos a la tabla, simulando 2 votantes)
  mockDb
    .prepare(
      `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje) VALUES ('r1', @partidoId, 'juan', 'votante1', 8)`
    )
    .run({ partidoId: partido.id });
  mockDb
    .prepare(
      `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje) VALUES ('r2', @partidoId, 'juan', 'admin-1', 9)`
    )
    .run({ partidoId: partido.id });

  const resumen = await ratingService.cerrarVotacion(partido.id, 'g1');
  console.log(JSON.stringify(resumen, null, 2));

  const juanActualizado = mockDb.prepare('SELECT pegada FROM Usuarios WHERE uid = ?').get('juan');
  const esperado = 70 + (5 * 0.275 * (85 - 70)) / 100; // 70.20625
  console.log('pegada nueva:', juanActualizado.pegada, '- esperado:', esperado);
  console.log('diferencia:', Math.abs(juanActualizado.pegada - esperado) < 1e-9 ? 'OK' : 'FALLA');
}

main();
```

Run: `node /tmp/verificar-rating.js`

Expected: imprime el resumen con `procesados` conteniendo a `juan` con `mediana: 8.5`, `ovrPrevio: 70`, y `pegada nueva: 70.20625... - diferencia: OK`. Borrar `/tmp/verificar-rating.js` al terminar.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/ratingService.js backend/src/services/usuariosService.js
git commit -m "feat(backend): motor de rating progresivo por posicion"
```

---

### Task 4: Bloquear votos después del cierre

**Files:**
- Modify: `backend/src/services/votosService.js:12-18`

**Interfaces:**
- Consumes: `partido.votacionCerrada` (de Task 1).

- [ ] **Step 1: Agregar el chequeo en `guardarVotos`**

En `votosService.js`, justo después de:
```js
  if (partido.estado !== 'jugado') {
    throw crearError('El partido todavía no tiene resultado cargado', 400);
  }
```
agregar:
```js
  if (partido.votacionCerrada) {
    throw crearError('La votación de este partido está cerrada', 400);
  }
```

- [ ] **Step 2: Verificar que la suite existente sigue en verde**

Run: `cd backend && npm test -- votosService`
Expected: todos los tests de `tests/services/votosService.test.js` siguen pasando (usan `votacionCerrada = 0` por default, no se ven afectados).

- [ ] **Step 3: Verificar el bloqueo manualmente**

Reusar el script de Task 3 Step 4 (o una copia): después de `ratingService.cerrarVotacion(partido.id, 'g1')`, intentar:
```js
  await votosService.guardarVotos(partido.id, 'g1', 'votante1', { valoraciones: [{ jugadorId: 'juan', puntaje: 5 }] })
    .then(() => console.log('FALLA: dejó votar'))
    .catch((err) => console.log('OK, rechazado con status', err.status));
```
Expected: imprime `OK, rechazado con status 400`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/votosService.js
git commit -m "fix(backend): rechazar votos despues de cerrar la votacion del partido"
```

---

### Task 5: Endpoint `cerrar-votacion`

**Files:**
- Modify: `backend/src/controllers/votosController.js`
- Modify: `backend/src/routes/partidosRoutes.js`

**Interfaces:**
- Consumes: `ratingService.cerrarVotacion(partidoId, grupoId)` (Task 3).
- Produces: `POST /api/grupos/:grupoId/partidos/:partidoId/cerrar-votacion` (solo admin del grupo o Super Admin, vía `verificarMiembroGrupo('admin')` que ya existe) — usado por Task 6 (frontend).

- [ ] **Step 1: Agregar el handler en `votosController.js`**

```js
const ratingService = require('../services/ratingService');

async function cerrarVotacion(req, res) {
  const resumen = await ratingService.cerrarVotacion(req.params.partidoId, req.params.grupoId);
  res.json(resumen);
}

module.exports = { guardar, obtenerMios, cerrarVotacion };
```
(agregar el `require` arriba del archivo junto a `votosService`, y sumar `cerrarVotacion` al `module.exports` existente sin sacar `guardar`/`obtenerMios`).

- [ ] **Step 2: Agregar la ruta en `partidosRoutes.js`**

Después de la línea:
```js
router.post('/:partidoId/votos', verificarToken, verificarMiembroGrupo(), envolverAsync(votosController.guardar));
```
agregar:
```js
router.post(
  '/:partidoId/cerrar-votacion',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(votosController.cerrarVotacion)
);
```

- [ ] **Step 3: Verificar que la ruta quedó registrada**

Run:
```bash
node -e "
const router = require('./backend/src/routes/partidosRoutes');
const encontrada = router.stack.some((capa) => capa.route?.path === '/:partidoId/cerrar-votacion' && capa.route.methods.post);
console.log(encontrada ? 'OK: ruta registrada' : 'FALLA: ruta no encontrada');
"
```
Expected: `OK: ruta registrada`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/votosController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): endpoint POST cerrar-votacion"
```

---

### Task 6: Botón "Cerrar votación" en el frontend

**Files:**
- Modify: `frontend/src/components/ItemHistorialPartido.jsx`

**Interfaces:**
- Consumes: `POST /api/grupos/:grupoId/partidos/:partidoId/cerrar-votacion` (Task 5), `partido.votacionCerrada` (llega automáticamente en el objeto `partido` porque el historial hace `SELECT *  FROM Partidos`, sin cambios de backend necesarios para esto), `grupoActivo.rol` de `useGrupo()` (ya usado en este mismo archivo para el botón "Eliminar").

- [ ] **Step 1: Agregar el estado y la función**

En `ItemHistorialPartido.jsx`, junto a los demás `useState` (después de `const [eliminando, setEliminando] = useState(false);`):
```js
  const [cerrandoVotacion, setCerrandoVotacion] = useState(false);
```

Junto a `confirmarEliminar`, agregar:
```js
  async function confirmarCerrarVotacion() {
    const confirmado = window.confirm(
      '¿Cerrar la votación y actualizar las habilidades de los jugadores? Esta acción no se puede deshacer.'
    );
    if (!confirmado) return;

    setCerrandoVotacion(true);
    setError('');
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/cerrar-votacion`));
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setCerrandoVotacion(false);
    }
  }
```

- [ ] **Step 2: Agregar el botón**

En el `div` que ya contiene el botón "Eliminar" (`className="mt-3 flex gap-2"`), agregar antes del botón "Eliminar":
```jsx
                {grupoActivo?.rol === 'admin' && !partido.votacionCerrada && (
                  <button
                    type="button"
                    onClick={confirmarCerrarVotacion}
                    disabled={cerrandoVotacion}
                    className="rounded-lg bg-cancha-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cancha-600 disabled:opacity-50"
                  >
                    {cerrandoVotacion ? 'Cerrando…' : 'Cerrar votación'}
                  </button>
                )}
```

- [ ] **Step 3: Verificar visualmente**

Run: `cd frontend && npm run dev`

Con el navegador: entrar como admin de un grupo con al menos un partido en estado `jugado`, expandir su fila en el historial, confirmar que aparece el botón "Cerrar votación" junto a "Eliminar". Click → aparece el `confirm` nativo del navegador → aceptar → la página recarga y el botón ya no aparece (porque `partido.votacionCerrada` ahora es `1`). Repetir el intento de "Calificar jugadores" para ese partido y confirmar que el backend lo rechaza (mensaje de error visible, gracias al Task 4).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ItemHistorialPartido.jsx
git commit -m "feat(frontend): boton de admin para cerrar votacion del partido"
```

---

## Self-Review

**Cobertura del spec:** modelo de datos (Task 1), matriz de pesos (Task 2), motor/fórmula/mediana/OVR/skip-players (Task 3), bloqueo de votos post-cierre (Task 4), endpoint de cierre con validaciones 404/400/403 — el 403 lo cubre `verificarMiembroGrupo('admin')` ya existente, reusado sin duplicar lógica (Task 5), UI de disparo (Task 6). Los "Casos de error" del spec están cubiertos: partido no jugado (Task 3, `cerrarVotacion`), ya cerrado (ídem), sin rol admin (middleware existente), votar tras cierre (Task 4), sin votos / perfil incompleto (Task 3, `procesarPartido`).

**Nota sobre el ejemplo numérico del enunciado original:** el ejemplo de Juan (Delantero, Pegada 75→75.3) usaba el peso de Pegada de la fila "Delantero (DC)" pura (40%). Como la matriz implementada promedia DC+Extremo para la posición `delantero` (aprobado en el diseño), el peso real de Pegada quedó en 27.5%, no 40%. El Step 4 de la Task 3 verifica el cálculo con el peso realmente implementado (0.275), no con el 0.40 del enunciado original — es la fórmula correcta según lo aprobado, no un bug.
