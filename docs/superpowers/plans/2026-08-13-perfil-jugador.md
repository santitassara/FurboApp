# Perfil de jugador (datos personales, estado físico y habilidades) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pantalla de "Mi Perfil" donde el jugador completa voluntariamente su nombre a mostrar, fecha de nacimiento, resistencia, ritmo de juego y 6 habilidades numéricas (además de reutilizar las posiciones ya existentes); y una pantalla de solo lectura para ver el perfil de cualquier otro jugador desde el roster.

**Architecture:** 10 columnas nuevas planas en `Usuarios` (mismo patrón que `posicionPrincipal`/`posicionSecundaria`). Dos endpoints nuevos: `PATCH /api/usuarios/me/perfil` (edición propia, con validación de enums/rangos) y `GET /api/usuarios/:uid/perfil` (vista restringida de cualquier jugador, sin datos sensibles). Dos páginas nuevas de frontend: `Perfil.jsx` (formulario editable) y `PerfilJugador.jsx` (solo lectura), enlazada desde `ListaJugadores.jsx`.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React + React Router + Tailwind (frontend), Jest (tests de backend existentes).

**Spec:** `docs/superpowers/specs/2026-08-13-perfil-jugador-design.md`

## Global Constraints

- Columnas nuevas en `Usuarios`, todas nullable: `nombreCompleto` (TEXT), `fechaNacimiento` (TEXT, `YYYY-MM-DD`), `resistencia` (TEXT enum), `ritmoJuego` (TEXT enum), `velocidad`, `pegada`, `tocaPase`, `gambeta`, `marcaDefensa`, `fisico` (todas INTEGER, 0-100).
- Catálogo de resistencia: exactamente `partido_completo`, `medio_partido`, `un_rato`, `no_corro`.
- Catálogo de ritmo de juego: exactamente `juego_seguido`, `juego_poco`, `nunca_juego`.
- El perfil es 100% opcional: a diferencia de las posiciones, ningún campo de esta feature bloquea anotarse a un partido ni fuerza un modal. Las posiciones siguen siendo obligatorias vía el flujo ya existente (`ModalPosicion`), sin cambios.
- `GET /api/usuarios/:uid/perfil` es accesible a cualquier usuario autenticado (no solo admin) pero devuelve una vista restringida: nunca incluye `email`, `rol`, `estaSancionado`, `fechaCreacion`, `passwordHash` ni `fechaNacimiento` cruda (solo la `edad` calculada).
- `PATCH /api/usuarios/me/posiciones` (ya existente) no se modifica ni se elimina.
- Seguir el patrón de nombres en español ya usado en el proyecto y el patrón de errores existente (`error.status` + `manejadorErrores.js` → `{ error: mensaje }`).
- Migraciones de esquema en `db.js` siguen el patrón ya usado (chequear con `PRAGMA table_info` y `ALTER TABLE ... ADD COLUMN` si falta), porque el archivo sqlite de desarrollo ya existe.
- **No agregar tests automatizados nuevos para esta feature** (preferencia explícita del usuario para este proyecto). Verificar manualmente con `node -e` contra `SQLITE_DB_PATH=:memory:` y correr la suite existente (`npm test`) como regresión.

---

### Task 1: Esquema, migración y catálogos de resistencia/ritmo de juego (backend)

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/config/db.js`
- Create: `backend/src/constants/resistencia.js`
- Create: `backend/src/constants/ritmoJuego.js`

**Interfaces:**
- Produces: `RESISTENCIA` (array de 4 strings), `esResistenciaValida(valor)` (bool, acepta `null`/`undefined`); `RITMO_JUEGO` (array de 3 strings), `esRitmoJuegoValido(valor)` (bool, acepta `null`/`undefined`). Ambos consumidos por `usuariosService` en Task 2.

- [ ] **Step 1: Crear el catálogo de resistencia**

Crear `backend/src/constants/resistencia.js`:

```js
const RESISTENCIA = ['partido_completo', 'medio_partido', 'un_rato', 'no_corro'];

function esResistenciaValida(valor) {
  return valor === null || valor === undefined || RESISTENCIA.includes(valor);
}

module.exports = { RESISTENCIA, esResistenciaValida };
```

- [ ] **Step 2: Crear el catálogo de ritmo de juego**

Crear `backend/src/constants/ritmoJuego.js`:

```js
const RITMO_JUEGO = ['juego_seguido', 'juego_poco', 'nunca_juego'];

function esRitmoJuegoValido(valor) {
  return valor === null || valor === undefined || RITMO_JUEGO.includes(valor);
}

module.exports = { RITMO_JUEGO, esRitmoJuegoValido };
```

- [ ] **Step 3: Agregar las columnas al esquema (para DBs nuevas)**

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
```

(El resto del archivo — `Partidos`, `Inscripciones`, el índice — no cambia.)

- [ ] **Step 4: Migrar la DB existente en `db.js`**

En `backend/src/config/db.js`, después del bloque existente que agrega `posicionSecundaria` a `Usuarios` (después de la línea `if (!tienePosicionSecundariaUsuario) { ... }` y antes de `const columnasInscripciones = ...`), agregar:

```js
const columnasPerfilJugador = {
  nombreCompleto: 'TEXT',
  fechaNacimiento: 'TEXT',
  resistencia: 'TEXT',
  ritmoJuego: 'TEXT',
  velocidad: 'INTEGER',
  pegada: 'INTEGER',
  tocaPase: 'INTEGER',
  gambeta: 'INTEGER',
  marcaDefensa: 'INTEGER',
  fisico: 'INTEGER',
};
for (const [columna, tipo] of Object.entries(columnasPerfilJugador)) {
  const yaExiste = columnasUsuarios.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Usuarios ADD COLUMN ${columna} ${tipo}`);
  }
}
```

(Usa la variable `columnasUsuarios` ya declarada más arriba en el archivo — no hace falta volver a consultar `PRAGMA table_info`.)

- [ ] **Step 5: Verificar la migración contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const { db } = require('./src/config/db');
console.log(db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name));
"
```
Expected: la lista incluye `nombreCompleto`, `fechaNacimiento`, `resistencia`, `ritmoJuego`, `velocidad`, `pegada`, `tocaPase`, `gambeta`, `marcaDefensa`, `fisico` (además de las columnas ya existentes).

- [ ] **Step 6: Verificar que la migración no rompe una DB ya existente sin las columnas**

Run:
```bash
cd "backend" && rm -f /tmp/furboapp-migracion-perfil-test.db* && node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/furboapp-migracion-perfil-test.db');
db.exec(\"CREATE TABLE Usuarios (uid TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL, rol TEXT NOT NULL, estaSancionado INTEGER NOT NULL DEFAULT 0, fechaCreacion TEXT NOT NULL, posicionPrincipal TEXT, posicionSecundaria TEXT)\");
db.exec(\"CREATE TABLE Inscripciones (id TEXT PRIMARY KEY, partidoId TEXT NOT NULL, usuarioId TEXT NOT NULL, estado TEXT NOT NULL, tipo TEXT NOT NULL, orden INTEGER NOT NULL, fechaInscripcion TEXT NOT NULL, posicionPrincipal TEXT, posicionSecundaria TEXT)\");
db.close();
" && SQLITE_DB_PATH=/tmp/furboapp-migracion-perfil-test.db node -e "
const { db } = require('./src/config/db');
console.log(db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name));
" && rm -f /tmp/furboapp-migracion-perfil-test.db*
```
Expected: la lista incluye las 10 columnas nuevas sin errores (simula el caso real: DB de desarrollo ya creada antes de este cambio, ya con las columnas de posiciones de la feature previa).

- [ ] **Step 7: Correr la suite de backend para confirmar que nada se rompió**

Run: `cd "backend" && npm test`
Expected: todos los tests existentes en verde (columnas nuevas nullable no afectan ningún `INSERT`/assert existente).

- [ ] **Step 8: Commit**

```bash
git add backend/src/db/schema.sql backend/src/config/db.js backend/src/constants/resistencia.js backend/src/constants/ritmoJuego.js
git commit -m "feat(backend): agregar columnas de perfil de jugador y catalogos de resistencia/ritmo"
```

---

### Task 2: Servicio de perfil (validación, `actualizarPerfil`, `obtenerPerfilPublico`)

**Files:**
- Modify: `backend/src/services/usuariosService.js`

**Interfaces:**
- Consumes: `sonPosicionesValidas` de `backend/src/constants/posiciones.js` (ya existente); `esResistenciaValida` de `backend/src/constants/resistencia.js` (Task 1); `esRitmoJuegoValido` de `backend/src/constants/ritmoJuego.js` (Task 1).
- Produces: `usuariosService.actualizarPerfil(uid, datos)` → Promise<usuario> (mismo shape que `obtenerUsuario`); `usuariosService.obtenerPerfilPublico(uid)` → Promise<perfilRestringido>. Ambos consumidos por el controller en Task 3.

- [ ] **Step 1: Agregar los requires de catálogos**

En `backend/src/services/usuariosService.js`, reemplazar la línea:

```js
const { sonPosicionesValidas } = require('../constants/posiciones');
```

por:

```js
const { sonPosicionesValidas } = require('../constants/posiciones');
const { esResistenciaValida } = require('../constants/resistencia');
const { esRitmoJuegoValido } = require('../constants/ritmoJuego');
```

- [ ] **Step 2: Agregar los helpers de validación y normalización**

Agregar, después de `filaAUsuario` (antes de `obtenerAdminEmails`):

```js
function normalizarVacio(valor) {
  return valor === '' || valor === undefined ? null : valor;
}

function esHabilidadValida(valor) {
  return valor === null || (Number.isInteger(valor) && valor >= 0 && valor <= 100);
}

function esFechaNacimientoValida(valor) {
  if (valor === null) return true;
  const fecha = new Date(valor);
  return !Number.isNaN(fecha.getTime()) && fecha.getTime() <= Date.now();
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const noLlegoElCumpleanios =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (noLlegoElCumpleanios) edad -= 1;
  return edad;
}
```

- [ ] **Step 3: Agregar `actualizarPerfil`**

Agregar la función después de `actualizarPosiciones`:

```js
async function actualizarPerfil(uid, datos = {}) {
  const nombreCompleto = normalizarVacio(datos.nombreCompleto);
  const fechaNacimiento = normalizarVacio(datos.fechaNacimiento);
  const { posicionPrincipal, posicionSecundaria } = datos;
  const resistencia = normalizarVacio(datos.resistencia);
  const ritmoJuego = normalizarVacio(datos.ritmoJuego);
  const habilidades = {
    velocidad: normalizarVacio(datos.velocidad),
    pegada: normalizarVacio(datos.pegada),
    tocaPase: normalizarVacio(datos.tocaPase),
    gambeta: normalizarVacio(datos.gambeta),
    marcaDefensa: normalizarVacio(datos.marcaDefensa),
    fisico: normalizarVacio(datos.fisico),
  };

  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    const error = new Error('Posiciones inválidas');
    error.status = 400;
    throw error;
  }
  if (!esResistenciaValida(resistencia)) {
    const error = new Error('Resistencia inválida');
    error.status = 400;
    throw error;
  }
  if (!esRitmoJuegoValido(ritmoJuego)) {
    const error = new Error('Ritmo de juego inválido');
    error.status = 400;
    throw error;
  }
  for (const [campo, valor] of Object.entries(habilidades)) {
    if (!esHabilidadValida(valor)) {
      const error = new Error(`La habilidad "${campo}" debe ser un número entero entre 0 y 100`);
      error.status = 400;
      throw error;
    }
  }
  if (!esFechaNacimientoValida(fechaNacimiento)) {
    const error = new Error('Fecha de nacimiento inválida');
    error.status = 400;
    throw error;
  }

  db.prepare(
    `UPDATE Usuarios SET
      nombreCompleto = @nombreCompleto,
      fechaNacimiento = @fechaNacimiento,
      posicionPrincipal = @posicionPrincipal,
      posicionSecundaria = @posicionSecundaria,
      resistencia = @resistencia,
      ritmoJuego = @ritmoJuego,
      velocidad = @velocidad,
      pegada = @pegada,
      tocaPase = @tocaPase,
      gambeta = @gambeta,
      marcaDefensa = @marcaDefensa,
      fisico = @fisico
     WHERE uid = @uid`
  ).run({
    uid,
    nombreCompleto,
    fechaNacimiento,
    posicionPrincipal,
    posicionSecundaria,
    resistencia,
    ritmoJuego,
    ...habilidades,
  });
  return obtenerUsuario(uid);
}
```

- [ ] **Step 4: Agregar `obtenerPerfilPublico`**

Agregar la función después de `actualizarPerfil`:

```js
async function obtenerPerfilPublico(uid) {
  const fila = db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);
  if (!fila) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  return {
    uid: fila.uid,
    nombre: fila.nombre,
    nombreCompleto: fila.nombreCompleto,
    edad: calcularEdad(fila.fechaNacimiento),
    posicionPrincipal: fila.posicionPrincipal,
    posicionSecundaria: fila.posicionSecundaria,
    resistencia: fila.resistencia,
    ritmoJuego: fila.ritmoJuego,
    velocidad: fila.velocidad,
    pegada: fila.pegada,
    tocaPase: fila.tocaPase,
    gambeta: fila.gambeta,
    marcaDefensa: fila.marcaDefensa,
    fisico: fila.fisico,
  };
}
```

- [ ] **Step 5: Exportar las funciones nuevas**

Actualizar el `module.exports` al final del archivo, agregando `actualizarPerfil` y `obtenerPerfilPublico`:

```js
module.exports = {
  sincronizarUsuario,
  obtenerUsuario,
  listarSancionados,
  perdonarSancion,
  sancionar,
  actualizarPosiciones,
  actualizarPerfil,
  obtenerPerfilPublico,
  registrarConPassword,
  autenticarConPassword,
};
```

- [ ] **Step 6: Verificar manualmente contra una DB en memoria**

Run:
```bash
cd "backend" && SQLITE_DB_PATH=:memory: node -e "
const usuariosService = require('./src/services/usuariosService');
(async () => {
  await usuariosService.sincronizarUsuario({ uid: 'test1', email: 't1@gmail.com', nombre: 'Test Uno' });

  const actualizado = await usuariosService.actualizarPerfil('test1', {
    nombreCompleto: 'Testigo Uno',
    fechaNacimiento: '1995-06-15',
    posicionPrincipal: 'arquero',
    posicionSecundaria: 'defensor',
    resistencia: 'medio_partido',
    ritmoJuego: 'juego_seguido',
    velocidad: 80, pegada: 40, tocaPase: 70, gambeta: 60, marcaDefensa: 30, fisico: 55,
  });
  console.log('OK actualizado:', actualizado.nombreCompleto, actualizado.resistencia, actualizado.velocidad);

  const publico = await usuariosService.obtenerPerfilPublico('test1');
  console.log('OK publico:', publico);
  console.log('OK sin datos sensibles:', publico.email === undefined && publico.rol === undefined && publico.fechaNacimiento === undefined);

  try {
    await usuariosService.actualizarPerfil('test1', {
      posicionPrincipal: 'arquero', posicionSecundaria: 'defensor',
      resistencia: 'invalido', ritmoJuego: 'juego_seguido',
    });
    console.log('ERROR: no debería aceptar resistencia inválida');
  } catch (e) {
    console.log('OK rechazo resistencia:', e.status, e.message);
  }

  try {
    await usuariosService.actualizarPerfil('test1', {
      posicionPrincipal: 'arquero', posicionSecundaria: 'defensor',
      velocidad: 150,
    });
    console.log('ERROR: no debería aceptar velocidad fuera de rango');
  } catch (e) {
    console.log('OK rechazo habilidad:', e.status, e.message);
  }

  try {
    await usuariosService.actualizarPerfil('test1', {
      posicionPrincipal: 'arquero', posicionSecundaria: 'defensor',
      fechaNacimiento: '2099-01-01',
    });
    console.log('ERROR: no debería aceptar fecha futura');
  } catch (e) {
    console.log('OK rechazo fecha:', e.status, e.message);
  }

  try {
    await usuariosService.obtenerPerfilPublico('no-existe');
    console.log('ERROR: no debería encontrar un uid inexistente');
  } catch (e) {
    console.log('OK rechazo 404:', e.status, e.message);
  }
})();
"
```
Expected:
```
OK actualizado: Testigo Uno medio_partido 80
OK publico: { uid: 'test1', nombre: 'Test Uno', nombreCompleto: 'Testigo Uno', edad: 31, ... }
OK sin datos sensibles: true
OK rechazo resistencia: 400 Resistencia inválida
OK rechazo habilidad: 400 La habilidad "velocidad" debe ser un número entero entre 0 y 100
OK rechazo fecha: 400 Fecha de nacimiento inválida
OK rechazo 404: 404 Usuario no encontrado
```
(El valor exacto de `edad` depende de la fecha del sistema; con fecha de nacimiento `1995-06-15` y hoy `2026-08-13` da `31`.)

- [ ] **Step 7: Correr la suite de backend**

Run: `cd "backend" && npm test`
Expected: todos los tests en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/usuariosService.js
git commit -m "feat(backend): agregar actualizarPerfil y obtenerPerfilPublico al servicio de usuarios"
```

---

### Task 3: Endpoints `PATCH /me/perfil` y `GET /:uid/perfil`

**Files:**
- Modify: `backend/src/controllers/usuariosController.js`
- Modify: `backend/src/routes/usuariosRoutes.js`

**Interfaces:**
- Consumes: `usuariosService.actualizarPerfil` y `usuariosService.obtenerPerfilPublico` (Task 2).
- Produces: rutas `PATCH /api/usuarios/me/perfil` y `GET /api/usuarios/:uid/perfil`, consumidas por `AuthContext`/`Perfil.jsx`/`PerfilJugador.jsx` en Tasks 4-6.

- [ ] **Step 1: Agregar los controllers**

En `backend/src/controllers/usuariosController.js`, agregar después de `actualizarMisPosiciones`:

```js
async function actualizarMiPerfil(req, res) {
  const usuario = await usuariosService.actualizarPerfil(req.usuario.uid, req.body);
  res.json(usuario);
}

async function obtenerPerfilDeJugador(req, res) {
  const perfil = await usuariosService.obtenerPerfilPublico(req.params.uid);
  res.json(perfil);
}
```

Actualizar el `module.exports`:

```js
module.exports = {
  listarSancionados,
  perdonar,
  actualizarMisPosiciones,
  actualizarMiPerfil,
  obtenerPerfilDeJugador,
};
```

- [ ] **Step 2: Agregar las rutas**

En `backend/src/routes/usuariosRoutes.js`, agregar después de `router.patch('/me/posiciones', ...)` (antes de `module.exports`):

```js
router.patch('/me/perfil', verificarToken, envolverAsync(usuariosController.actualizarMiPerfil));
router.get('/:uid/perfil', verificarToken, envolverAsync(usuariosController.obtenerPerfilDeJugador));
```

- [ ] **Step 3: Correr la suite de backend**

Run: `cd "backend" && npm test`
Expected: todo en verde (este task no cambia el service, solo cablea rutas ya probadas en Task 2).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/usuariosController.js backend/src/routes/usuariosRoutes.js
git commit -m "feat(backend): agregar endpoints PATCH /usuarios/me/perfil y GET /usuarios/:uid/perfil"
```

---

### Task 4: Catálogos de resistencia/ritmo de juego y `actualizarMiPerfil` (frontend)

**Files:**
- Create: `frontend/src/constants/resistencia.js`
- Create: `frontend/src/constants/ritmoJuego.js`
- Modify: `frontend/src/context/AuthContext.jsx`

**Interfaces:**
- Produces: `RESISTENCIA` (array de `{ valor, etiqueta }`), `etiquetaResistencia(valor)`; `RITMO_JUEGO` (array de `{ valor, etiqueta }`), `etiquetaRitmoJuego(valor)` — usados por `Perfil.jsx` (Task 5) y `PerfilJugador.jsx` (Task 6). `useAuth().actualizarMiPerfil(datos)` → Promise<void>, actualiza `perfil` en el contexto — usado por `Perfil.jsx` (Task 5).

- [ ] **Step 1: Crear el catálogo de resistencia**

Crear `frontend/src/constants/resistencia.js`:

```js
export const RESISTENCIA = [
  { valor: 'partido_completo', etiqueta: 'Todo el partido' },
  { valor: 'medio_partido', etiqueta: 'Medio partido' },
  { valor: 'un_rato', etiqueta: 'Un rato y me canso' },
  { valor: 'no_corro', etiqueta: 'No sé si puedo correr siquiera' },
];

export function etiquetaResistencia(valor) {
  return RESISTENCIA.find((r) => r.valor === valor)?.etiqueta || 'Sin dato';
}
```

- [ ] **Step 2: Crear el catálogo de ritmo de juego**

Crear `frontend/src/constants/ritmoJuego.js`:

```js
export const RITMO_JUEGO = [
  { valor: 'juego_seguido', etiqueta: 'Juego seguido' },
  { valor: 'juego_poco', etiqueta: 'Juego poco' },
  { valor: 'nunca_juego', etiqueta: 'Nunca juego' },
];

export function etiquetaRitmoJuego(valor) {
  return RITMO_JUEGO.find((r) => r.valor === valor)?.etiqueta || 'Sin dato';
}
```

- [ ] **Step 3: Agregar `actualizarMiPerfil` al `AuthContext`**

En `frontend/src/context/AuthContext.jsx`, agregar la función después de `actualizarPosicionesPerfil`:

```js
async function actualizarMiPerfil(datos) {
  const { data } = await api.patch('/usuarios/me/perfil', datos);
  setPerfil(data);
}
```

Agregar `actualizarMiPerfil` al objeto `valor` que expone el provider (junto a `actualizarPosicionesPerfil`).

- [ ] **Step 4: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 5: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/constants/resistencia.js frontend/src/constants/ritmoJuego.js frontend/src/context/AuthContext.jsx
git commit -m "feat(frontend): agregar catalogos de resistencia/ritmo y actualizarMiPerfil"
```

---

### Task 5: Página `Perfil.jsx` (formulario editable) + ruta + link desde `Home`

**Files:**
- Create: `frontend/src/pages/Perfil.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `useAuth().perfil`, `useAuth().actualizarMiPerfil` (Task 4); `POSICIONES` de `frontend/src/constants/posiciones.js` (ya existente); `RESISTENCIA`, `RITMO_JUEGO` (Task 4).

- [ ] **Step 1: Crear la página `Perfil.jsx`**

Crear `frontend/src/pages/Perfil.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Boton from '../components/Boton';
import { POSICIONES } from '../constants/posiciones';
import { RESISTENCIA } from '../constants/resistencia';
import { RITMO_JUEGO } from '../constants/ritmoJuego';

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

export default function Perfil() {
  const { perfil, actualizarMiPerfil } = useAuth();
  const [datos, setDatos] = useState({
    nombreCompleto: perfil?.nombreCompleto || '',
    fechaNacimiento: perfil?.fechaNacimiento ? perfil.fechaNacimiento.slice(0, 10) : '',
    posicionPrincipal: perfil?.posicionPrincipal || '',
    posicionSecundaria: perfil?.posicionSecundaria || '',
    resistencia: perfil?.resistencia || '',
    ritmoJuego: perfil?.ritmoJuego || '',
    velocidad: perfil?.velocidad ?? 50,
    pegada: perfil?.pegada ?? 50,
    tocaPase: perfil?.tocaPase ?? 50,
    gambeta: perfil?.gambeta ?? 50,
    marcaDefensa: perfil?.marcaDefensa ?? 50,
    fisico: perfil?.fisico ?? 50,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  const posicionesIguales =
    datos.posicionPrincipal && datos.posicionSecundaria && datos.posicionPrincipal === datos.posicionSecundaria;
  const puedeGuardar = datos.posicionPrincipal && datos.posicionSecundaria && !posicionesIguales && !guardando;

  function actualizarCampo(campo, valor) {
    setDatos((anterior) => ({ ...anterior, [campo]: valor }));
    setGuardado(false);
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await actualizarMiPerfil({
        ...datos,
        velocidad: Number(datos.velocidad),
        pegada: Number(datos.pegada),
        tocaPase: Number(datos.tocaPase),
        gambeta: Number(datos.gambeta),
        marcaDefensa: Number(datos.marcaDefensa),
        fisico: Number(datos.fisico),
      });
      setGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-pasto-500">Mi Perfil</h1>
        <Link to="/inicio" className="text-sm font-semibold text-albiceleste hover:underline">
          Volver
        </Link>
      </header>

      <form onSubmit={guardar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Nombre completo</label>
          <input
            type="text"
            value={datos.nombreCompleto}
            onChange={(evento) => actualizarCampo('nombreCompleto', evento.target.value)}
            placeholder={perfil?.nombre}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder:text-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Fecha de nacimiento</label>
          <input
            type="date"
            value={datos.fechaNacimiento}
            onChange={(evento) => actualizarCampo('fechaNacimiento', evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-white/50">Posición principal</label>
            <select
              value={datos.posicionPrincipal}
              onChange={(evento) => actualizarCampo('posicionPrincipal', evento.target.value)}
              className="rounded-lg bg-white/10 px-4 py-2 text-white"
            >
              <option value="" disabled className="bg-cancha-800 text-white">
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className="bg-cancha-800 text-white">
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-white/50">Posición secundaria</label>
            <select
              value={datos.posicionSecundaria}
              onChange={(evento) => actualizarCampo('posicionSecundaria', evento.target.value)}
              className="rounded-lg bg-white/10 px-4 py-2 text-white"
            >
              <option value="" disabled className="bg-cancha-800 text-white">
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className="bg-cancha-800 text-white">
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>
        {posicionesIguales && (
          <p className="text-sm text-sancion">La secundaria tiene que ser distinta de la principal.</p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Resistencia</label>
          <select
            value={datos.resistencia}
            onChange={(evento) => actualizarCampo('resistencia', evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" className="bg-cancha-800 text-white">
              Sin especificar
            </option>
            {RESISTENCIA.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className="bg-cancha-800 text-white">
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Ritmo de juego</label>
          <select
            value={datos.ritmoJuego}
            onChange={(evento) => actualizarCampo('ritmoJuego', evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" className="bg-cancha-800 text-white">
              Sin especificar
            </option>
            {RITMO_JUEGO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className="bg-cancha-800 text-white">
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-pasto-500">Habilidades</h2>
          {HABILIDADES.map(({ campo, etiqueta }) => (
            <div key={campo} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs uppercase text-white/50">
                <span>{etiqueta}</span>
                <span className="text-white/90">{datos[campo]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={datos[campo]}
                onChange={(evento) => actualizarCampo(campo, evento.target.value)}
                className="w-full"
              />
            </div>
          ))}
        </div>

        {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
        {guardado && !error && <p className="text-sm text-pasto-500">Perfil guardado.</p>}

        <Boton type="submit" disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : 'Guardar perfil'}
        </Boton>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Agregar la ruta en `App.jsx`**

En `frontend/src/App.jsx`, agregar el import:

```js
import Perfil from './pages/Perfil';
```

Agregar la ruta después de la ruta `/inicio` (antes de `/admin`):

```jsx
<Route
  path="/perfil"
  element={
    <RutaPrivada>
      <Perfil />
    </RutaPrivada>
  }
/>
```

- [ ] **Step 3: Agregar el link "Mi Perfil" en `Home.jsx`**

En `frontend/src/pages/Home.jsx`, en el `<header>`, agregar el link junto a `BadgeSancion` (antes del link de "Panel admin"):

```jsx
<Link to="/perfil" className="text-sm font-semibold text-albiceleste hover:underline">
  Mi Perfil
</Link>
```

(El import de `Link` ya existe en `Home.jsx`.)

- [ ] **Step 4: Verificar el build**

Run: `cd "frontend" && npm run build`
Expected: build exitoso.

- [ ] **Step 5: Lint**

Run: `cd "frontend" && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Perfil.jsx frontend/src/App.jsx frontend/src/pages/Home.jsx
git commit -m "feat(frontend): agregar pagina de perfil editable y link desde Home"
```

---

### Task 6: Página `PerfilJugador.jsx` (solo lectura) + ruta

**Files:**
- Create: `frontend/src/pages/PerfilJugador.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/usuarios/:uid/perfil` (Task 3); `etiquetaPosicion` de `frontend/src/constants/posiciones.js` (ya existente); `etiquetaResistencia`, `etiquetaRitmoJuego` (Task 4).

- [ ] **Step 1: Crear la página `PerfilJugador.jsx`**

Crear `frontend/src/pages/PerfilJugador.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

export default function PerfilJugador() {
  const { uid } = useParams();
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    api
      .get(`/usuarios/${uid}/perfil`)
      .then(({ data }) => {
        if (activo) setPerfil(data);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [uid]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-pasto-500">Perfil del jugador</h1>
        <Link to="/inicio" className="text-sm font-semibold text-albiceleste hover:underline">
          Volver
        </Link>
      </header>

      {cargando && <p className="text-white/60">Cargando…</p>}
      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {perfil && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-lg font-bold text-white">{perfil.nombreCompleto || perfil.nombre}</p>
            <p className="text-sm text-white/60">
              {perfil.edad != null ? `${perfil.edad} años` : 'Edad no informada'}
            </p>
          </div>

          <div className="text-sm text-white/80">
            <p>
              Posición: {etiquetaPosicion(perfil.posicionPrincipal)}
              {perfil.posicionSecundaria && ` / ${etiquetaPosicion(perfil.posicionSecundaria)}`}
            </p>
            <p>Resistencia: {etiquetaResistencia(perfil.resistencia)}</p>
            <p>Ritmo de juego: {etiquetaRitmoJuego(perfil.ritmoJuego)}</p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-pasto-500">Habilidades</h2>
            {HABILIDADES.map(({ campo, etiqueta }) => (
              <div key={campo} className="flex items-center justify-between text-sm text-white/80">
                <span>{etiqueta}</span>
                <span>{perfil[campo] ?? 'Sin dato'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Agregar la ruta en `App.jsx`**

En `frontend/src/App.jsx`, agregar el import:

```js
import PerfilJugador from './pages/PerfilJugador';
```

Agregar la ruta después de la ruta `/perfil`:

```jsx
<Route
  path="/jugadores/:uid"
  element={
    <RutaPrivada>
      <PerfilJugador />
    </RutaPrivada>
  }
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
git add frontend/src/pages/PerfilJugador.jsx frontend/src/App.jsx
git commit -m "feat(frontend): agregar pagina de solo lectura del perfil de un jugador"
```

---

### Task 7: Link desde `ListaJugadores` al perfil de cada jugador

**Files:**
- Modify: `frontend/src/components/ListaJugadores.jsx`

**Interfaces:**
- Consumes: ruta `/jugadores/:uid` (Task 6); `jugador.usuarioId` (ya presente en cada elemento de la lista).

- [ ] **Step 1: Envolver el nombre en un `Link`**

En `frontend/src/components/ListaJugadores.jsx`, agregar el import:

```js
import { Link } from 'react-router-dom';
```

Reemplazar, en el `<li>` de titulares:

```jsx
<span>
  {jugador.nombre}
  <span className="ml-2 text-xs text-white/50">
```

por:

```jsx
<span>
  <Link to={`/jugadores/${jugador.usuarioId}`} className="hover:underline">
    {jugador.nombre}
  </Link>
  <span className="ml-2 text-xs text-white/50">
```

Y, en el `<li>` de suplentes, el mismo reemplazo:

```jsx
<span>
  {jugador.nombre}
  <span className="ml-2 text-xs text-white/50">
```

por:

```jsx
<span>
  <Link to={`/jugadores/${jugador.usuarioId}`} className="hover:underline">
    {jugador.nombre}
  </Link>
  <span className="ml-2 text-xs text-white/50">
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
git commit -m "feat(frontend): enlazar nombre del roster al perfil del jugador"
```

---

## Verificación manual sugerida (fuera del alcance de los tests automatizados)

Después de completar los 7 tasks, levantar `backend` (`npm run dev`) y `frontend` (`npm run dev`) y probar en el navegador:
1. Loguearse, ir a "Mi Perfil" desde Home, completar nombre completo, fecha de nacimiento, resistencia, ritmo de juego y las 6 habilidades, guardar — confirmar que persiste al recargar la página.
2. Con el nombre completo vacío, confirmar que el roster de un partido sigue mostrando el nombre de Google/registro (fallback).
3. Ir a un partido con jugadores anotados, hacer clic en el nombre de otro jugador en el roster — confirmar que se ve su perfil de solo lectura con edad calculada correctamente y sin ningún dato sensible (email, rol, sanción) visible en la página ni en la respuesta de red.
4. Intentar guardar el perfil sin posición principal/secundaria (o con ambas iguales) — confirmar que el botón "Guardar perfil" queda deshabilitado y se muestra el mensaje de error correspondiente.
