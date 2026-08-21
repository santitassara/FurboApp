# Selección de Formación Táctica por Equipo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin choose a named soccer formation (or a custom "Libre" line layout) per team when building the lineup for a partido, replacing the always-even automatic line split.

**Architecture:** A static formation catalog (backend `data/formaciones.js`, mirrored in frontend `utils/formaciones.js`) maps "players per team" (5–11) to named formations, each expressed as an ordered list of `{key, cantidad}` field lines (defense → attack). The existing auto-balance algorithm in `inscripcionesService.js` is generalized from "always split evenly" to "fill this exact per-team shape," reusing and extending the goalkeeper-overflow pattern that already exists. No database schema changes — the chosen formation is not persisted; it only shapes how `Inscripciones.linea` values get assigned when generating or saving a lineup.

**Tech Stack:** Node.js/Express/better-sqlite3 (backend), React/Vite + `@dnd-kit/core` (frontend), Jest (backend tests only — no frontend automated tests per project convention).

**Spec:** `docs/superpowers/specs/2026-08-21-formaciones-tacticas-design.md`

## Global Constraints

- No new SQLite tables/columns. `Inscripciones.linea` stays a free-form TEXT column.
- Formation selection is ephemeral (not persisted); reopening a partido before it's generated/saved requires re-choosing.
- Valid field-line keys: `defensa`, `medio`, `medioContencion`, `medioOfensivo`, `delantero` (plus `arquero`, always fixed at 1, never part of the `lineas` array). A formation never mixes `medio` with `medioContencion`/`medioOfensivo`.
- Within a team, when its formation splits `medio` into `medioContencion`/`medioOfensivo`, fill contención first from the team's already skill-sorted midfielders — no inter-team balancing at that sub-level (confirmed with user).
- Frontend gets zero automated tests (confirmed project convention). Backend gets Jest tests for all new logic.

---

## Task 1: Backend formation catalog

**Files:**
- Create: `backend/src/data/formaciones.js`
- Test: `backend/tests/data/formaciones.test.js`

**Interfaces:**
- Produces (consumed by Task 2):
  - `FORMACIONES_POR_CANTIDAD: { [cantidadJugadores: number]: Array<{ codigo: string, nombre: string, lineas: Array<{key: string, cantidad: number}> }> }`
  - `LINEAS_CAMPO: string[]` — `['defensa', 'medio', 'medioContencion', 'medioOfensivo', 'delantero']`
  - `TODAS_LAS_LINEAS: string[]` — `['arquero', ...LINEAS_CAMPO]`
  - `CODIGO_AUTOMATICO: 'automatico'`, `CODIGO_LIBRE: 'libre'`
  - `listarFormaciones(cantidadJugadores: number): Array<{codigo, nombre, lineas}>`
  - `resolverLineas(cantidadJugadores: number, seleccion?: {codigo?: string, lineas?: Array<{key,cantidad}>}): Array<{key: string, cantidad: number}>` — throws `Error` with `.status = 400` on invalid input.
  - `capacidadBroad(lineas: Array<{key,cantidad}>): {arquero: 1, defensa: number, medio: number, delantero: number}` — folds `medioContencion`/`medioOfensivo` into `medio`.

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/data/formaciones.test.js
const {
  FORMACIONES_POR_CANTIDAD,
  LINEAS_CAMPO,
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  listarFormaciones,
  resolverLineas,
  capacidadBroad,
} = require('../../src/data/formaciones');

describe('catálogo de formaciones — invariantes', () => {
  it('cada formación suma exactamente la cantidad de jugadores del grupo', () => {
    for (const [cantidadTexto, formaciones] of Object.entries(FORMACIONES_POR_CANTIDAD)) {
      const cantidadJugadores = Number(cantidadTexto);
      for (const formacion of formaciones) {
        const suma = formacion.lineas.reduce((acc, l) => acc + l.cantidad, 0);
        expect(suma + 1).toBe(cantidadJugadores);
      }
    }
  });

  it('ninguna formación mezcla "medio" con "medioContencion"/"medioOfensivo"', () => {
    for (const formaciones of Object.values(FORMACIONES_POR_CANTIDAD)) {
      for (const formacion of formaciones) {
        const keys = formacion.lineas.map((l) => l.key);
        const tieneMedio = keys.includes('medio');
        const tieneSplit = keys.includes('medioContencion') || keys.includes('medioOfensivo');
        expect(tieneMedio && tieneSplit).toBe(false);
      }
    }
  });

  it('si tiene medioContencion también tiene medioOfensivo (y viceversa)', () => {
    for (const formaciones of Object.values(FORMACIONES_POR_CANTIDAD)) {
      for (const formacion of formaciones) {
        const keys = formacion.lineas.map((l) => l.key);
        expect(keys.includes('medioContencion')).toBe(keys.includes('medioOfensivo'));
      }
    }
  });

  it('solo usa keys válidas', () => {
    for (const formaciones of Object.values(FORMACIONES_POR_CANTIDAD)) {
      for (const formacion of formaciones) {
        for (const linea of formacion.lineas) {
          expect(LINEAS_CAMPO).toContain(linea.key);
        }
      }
    }
  });

  it('fútbol 5 y fútbol 11 tienen las cantidades de formaciones esperadas', () => {
    expect(FORMACIONES_POR_CANTIDAD[5]).toHaveLength(5);
    expect(FORMACIONES_POR_CANTIDAD[11]).toHaveLength(15);
  });
});

describe('listarFormaciones', () => {
  it('devuelve las formaciones de fútbol 5 para cantidadJugadores=5', () => {
    const lista = listarFormaciones(5);
    expect(lista.map((f) => f.codigo)).toEqual(
      expect.arrayContaining(['1-2-1', '2-2', '2-1-1', '1-1-2', '3-1'])
    );
  });

  it('devuelve un arreglo vacío para una cantidad sin catálogo (ej. 3)', () => {
    expect(listarFormaciones(3)).toEqual([]);
  });
});

describe('resolverLineas', () => {
  it('sin selección, usa el algoritmo automático parejo', () => {
    const lineas = resolverLineas(5, undefined);
    expect(lineas).toEqual([
      { key: 'defensa', cantidad: 1 },
      { key: 'medio', cantidad: 2 },
      { key: 'delantero', cantidad: 1 },
    ]);
  });

  it('con codigo "automatico" explícito, igual resultado', () => {
    expect(resolverLineas(5, { codigo: CODIGO_AUTOMATICO })).toEqual([
      { key: 'defensa', cantidad: 1 },
      { key: 'medio', cantidad: 2 },
      { key: 'delantero', cantidad: 1 },
    ]);
  });

  it('con un codigo del catálogo, devuelve esas líneas (ignora "lineas" del body)', () => {
    const lineas = resolverLineas(5, { codigo: '2-2', lineas: [{ key: 'delantero', cantidad: 99 }] });
    expect(lineas).toEqual([
      { key: 'defensa', cantidad: 2 },
      { key: 'delantero', cantidad: 2 },
    ]);
  });

  it('rechaza un codigo que no existe para esa cantidad de jugadores', () => {
    expect(() => resolverLineas(5, { codigo: '4-4-2' })).toThrow(/no está disponible/);
    try {
      resolverLineas(5, { codigo: '4-4-2' });
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });

  it('con codigo "libre" válido, devuelve las líneas tal cual', () => {
    const lineas = resolverLineas(5, {
      codigo: CODIGO_LIBRE,
      lineas: [{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 2 }],
    });
    expect(lineas).toEqual([{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 2 }]);
  });

  it('con codigo "libre" cuya suma no coincide, lanza 400', () => {
    expect(() =>
      resolverLineas(5, { codigo: CODIGO_LIBRE, lineas: [{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 3 }] })
    ).toThrow();
  });

  it('con codigo "libre" que mezcla medio con medioOfensivo, lanza error', () => {
    expect(() =>
      resolverLineas(11, {
        codigo: CODIGO_LIBRE,
        lineas: [
          { key: 'defensa', cantidad: 4 },
          { key: 'medio', cantidad: 4 },
          { key: 'medioOfensivo', cantidad: 1 },
          { key: 'delantero', cantidad: 1 },
        ],
      })
    ).toThrow();
  });
});

describe('capacidadBroad', () => {
  it('suma medioContencion + medioOfensivo en "medio"', () => {
    expect(
      capacidadBroad([
        { key: 'defensa', cantidad: 4 },
        { key: 'medioContencion', cantidad: 2 },
        { key: 'medioOfensivo', cantidad: 3 },
        { key: 'delantero', cantidad: 1 },
      ])
    ).toEqual({ arquero: 1, defensa: 4, medio: 5, delantero: 1 });
  });

  it('formación de 2 líneas deja "medio" en 0', () => {
    expect(
      capacidadBroad([{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 2 }])
    ).toEqual({ arquero: 1, defensa: 2, medio: 0, delantero: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/data/formaciones.test.js`
Expected: FAIL with "Cannot find module '../../src/data/formaciones'"

- [ ] **Step 3: Write the catalog and helpers**

```js
// backend/src/data/formaciones.js
const { generarLineas } = require('../utils/formacion');

const LINEAS_CAMPO = ['defensa', 'medio', 'medioContencion', 'medioOfensivo', 'delantero'];
const TODAS_LAS_LINEAS = ['arquero', ...LINEAS_CAMPO];
const CODIGO_AUTOMATICO = 'automatico';
const CODIGO_LIBRE = 'libre';

function l(pares) {
  return pares.map(([key, cantidad]) => ({ key, cantidad }));
}

const FORMACIONES_POR_CANTIDAD = {
  5: [
    { codigo: '1-2-1', nombre: 'El Rombo', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2', nombre: 'El Cuadrado', lineas: l([['defensa', 2], ['delantero', 2]]) },
    { codigo: '2-1-1', nombre: 'La Y invertida', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-1-2', nombre: 'La Y', lineas: l([['defensa', 1], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1', nombre: 'El Muro', lineas: l([['defensa', 3], ['delantero', 1]]) },
  ],
  6: [
    { codigo: '2-2-1', nombre: 'El clásico', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-1-2', nombre: 'Variante ofensiva', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1-1', nombre: 'Contención pura', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-3-1', nombre: 'El rombo ampliado', lineas: l([['defensa', 1], ['medio', 3], ['delantero', 1]]) },
    { codigo: '1-2-2', nombre: 'Posesión con dos puntas', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 2]]) },
  ],
  7: [
    { codigo: '2-3-1', nombre: 'La más usada', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 1]]) },
    { codigo: '3-2-1', nombre: 'Árbol de Navidad', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2-2', nombre: 'En bloques', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 2]]) },
    { codigo: '3-1-2', nombre: 'Defensiva con peso ofensivo', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 2]]) },
    { codigo: '2-1-3', nombre: 'Ultraofensiva', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 3]]) },
  ],
  8: [
    { codigo: '3-3-1', nombre: 'El estándar', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-3-2', nombre: 'Ofensiva con repliegue', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-2-2', nombre: 'Sólida', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 2]]) },
    { codigo: '2-4-1', nombre: 'Dominio del mediocampo', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-2-1', nombre: 'Catenaccio', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 1]]) },
  ],
  9: [
    { codigo: '3-3-2', nombre: 'El clásico escalado', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-1', nombre: 'Prioriza las bandas', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-1', nombre: 'Para aguantar un resultado', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-4-2', nombre: 'Presión alta', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-2-3', nombre: 'Doble 5 con tres atacantes', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 3]]) },
  ],
  10: [
    { codigo: '4-4-1', nombre: 'La típica de expulsión', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-2', nombre: 'A buscar el partido', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-2', nombre: 'Sin perder volumen ofensivo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-5-1', nombre: 'Dominar la posesión con 10', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 1]]) },
    { codigo: '5-3-1', nombre: 'Cerrar el partido', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 1]]) },
  ],
  11: [
    { codigo: '4-4-2', nombre: 'Clásico o en Rombo', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    { codigo: '4-3-3', nombre: 'Fútbol ofensivo puro', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 3]]) },
    { codigo: '4-5-1', nombre: 'Defensiva y de contragolpe', lineas: l([['defensa', 4], ['medio', 5], ['delantero', 1]]) },
    { codigo: '4-2-4', nombre: 'Muy antigua (Brasil 58)', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 4]]) },
    { codigo: '3-5-2', nombre: 'Mucho peso en el medio', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 2]]) },
    { codigo: '3-4-3', nombre: 'Presión alta y vértigo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 3]]) },
    { codigo: '5-3-2', nombre: 'Contragolpe directo', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 2]]) },
    { codigo: '5-4-1', nombre: 'El autobús', lineas: l([['defensa', 5], ['medio', 4], ['delantero', 1]]) },
    { codigo: '5-2-3', nombre: 'Salida rápida con extremos', lineas: l([['defensa', 5], ['medio', 2], ['delantero', 3]]) },
    {
      codigo: '4-2-3-1',
      nombre: 'Estándar moderno',
      lineas: l([['defensa', 4], ['medioContencion', 2], ['medioOfensivo', 3], ['delantero', 1]]),
    },
    {
      codigo: '4-1-4-1',
      nombre: 'Estabilidad con tapón',
      lineas: l([['defensa', 4], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 1]]),
    },
    { codigo: '4-4-1-1', nombre: 'Con mediapunta libre', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    {
      codigo: '4-3-1-2',
      nombre: 'Enganche sudamericano',
      lineas: l([['defensa', 4], ['medioContencion', 3], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-4-1-2 / 3-4-2-1',
      nombre: 'Variante del 3-5-2 con enganche',
      lineas: l([['defensa', 3], ['medioContencion', 4], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-1-4-2',
      nombre: 'Mediocentro posicional',
      lineas: l([['defensa', 3], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 2]]),
    },
  ],
};

function normalizarAutomatico(cantidadJugadores) {
  const { defensa, medio, delantero } = generarLineas(cantidadJugadores);
  return l([['defensa', defensa], ['medio', medio], ['delantero', delantero]]).filter((linea) => linea.cantidad > 0);
}

function crearErrorFormacion(mensaje) {
  const error = new Error(mensaje);
  error.status = 400;
  return error;
}

function validarLineasLibres(cantidadJugadores, lineas) {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw crearErrorFormacion('lineas debe ser un arreglo no vacío');
  }
  const keysVistas = new Set();
  let suma = 0;
  for (const linea of lineas) {
    if (!linea || !LINEAS_CAMPO.includes(linea.key)) {
      throw crearErrorFormacion(`key de línea inválida: ${linea?.key}`);
    }
    if (keysVistas.has(linea.key)) {
      throw crearErrorFormacion(`la línea "${linea.key}" está repetida`);
    }
    if (!Number.isInteger(linea.cantidad) || linea.cantidad <= 0) {
      throw crearErrorFormacion(`cantidad inválida para la línea "${linea.key}"`);
    }
    keysVistas.add(linea.key);
    suma += linea.cantidad;
  }
  const tieneMedio = keysVistas.has('medio');
  const tieneSplit = keysVistas.has('medioContencion') || keysVistas.has('medioOfensivo');
  if (tieneMedio && tieneSplit) {
    throw crearErrorFormacion('no se puede combinar "medio" con "medioContencion"/"medioOfensivo"');
  }
  if (keysVistas.has('medioContencion') !== keysVistas.has('medioOfensivo')) {
    throw crearErrorFormacion('"medioContencion" y "medioOfensivo" deben ir juntas');
  }
  if (suma + 1 !== cantidadJugadores) {
    throw crearErrorFormacion(`las líneas deben sumar ${cantidadJugadores - 1} jugadores de campo`);
  }
}

function listarFormaciones(cantidadJugadores) {
  return FORMACIONES_POR_CANTIDAD[cantidadJugadores] || [];
}

function resolverLineas(cantidadJugadores, seleccion) {
  const codigo = seleccion?.codigo || CODIGO_AUTOMATICO;

  if (codigo === CODIGO_AUTOMATICO) {
    return normalizarAutomatico(cantidadJugadores);
  }

  if (codigo === CODIGO_LIBRE) {
    validarLineasLibres(cantidadJugadores, seleccion.lineas);
    return seleccion.lineas.map(({ key, cantidad }) => ({ key, cantidad }));
  }

  const entrada = listarFormaciones(cantidadJugadores).find((formacion) => formacion.codigo === codigo);
  if (!entrada) {
    throw crearErrorFormacion(`La formación "${codigo}" no está disponible para ${cantidadJugadores} jugadores por equipo`);
  }
  return entrada.lineas.map(({ key, cantidad }) => ({ key, cantidad }));
}

function capacidadBroad(lineas) {
  const cap = { arquero: 1, defensa: 0, medio: 0, delantero: 0 };
  for (const { key, cantidad } of lineas) {
    if (key === 'medioContencion' || key === 'medioOfensivo' || key === 'medio') cap.medio += cantidad;
    else cap[key] += cantidad;
  }
  return cap;
}

module.exports = {
  FORMACIONES_POR_CANTIDAD,
  LINEAS_CAMPO,
  TODAS_LAS_LINEAS,
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  listarFormaciones,
  resolverLineas,
  capacidadBroad,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/data/formaciones.test.js`
Expected: PASS (all suites green)

- [ ] **Step 5: Commit**

```bash
git add backend/src/data/formaciones.js backend/tests/data/formaciones.test.js
git commit -m "feat(backend): catálogo de formaciones tácticas por cantidad de jugadores"
```

---

## Task 2: Generalize the auto-balance algorithm to a chosen formation shape

**Files:**
- Modify: `backend/src/services/inscripcionesService.js:139-347` (full replace of this block)
- Modify: `backend/tests/services/inscripcionesService.test.js` (append new `describe` blocks)

**Interfaces:**
- Consumes (from Task 1): `resolverLineas`, `capacidadBroad`, `TODAS_LAS_LINEAS`, `CODIGO_AUTOMATICO` from `../data/formaciones`.
- Produces (consumed by Task 3): `generarFormacionAutomatica(partidoId, grupoId, seleccion)` — new 3rd param `seleccion = { A: {codigo, lineas}, B: {codigo, lineas} }`, both sides optional (default to automatic). Same return shape as before except `lineasEsperadas.A`/`.B` are now `Array<{key, cantidad}>` instead of `{arquero, defensa, medio, delantero}`. `obtenerFormacion` returns the same new `lineasEsperadas` array shape, now derived from actually-placed players instead of an even split. `guardarFormacion` unchanged signature, now accepts `medioContencion`/`medioOfensivo` as valid `linea` values.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/inscripcionesService.test.js` (append before the final `module.exports`-adjacent code — i.e., at the end of the file):

```js
describe('inscripcionesService.generarFormacionAutomatica — con formación elegida', () => {
  async function crearYAnotar(partido, { uid, posicionPrincipal, posicionSecundaria, habilidad }) {
    await crearUsuario({ uid, email: `${uid}@gmail.com` });
    if (habilidad != null) {
      mockDb.prepare('UPDATE Usuarios SET velocidad = ? WHERE uid = ?').run(habilidad, uid);
    }
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, uid, { posicionPrincipal, posicionSecundaria });
  }

  it('respeta exactamente la cantidad por línea de la formación elegida en ambos equipos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 10, cupoSuplentes: 0 });
    // 2 arqueros, 2 defensores, 4 mediocampistas, 2 delanteros = capacidad exacta de '1-2-1' x2 equipos
    await crearYAnotar(partido, { uid: 'p1', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p2', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p3', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' });
    await crearYAnotar(partido, { uid: 'p4', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' });
    await crearYAnotar(partido, { uid: 'p5', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p6', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p7', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' });
    await crearYAnotar(partido, { uid: 'p8', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' });
    await crearYAnotar(partido, { uid: 'p9', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' });
    await crearYAnotar(partido, { uid: 'p10', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' });

    const resultado = await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {
      A: { codigo: '1-2-1' },
      B: { codigo: '1-2-1' },
    });

    for (const equipo of ['A', 'B']) {
      const delEquipo = resultado.jugadores.filter((j) => j.equipo === equipo);
      expect(delEquipo).toHaveLength(5);
      const conteo = {};
      for (const j of delEquipo) conteo[j.linea] = (conteo[j.linea] || 0) + 1;
      expect(conteo).toEqual({ arquero: 1, defensa: 1, medio: 2, delantero: 1 });
    }
  });

  it('cuando una línea está llena en ambos equipos, reubica al jugador en su posición secundaria', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 4, cupoSuplentes: 0 });
    // A: libre con solo 1 delantero. B: libre con solo 1 defensa. 2 arqueros + 2 delanteros.
    await crearYAnotar(partido, { uid: 'p1', posicionPrincipal: 'arquero', posicionSecundaria: 'delantero' });
    await crearYAnotar(partido, { uid: 'p2', posicionPrincipal: 'arquero', posicionSecundaria: 'delantero' });
    await crearYAnotar(partido, { uid: 'p3', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p4', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' });

    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const resultado = await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {
        A: { codigo: 'libre', lineas: [{ key: 'delantero', cantidad: 1 }] },
        B: { codigo: 'libre', lineas: [{ key: 'defensa', cantidad: 1 }] },
      });

      expect(resultado.jugadores.filter((j) => j.equipo === 'A')).toHaveLength(2);
      expect(resultado.jugadores.filter((j) => j.equipo === 'B')).toHaveLength(2);
      const delanteroDeB = resultado.jugadores.find((j) => j.equipo === 'B' && j.posicionPrincipal === 'delantero');
      expect(delanteroDeB.linea).toBe('defensa');
    } finally {
      random.mockRestore();
    }
  });

  it('divide "medio" en medioContencion/medioOfensivo en orden fijo por habilidad', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 10, cupoSuplentes: 0 });
    await crearYAnotar(partido, { uid: 'p1', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p2', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p3', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' });
    await crearYAnotar(partido, { uid: 'p4', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' });
    await crearYAnotar(partido, { uid: 'p5', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor', habilidad: 90 });
    await crearYAnotar(partido, { uid: 'p6', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor', habilidad: 80 });
    await crearYAnotar(partido, { uid: 'p7', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero', habilidad: 70 });
    await crearYAnotar(partido, { uid: 'p8', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero', habilidad: 60 });
    await crearYAnotar(partido, { uid: 'p9', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' });
    await crearYAnotar(partido, { uid: 'p10', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' });

    const resultado = await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {
      A: {
        codigo: 'libre',
        lineas: [
          { key: 'defensa', cantidad: 1 },
          { key: 'medioContencion', cantidad: 1 },
          { key: 'medioOfensivo', cantidad: 1 },
          { key: 'delantero', cantidad: 1 },
        ],
      },
      B: { codigo: 'automatico' },
    });

    const mediosDeA = resultado.jugadores.filter((j) => j.equipo === 'A' && j.posicionPrincipal === 'mediocampista');
    expect(mediosDeA).toHaveLength(2);
    const contencion = mediosDeA.find((j) => j.linea === 'medioContencion');
    const ofensivo = mediosDeA.find((j) => j.linea === 'medioOfensivo');
    expect(contencion).toBeDefined();
    expect(ofensivo).toBeDefined();
  });

  it('rechaza con 400 una formación que no existe para esa cantidad de jugadores', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 2, cupoSuplentes: 0 });
    await crearYAnotar(partido, { uid: 'p1', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p2', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' });

    await expect(
      inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, { A: { codigo: '4-4-2' }, B: { codigo: 'automatico' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('sin seleccion (compatibilidad hacia atrás), usa "automatico" en ambos equipos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 2, cupoSuplentes: 0 });
    await crearYAnotar(partido, { uid: 'p1', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' });
    await crearYAnotar(partido, { uid: 'p2', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' });

    const resultado = await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID);
    expect(resultado.habilitado).toBe(true);
    expect(resultado.jugadores).toHaveLength(2);
  });
});

describe('inscripcionesService.guardarFormacion — nuevas keys de línea', () => {
  it('acepta "medioContencion" y "medioOfensivo" como líneas válidas', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 2, cupoSuplentes: 0 });
    await crearUsuario({ uid: 'p1', email: 'p1@gmail.com' });
    await crearUsuario({ uid: 'p2', email: 'p2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p2', POSICIONES_DEFAULT);

    const resultado = await inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, [
      { usuarioId: 'p1', equipo: 'A', linea: 'medioContencion', ordenLinea: 0 },
      { usuarioId: 'p2', equipo: 'B', linea: 'medioOfensivo', ordenLinea: 0 },
    ]);

    const p1 = resultado.jugadores.find((j) => j.usuarioId === 'p1');
    expect(p1.linea).toBe('medioContencion');
  });

  it('sigue rechazando una línea inválida', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 2, cupoSuplentes: 0 });
    await crearUsuario({ uid: 'p1', email: 'p1@gmail.com' });
    await crearUsuario({ uid: 'p2', email: 'p2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p2', POSICIONES_DEFAULT);

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, [
        { usuarioId: 'p1', equipo: 'A', linea: 'lateral', ordenLinea: 0 },
        { usuarioId: 'p2', equipo: 'B', linea: 'medio', ordenLinea: 0 },
      ])
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('inscripcionesService.obtenerFormacion — lineasEsperadas derivadas', () => {
  it('deriva lineasEsperadas de las líneas realmente usadas por los jugadores ubicados', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 2, cupoSuplentes: 0 });
    await crearUsuario({ uid: 'p1', email: 'p1@gmail.com' });
    await crearUsuario({ uid: 'p2', email: 'p2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p2', POSICIONES_DEFAULT);
    await inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, [
      { usuarioId: 'p1', equipo: 'A', linea: 'delantero', ordenLinea: 0 },
      { usuarioId: 'p2', equipo: 'B', linea: 'defensa', ordenLinea: 0 },
    ]);

    const formacion = await inscripcionesService.obtenerFormacion(partido.id, GRUPO_ID);
    expect(formacion.lineasEsperadas.A).toEqual([{ key: 'delantero', cantidad: 1 }]);
    expect(formacion.lineasEsperadas.B).toEqual([{ key: 'defensa', cantidad: 1 }]);
  });

  it('devuelve arreglos vacíos cuando nadie fue ubicado todavía', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 2, cupoSuplentes: 0 });
    await crearUsuario({ uid: 'p1', email: 'p1@gmail.com' });
    await crearUsuario({ uid: 'p2', email: 'p2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'p2', POSICIONES_DEFAULT);

    const formacion = await inscripcionesService.obtenerFormacion(partido.id, GRUPO_ID);
    expect(formacion.lineasEsperadas).toEqual({ A: [], B: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js`
Expected: FAIL — `generarFormacionAutomatica` doesn't accept a 3rd argument yet, `lineasEsperadas` shape mismatches, `medioContencion` rejected by `guardarFormacion`.

- [ ] **Step 3: Replace the formación block in `inscripcionesService.js`**

Replace lines 139–347 (from `async function obtenerFormacion` through the end of `guardarFormacion`) with:

```js
const { resolverLineas, capacidadBroad, TODAS_LAS_LINEAS, CODIGO_AUTOMATICO } = require('../data/formaciones');

function derivarLineasEsperadas(jugadores) {
  const conteo = { A: {}, B: {} };
  for (const jugador of jugadores) {
    if (!jugador.equipo || !jugador.linea || jugador.linea === 'arquero') continue;
    conteo[jugador.equipo][jugador.linea] = (conteo[jugador.equipo][jugador.linea] || 0) + 1;
  }
  return {
    A: Object.entries(conteo.A).map(([key, cantidad]) => ({ key, cantidad })),
    B: Object.entries(conteo.B).map(([key, cantidad]) => ({ key, cantidad })),
  };
}

async function obtenerFormacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  const habilitado = ocupados.titulares >= partido.cupoTitulares;
  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        equipo: inscripcion.equipo,
        linea: inscripcion.linea,
        ordenLinea: inscripcion.ordenLinea,
      };
    })
  );

  const lineasEsperadas = derivarLineasEsperadas(jugadores);

  return { habilitado, cupoPorEquipo, lineasEsperadas, jugadores };
}

function crearBalanceadorConCapacidad(cupoPorEquipo, capBroad) {
  const estado = {
    A: { restante: cupoPorEquipo.A, total: 0, porLinea: {} },
    B: { restante: cupoPorEquipo.B, total: 0, porLinea: {} },
  };

  function tieneCupo(equipo, linea) {
    return (estado[equipo].porLinea[linea] || 0) < capBroad[equipo][linea];
  }

  function equiposConCupo(linea) {
    return ['A', 'B'].filter((equipo) => tieneCupo(equipo, linea));
  }

  function registrar(equipo, habilidad, linea) {
    estado[equipo].restante -= 1;
    estado[equipo].total += habilidad;
    estado[equipo].porLinea[linea] = (estado[equipo].porLinea[linea] || 0) + 1;
  }

  // A capacidad igual (o ambos con cupo), desempata por menor habilidad acumulada;
  // si empata también, al azar. La paridad de cantidad por línea ya la garantiza el
  // cupo exacto de la formación elegida, así que no hace falta desempatar por conteo.
  function elegirEquipo(linea) {
    const disponibles = equiposConCupo(linea);
    if (disponibles.length === 0) return null;
    if (disponibles.length === 1) return disponibles[0];
    const [a, b] = disponibles;
    if (estado[a].total !== estado[b].total) return estado[a].total < estado[b].total ? a : b;
    return Math.random() < 0.5 ? a : b;
  }

  function elegirCualquierEquipoConCupo() {
    for (const linea of LINEAS) {
      const disponibles = equiposConCupo(linea);
      if (disponibles.length > 0) {
        const equipo = disponibles.sort((x, y) => estado[x].total - estado[y].total)[0];
        return { equipo, linea };
      }
    }
    throw new Error('No hay cupo disponible en ninguna línea (no debería pasar: la capacidad total siempre iguala al cupo total)');
  }

  return { elegirEquipo, elegirCualquierEquipoConCupo, registrar };
}

async function generarFormacionAutomatica(partidoId, grupoId, seleccion = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }

  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);
  const resuelto = {
    A: resolverLineas(cupoPorEquipo.A, seleccion.A || { codigo: CODIGO_AUTOMATICO }),
    B: resolverLineas(cupoPorEquipo.B, seleccion.B || { codigo: CODIGO_AUTOMATICO }),
  };
  const capBroad = { A: capacidadBroad(resuelto.A), B: capacidadBroad(resuelto.B) };

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      const habilidad = (usuario && usuariosService.calcularPromedioHabilidades(usuario)) ?? 50;
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        posicionSecundaria: inscripcion.posicionSecundaria,
        lineaBroad: POSICION_A_LINEA[inscripcion.posicionPrincipal] || 'medio',
        habilidad,
      };
    })
  );

  const balanceador = crearBalanceadorConCapacidad(cupoPorEquipo, capBroad);
  const asignados = [];

  function asignar(jugador, equipo, lineaBroad) {
    balanceador.registrar(equipo, jugador.habilidad, lineaBroad);
    asignados.push({ ...jugador, equipo, lineaBroad });
  }

  const porLinea = { arquero: [], defensa: [], medio: [], delantero: [] };
  for (const jugador of jugadores) porLinea[jugador.lineaBroad].push(jugador);
  for (const linea of LINEAS) porLinea[linea].sort((a, b) => b.habilidad - a.habilidad);

  const sinAsignar = [];
  for (const linea of LINEAS) {
    for (const jugador of porLinea[linea]) {
      const equipo = balanceador.elegirEquipo(linea);
      if (equipo) asignar(jugador, equipo, linea);
      else sinAsignar.push(jugador);
    }
  }

  const siguenSinAsignar = [];
  for (const jugador of sinAsignar) {
    const lineaSecundaria = POSICION_A_LINEA[jugador.posicionSecundaria] || null;
    const equipo = lineaSecundaria ? balanceador.elegirEquipo(lineaSecundaria) : null;
    if (equipo) asignar(jugador, equipo, lineaSecundaria);
    else siguenSinAsignar.push(jugador);
  }

  for (const jugador of siguenSinAsignar) {
    const { equipo, linea } = balanceador.elegirCualquierEquipoConCupo();
    asignar(jugador, equipo, linea);
  }

  // Dividir "medio" en medioContencion/medioOfensivo cuando la formación del equipo lo pida.
  const mediosPorEquipo = { A: [], B: [] };
  for (const jugador of asignados) {
    if (jugador.lineaBroad === 'medio') mediosPorEquipo[jugador.equipo].push(jugador);
  }
  for (const equipo of ['A', 'B']) {
    const subLineas = resuelto[equipo].filter((l) => l.key === 'medioContencion' || l.key === 'medioOfensivo');
    if (subLineas.length === 0) continue;
    const cantidadContencion = subLineas.find((l) => l.key === 'medioContencion')?.cantidad || 0;
    mediosPorEquipo[equipo].forEach((jugador, indice) => {
      jugador.lineaFinal = indice < cantidadContencion ? 'medioContencion' : 'medioOfensivo';
    });
  }
  for (const jugador of asignados) {
    if (!jugador.lineaFinal) jugador.lineaFinal = jugador.lineaBroad;
  }

  const contadorLinea = {};
  const jugadoresFinales = asignados.map((jugador) => {
    const clave = `${jugador.equipo}-${jugador.lineaFinal}`;
    const ordenLinea = contadorLinea[clave] || 0;
    contadorLinea[clave] = ordenLinea + 1;
    return {
      usuarioId: jugador.usuarioId,
      nombre: jugador.nombre,
      posicionPrincipal: jugador.posicionPrincipal,
      equipo: jugador.equipo,
      linea: jugador.lineaFinal,
      ordenLinea,
    };
  });

  return { habilitado: true, cupoPorEquipo, lineasEsperadas: resuelto, jugadores: jugadoresFinales };
}

async function guardarFormacion(partidoId, grupoId, asignaciones) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }
  if (!Array.isArray(asignaciones)) {
    throw crearError('asignaciones debe ser un arreglo', 400);
  }

  const titulares = await listarTitularesActivos(partidoId);
  const idsTitulares = new Set(titulares.map((t) => t.usuarioId));

  if (asignaciones.length !== idsTitulares.size) {
    throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
  }

  const idsVistos = new Set();
  const asientosVistos = new Set();
  for (const asignacion of asignaciones) {
    if (!asignacion || typeof asignacion !== 'object') {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    const { usuarioId, equipo, linea, ordenLinea } = asignacion;
    if (!idsTitulares.has(usuarioId) || idsVistos.has(usuarioId)) {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    idsVistos.add(usuarioId);
    if (equipo !== 'A' && equipo !== 'B') {
      throw crearError('equipo debe ser "A" o "B"', 400);
    }
    if (!TODAS_LAS_LINEAS.includes(linea)) {
      throw crearError('linea inválida', 400);
    }
    if (!Number.isInteger(ordenLinea) || ordenLinea < 0) {
      throw crearError('ordenLinea debe ser un entero mayor o igual a 0', 400);
    }
    const asiento = `${equipo}-${linea}-${ordenLinea}`;
    if (asientosVistos.has(asiento)) {
      throw crearError(`Hay dos jugadores en la misma posición del equipo ${equipo}`, 400);
    }
    asientosVistos.add(asiento);
  }

  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);

  for (const equipo of ['A', 'B']) {
    const asignacionesDelEquipo = asignaciones.filter((a) => a.equipo === equipo);
    if (asignacionesDelEquipo.length !== cupoPorEquipo[equipo]) {
      throw crearError(`El equipo ${equipo} debe tener exactamente ${cupoPorEquipo[equipo]} jugadores`, 400);
    }
  }

  const actualizar = db.transaction((lista) => {
    for (const asignacion of lista) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea
         WHERE partidoId = @partidoId AND usuarioId = @usuarioId AND estado = 'anotado'`
      ).run({ ...asignacion, partidoId });
    }
  });
  actualizar(asignaciones);

  return obtenerFormacion(partidoId, grupoId);
}
```

Also update the top-of-file import (line 7) from:
```js
const { LINEAS, POSICION_A_LINEA, generarLineas, splitEquipos } = require('../utils/formacion');
```
to:
```js
const { LINEAS, POSICION_A_LINEA, splitEquipos } = require('../utils/formacion');
```
(`generarLineas` is no longer used directly here — it's used inside `data/formaciones.js` now.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js`
Expected: PASS (all suites green, including the new ones)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS — no regressions in other services.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/inscripcionesService.js backend/tests/services/inscripcionesService.test.js
git commit -m "feat(backend): armar equipos según la formación elegida por equipo"
```

---

## Task 3: Wire the formation selection through the controller

**Files:**
- Modify: `backend/src/controllers/inscripcionesController.js:75-78`

**Interfaces:**
- Consumes (from Task 2): `inscripcionesService.generarFormacionAutomatica(partidoId, grupoId, seleccion)`.
- Produces: `POST /api/grupos/:grupoId/partidos/:partidoId/formacion/auto` now reads `{ A, B }` from the JSON body (consumed by Task 5's frontend call).

- [ ] **Step 1: Update the controller**

Replace:
```js
async function generarFormacionAutomatica(req, res) {
  const formacion = await inscripcionesService.generarFormacionAutomatica(req.params.partidoId, req.params.grupoId);
  res.json(formacion);
}
```
with:
```js
async function generarFormacionAutomatica(req, res) {
  const formacion = await inscripcionesService.generarFormacionAutomatica(
    req.params.partidoId,
    req.params.grupoId,
    { A: req.body?.A, B: req.body?.B }
  );
  res.json(formacion);
}
```

- [ ] **Step 2: Verify no route/middleware change is needed**

Run: `grep -n "express.json\|bodyParser" "backend/src/app.js" "backend/server.js"` (or wherever the Express app is assembled) and confirm a JSON body parser is already mounted globally. It is — `anotarse`/`guardarFormacion` already rely on `req.body` today.

- [ ] **Step 3: Run the backend suite**

Run: `cd backend && npx jest`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/inscripcionesController.js
git commit -m "feat(backend): aceptar la formación elegida por equipo en el endpoint de auto-generación"
```

---

## Task 4: Frontend formation catalog mirror

**Files:**
- Create: `frontend/src/utils/formaciones.js`
- Modify: `frontend/src/utils/formacion.js:1` (keep as-is — see note below)

**Interfaces:**
- Produces (consumed by Task 5): `FORMACIONES_POR_CANTIDAD` (same data as backend Task 1, JS literal, no import from backend possible — separate package), `CODIGO_AUTOMATICO`, `CODIGO_LIBRE`, `listarFormaciones(cantidadJugadores)`, `ETIQUETAS_LINEA: {[key: string]: string}`, `ORDEN_LINEAS_CAMPO: string[]`.

Note: `frontend/src/utils/formacion.js` (singular, existing file) only exports the old fixed `LINEAS` array. It's left untouched — nothing in Task 5 imports it anymore (MapaCancha.jsx currently does; Task 5 removes that import). Don't delete the file in this task since deleting a file with no other task depending on the deletion is out of scope — flag it for removal in Task 5 once the import is gone and it's confirmed unused elsewhere (`grep -rn "utils/formacion'" frontend/src` — if MapaCancha.jsx was the only consumer, delete it as part of Task 5's cleanup).

- [ ] **Step 1: Create the frontend catalog file**

```js
// frontend/src/utils/formaciones.js
export const CODIGO_AUTOMATICO = 'automatico';
export const CODIGO_LIBRE = 'libre';

export const ETIQUETAS_LINEA = {
  arquero: 'POR',
  defensa: 'DEF',
  medio: 'MED',
  medioContencion: 'MCD',
  medioOfensivo: 'MOF',
  delantero: 'ATA',
};

export const ORDEN_LINEAS_CAMPO = ['defensa', 'medioContencion', 'medio', 'medioOfensivo', 'delantero'];

function l(pares) {
  return pares.map(([key, cantidad]) => ({ key, cantidad }));
}

export const FORMACIONES_POR_CANTIDAD = {
  5: [
    { codigo: '1-2-1', nombre: 'El Rombo', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2', nombre: 'El Cuadrado', lineas: l([['defensa', 2], ['delantero', 2]]) },
    { codigo: '2-1-1', nombre: 'La Y invertida', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-1-2', nombre: 'La Y', lineas: l([['defensa', 1], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1', nombre: 'El Muro', lineas: l([['defensa', 3], ['delantero', 1]]) },
  ],
  6: [
    { codigo: '2-2-1', nombre: 'El clásico', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-1-2', nombre: 'Variante ofensiva', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1-1', nombre: 'Contención pura', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-3-1', nombre: 'El rombo ampliado', lineas: l([['defensa', 1], ['medio', 3], ['delantero', 1]]) },
    { codigo: '1-2-2', nombre: 'Posesión con dos puntas', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 2]]) },
  ],
  7: [
    { codigo: '2-3-1', nombre: 'La más usada', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 1]]) },
    { codigo: '3-2-1', nombre: 'Árbol de Navidad', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2-2', nombre: 'En bloques', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 2]]) },
    { codigo: '3-1-2', nombre: 'Defensiva con peso ofensivo', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 2]]) },
    { codigo: '2-1-3', nombre: 'Ultraofensiva', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 3]]) },
  ],
  8: [
    { codigo: '3-3-1', nombre: 'El estándar', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-3-2', nombre: 'Ofensiva con repliegue', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-2-2', nombre: 'Sólida', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 2]]) },
    { codigo: '2-4-1', nombre: 'Dominio del mediocampo', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-2-1', nombre: 'Catenaccio', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 1]]) },
  ],
  9: [
    { codigo: '3-3-2', nombre: 'El clásico escalado', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-1', nombre: 'Prioriza las bandas', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-1', nombre: 'Para aguantar un resultado', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-4-2', nombre: 'Presión alta', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-2-3', nombre: 'Doble 5 con tres atacantes', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 3]]) },
  ],
  10: [
    { codigo: '4-4-1', nombre: 'La típica de expulsión', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-2', nombre: 'A buscar el partido', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-2', nombre: 'Sin perder volumen ofensivo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-5-1', nombre: 'Dominar la posesión con 10', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 1]]) },
    { codigo: '5-3-1', nombre: 'Cerrar el partido', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 1]]) },
  ],
  11: [
    { codigo: '4-4-2', nombre: 'Clásico o en Rombo', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    { codigo: '4-3-3', nombre: 'Fútbol ofensivo puro', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 3]]) },
    { codigo: '4-5-1', nombre: 'Defensiva y de contragolpe', lineas: l([['defensa', 4], ['medio', 5], ['delantero', 1]]) },
    { codigo: '4-2-4', nombre: 'Muy antigua (Brasil 58)', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 4]]) },
    { codigo: '3-5-2', nombre: 'Mucho peso en el medio', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 2]]) },
    { codigo: '3-4-3', nombre: 'Presión alta y vértigo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 3]]) },
    { codigo: '5-3-2', nombre: 'Contragolpe directo', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 2]]) },
    { codigo: '5-4-1', nombre: 'El autobús', lineas: l([['defensa', 5], ['medio', 4], ['delantero', 1]]) },
    { codigo: '5-2-3', nombre: 'Salida rápida con extremos', lineas: l([['defensa', 5], ['medio', 2], ['delantero', 3]]) },
    {
      codigo: '4-2-3-1',
      nombre: 'Estándar moderno',
      lineas: l([['defensa', 4], ['medioContencion', 2], ['medioOfensivo', 3], ['delantero', 1]]),
    },
    {
      codigo: '4-1-4-1',
      nombre: 'Estabilidad con tapón',
      lineas: l([['defensa', 4], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 1]]),
    },
    { codigo: '4-4-1-1', nombre: 'Con mediapunta libre', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    {
      codigo: '4-3-1-2',
      nombre: 'Enganche sudamericano',
      lineas: l([['defensa', 4], ['medioContencion', 3], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-4-1-2 / 3-4-2-1',
      nombre: 'Variante del 3-5-2 con enganche',
      lineas: l([['defensa', 3], ['medioContencion', 4], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-1-4-2',
      nombre: 'Mediocentro posicional',
      lineas: l([['defensa', 3], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 2]]),
    },
  ],
};

export function listarFormaciones(cantidadJugadores) {
  return FORMACIONES_POR_CANTIDAD[cantidadJugadores] || [];
}
```

- [ ] **Step 2: Sanity-check with a quick Node run (no test framework wired for frontend utils)**

Run: `node -e "const m = require('./frontend/src/utils/formaciones.js')" 2>&1 | head -5`
Expected: fails with `Cannot use import statement outside a module` — that's fine, this file is only ever consumed via Vite/ESM in the app; instead sanity-check by eye that `FORMACIONES_POR_CANTIDAD[11]` has 15 entries and `FORMACIONES_POR_CANTIDAD[5]` has 5, matching the backend catalog from Task 1 (same data, transcribed twice — this is the manual check since there's no cross-package import to enforce it automatically).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/formaciones.js
git commit -m "feat(frontend): catálogo de formaciones tácticas (espejo del backend)"
```

---

## Task 5: Formation picker and dynamic board in `MapaCancha.jsx`

**Files:**
- Modify: `frontend/src/components/MapaCancha.jsx` (full rewrite)
- Delete: `frontend/src/utils/formacion.js` (its only consumer is this file; confirm first — see Step 1)

**Interfaces:**
- Consumes (from Task 4): `FORMACIONES_POR_CANTIDAD`, `CODIGO_AUTOMATICO`, `CODIGO_LIBRE`, `listarFormaciones`, `ETIQUETAS_LINEA`, `ORDEN_LINEAS_CAMPO` from `../utils/formaciones`.
- Consumes (from Task 3): `POST .../formacion/auto` now accepts `{ A: {codigo, lineas?}, B: {codigo, lineas?} }` in the body.
- No new exports — `MapaCancha` keeps the same props (`partidoId`, `formacion`, `esAdmin`, `onGuardado`) used by `Home.jsx` and `AdminPanel.jsx`, so neither of those files changes.

- [ ] **Step 1: Confirm `formacion.js` (singular) has no other consumers**

Run: `grep -rn "utils/formacion'" "frontend/src"`
Expected: only `MapaCancha.jsx` — if anything else shows up, keep the file and skip its deletion in Step 4.

- [ ] **Step 2: Rewrite the component**

Replace the full contents of `frontend/src/components/MapaCancha.jsx` with:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../services/api';
import Boton from './Boton';
import {
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  ETIQUETAS_LINEA,
  ORDEN_LINEAS_CAMPO,
  listarFormaciones,
} from '../utils/formaciones';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';

function claveUbicacion(equipo, linea, ordenLinea) {
  return `${equipo}-${linea}-${ordenLinea}`;
}

function ordenarLineas(lineas) {
  return [...lineas].sort((a, b) => ORDEN_LINEAS_CAMPO.indexOf(a.key) - ORDEN_LINEAS_CAMPO.indexOf(b.key));
}

// Deriva la forma del equipo a partir de lo que ya está ubicado en el mapa
// (usado cuando la selección es "Automático": no hay preview antes de generar).
function estructuraDesdeUbicaciones(ubicaciones, equipo) {
  const conteo = new Map();
  for (const jugador of ubicaciones) {
    if (jugador.equipo !== equipo || !jugador.linea || jugador.linea === 'arquero') continue;
    conteo.set(jugador.linea, (conteo.get(jugador.linea) || 0) + 1);
  }
  return ordenarLineas(Array.from(conteo.entries()).map(([key, cantidad]) => ({ key, cantidad })));
}

function obtenerIniciales(nombre) {
  const palabras = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

function Jugador({ usuarioId, nombre, linea, draggable }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: usuarioId,
    disabled: !draggable,
  });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`group relative flex flex-col items-center gap-0.5 ${draggable ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs font-semibold text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
        {nombre}
      </span>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-cancha-700 text-sm font-bold text-white shadow">
        {obtenerIniciales(nombre)}
      </div>
      <div className="whitespace-nowrap rounded bg-cancha-800 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase text-white/80 shadow">
        {linea ? ETIQUETAS_LINEA[linea] : ''}
      </div>
    </div>
  );
}

function Asiento({ equipo, linea, ordenLinea, jugador, draggable }) {
  const { setNodeRef, isOver } = useDroppable({
    id: claveUbicacion(equipo, linea, ordenLinea),
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-7 w-7 items-center justify-center rounded-lg sm:min-h-14 sm:w-14 ${
        jugador ? '' : 'border border-dashed border-white/20'
      } ${isOver ? 'bg-pasto-600/20' : ''}`}
    >
      {jugador && (
        <Jugador usuarioId={jugador.usuarioId} nombre={jugador.nombre} linea={linea} draggable={draggable} />
      )}
    </div>
  );
}

function Columna({ equipo, linea, cupo, jugadores, draggable }) {
  const jugadorPorOrden = new Map(jugadores.map((jugador) => [jugador.ordenLinea, jugador]));
  const asientos = Array.from({ length: cupo }, (_, ordenLinea) => jugadorPorOrden.get(ordenLinea) || null);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 self-stretch py-3 sm:gap-3">
      {asientos.map((jugador, ordenLinea) => (
        <Asiento
          key={ordenLinea}
          equipo={equipo}
          linea={linea}
          ordenLinea={ordenLinea}
          jugador={jugador}
          draggable={draggable}
        />
      ))}
    </div>
  );
}

function MitadCancha({ equipo, estructura, ubicaciones, draggable }) {
  const columnas = [{ key: 'arquero', cantidad: 1 }, ...estructura];
  const ordenadas = equipo === 'A' ? columnas : [...columnas].reverse();

  if (estructura.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center px-2 py-4 text-center text-xs text-white/40">
        Elegí una formación para armar este equipo.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1 px-2 py-4">
      {ordenadas.map(({ key, cantidad }) => {
        const jugadoresLinea = ubicaciones.filter((u) => u.equipo === equipo && u.linea === key);
        return (
          <Columna key={key} equipo={equipo} linea={key} cupo={cantidad} jugadores={jugadoresLinea} draggable={draggable} />
        );
      })}
    </div>
  );
}

function SelectorFormacion({ etiqueta, cantidadJugadores, seleccion, onCambiar, disabled }) {
  const opciones = listarFormaciones(cantidadJugadores);
  const jugadoresDeCampo = cantidadJugadores - 1;
  const sumaLibre = (seleccion.lineas || []).reduce((acc, l) => acc + l.cantidad, 0);

  function actualizarLineaLibre(indice, delta) {
    const lineas = [...seleccion.lineas];
    lineas[indice] = { ...lineas[indice], cantidad: Math.max(1, lineas[indice].cantidad + delta) };
    onCambiar({ codigo: CODIGO_LIBRE, lineas });
  }

  function agregarLineaLibre() {
    if (seleccion.lineas.length >= 4) return;
    const disponibles = ORDEN_LINEAS_CAMPO.filter(
      (key) => key !== 'medio' && !seleccion.lineas.some((l) => l.key === key)
    );
    const siguienteKey = seleccion.lineas.length === 0 ? 'defensa' : disponibles[0] || 'delantero';
    onCambiar({ codigo: CODIGO_LIBRE, lineas: [...seleccion.lineas, { key: siguienteKey, cantidad: 1 }] });
  }

  function quitarLineaLibre(indice) {
    if (seleccion.lineas.length <= 2) return;
    onCambiar({ codigo: CODIGO_LIBRE, lineas: seleccion.lineas.filter((_, i) => i !== indice) });
  }

  return (
    <div className="mb-2 flex flex-col gap-2">
      <label className="text-xs uppercase text-white/40">{etiqueta}</label>
      <select
        className="rounded-lg bg-cancha-700 px-2 py-1 text-sm text-white"
        value={seleccion.codigo}
        disabled={disabled}
        onChange={(evento) => {
          const codigo = evento.target.value;
          if (codigo === CODIGO_LIBRE) {
            onCambiar({ codigo: CODIGO_LIBRE, lineas: [{ key: 'defensa', cantidad: 1 }, { key: 'delantero', cantidad: jugadoresDeCampo - 1 || 1 }] });
          } else {
            onCambiar({ codigo, lineas: [] });
          }
        }}
      >
        <option value={CODIGO_AUTOMATICO}>Automático (parejo)</option>
        {opciones.map((formacion) => (
          <option key={formacion.codigo} value={formacion.codigo}>
            {formacion.codigo} — {formacion.nombre}
          </option>
        ))}
        <option value={CODIGO_LIBRE}>Libre</option>
      </select>

      {seleccion.codigo === CODIGO_LIBRE && (
        <div className="rounded-lg bg-cancha-800 p-2 text-xs text-white/80">
          {seleccion.lineas.map((linea, indice) => (
            <div key={indice} className="mb-1 flex items-center justify-between gap-2">
              <span>{ETIQUETAS_LINEA[linea.key]}</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={disabled} onClick={() => actualizarLineaLibre(indice, -1)}>
                  -
                </button>
                <span>{linea.cantidad}</span>
                <button type="button" disabled={disabled} onClick={() => actualizarLineaLibre(indice, 1)}>
                  +
                </button>
                <button type="button" disabled={disabled} onClick={() => quitarLineaLibre(indice)}>
                  ×
                </button>
              </div>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between">
            <button type="button" disabled={disabled} onClick={agregarLineaLibre} className="underline">
              + línea
            </button>
            <span className={sumaLibre === jugadoresDeCampo ? 'text-pasto-500' : 'text-sancion'}>
              {sumaLibre}/{jugadoresDeCampo} jugadores de campo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapaCancha({ partidoId, formacion, esAdmin, onGuardado }) {
  const { grupoActivo } = useGrupo();
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
  const [seleccionA, setSeleccionA] = useState({ codigo: CODIGO_AUTOMATICO, lineas: [] });
  const [seleccionB, setSeleccionB] = useState({ codigo: CODIGO_AUTOMATICO, lineas: [] });
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const jugadoresActuales = formacion?.jugadores || [];
    setUbicaciones((anterior) => {
      const anteriorPorId = new Map(anterior.map((jugador) => [jugador.usuarioId, jugador]));
      const fusionados = jugadoresActuales.map((jugador) => anteriorPorId.get(jugador.usuarioId) || jugador);

      const ubicacionesVistas = new Set();
      return fusionados.map((jugador) => {
        if (!jugador.equipo) return jugador;
        const clave = claveUbicacion(jugador.equipo, jugador.linea, jugador.ordenLinea);
        if (ubicacionesVistas.has(clave)) {
          return { ...jugador, equipo: null, linea: null, ordenLinea: null };
        }
        ubicacionesVistas.add(clave);
        return jugador;
      });
    });
  }, [formacion]);

  if (!formacion || !formacion.habilitado) {
    return (
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

  const estructuraA =
    seleccionA.codigo === CODIGO_AUTOMATICO
      ? estructuraDesdeUbicaciones(ubicaciones, 'A')
      : seleccionA.codigo === CODIGO_LIBRE
        ? ordenarLineas(seleccionA.lineas)
        : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.A).find((f) => f.codigo === seleccionA.codigo)?.lineas || []);
  const estructuraB =
    seleccionB.codigo === CODIGO_AUTOMATICO
      ? estructuraDesdeUbicaciones(ubicaciones, 'B')
      : seleccionB.codigo === CODIGO_LIBRE
        ? ordenarLineas(seleccionB.lineas)
        : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.B).find((f) => f.codigo === seleccionB.codigo)?.lineas || []);

  const sinUbicar = ubicaciones.filter((jugador) => !jugador.equipo);

  function cambiarSeleccion(equipo, nuevaSeleccion) {
    const setSeleccion = equipo === 'A' ? setSeleccionA : setSeleccionB;
    setSeleccion(nuevaSeleccion);
    // Cambiar de formación invalida las ubicaciones actuales de ese equipo: vuelven a "sin ubicar".
    setUbicaciones((anterior) =>
      anterior.map((jugador) =>
        jugador.equipo === equipo ? { ...jugador, equipo: null, linea: null, ordenLinea: null } : jugador
      )
    );
  }

  function manejarDragEnd(evento) {
    const { active, over } = evento;
    if (!over) return;
    const [equipo, linea, ordenLineaTexto] = over.id.split('-');
    const ordenLinea = Number(ordenLineaTexto);
    const activoId = active.id;

    setUbicaciones((anterior) => {
      const activo = anterior.find((jugador) => jugador.usuarioId === activoId);
      if (!activo) return anterior;
      if (activo.equipo === equipo && activo.linea === linea && activo.ordenLinea === ordenLinea) return anterior;

      const ocupante = anterior.find(
        (jugador) => jugador.equipo === equipo && jugador.linea === linea && jugador.ordenLinea === ordenLinea
      );
      const posicionAnterior = { equipo: activo.equipo, linea: activo.linea, ordenLinea: activo.ordenLinea };

      return anterior.map((jugador) => {
        if (jugador.usuarioId === activoId) return { ...jugador, equipo, linea, ordenLinea };
        if (ocupante && jugador.usuarioId === ocupante.usuarioId) return { ...jugador, ...posicionAnterior };
        return jugador;
      });
    });
  }

  async function generarAutomaticamente() {
    setError('');
    setGenerando(true);
    try {
      const body = {
        A: { codigo: seleccionA.codigo, lineas: seleccionA.lineas },
        B: { codigo: seleccionB.codigo, lineas: seleccionB.lineas },
      };
      const { data } = await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion/auto`), body);
      setUbicaciones(data.jugadores);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerando(false);
    }
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      const asignaciones = ubicaciones
        .filter((jugador) => jugador.equipo)
        .map((jugador) => ({
          usuarioId: jugador.usuarioId,
          equipo: jugador.equipo,
          linea: jugador.linea,
          ordenLinea: jugador.ordenLinea,
        }));
      const { data } = await api.put(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion`), { asignaciones });
      setUbicaciones(data.jugadores);
      onGuardado?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const contenido = (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-pasto-500">Formación</h4>

      {esAdmin && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectorFormacion
            etiqueta="Equipo 1"
            cantidadJugadores={formacion.cupoPorEquipo.A}
            seleccion={seleccionA}
            onCambiar={(nueva) => cambiarSeleccion('A', nueva)}
            disabled={generando || guardando}
          />
          <SelectorFormacion
            etiqueta="Equipo 2"
            cantidadJugadores={formacion.cupoPorEquipo.B}
            seleccion={seleccionB}
            onCambiar={(nueva) => cambiarSeleccion('B', nueva)}
            disabled={generando || guardando}
          />
        </div>
      )}

      <div
        className="flex aspect-[1.83] w-full overflow-hidden rounded-lg border border-white/10 bg-cover bg-center shadow-inner"
        style={{ backgroundImage: "url('/layout-cancha-futbol.jpeg')" }}
      >
        <MitadCancha equipo="A" estructura={estructuraA} ubicaciones={ubicaciones} draggable={esAdmin} />
        <div className="w-px bg-white/20" />
        <MitadCancha equipo="B" estructura={estructuraB} ubicaciones={ubicaciones} draggable={esAdmin} />
      </div>

      {esAdmin && sinUbicar.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase text-white/40">Sin ubicar</p>
          <div className="flex flex-wrap gap-2">
            {sinUbicar.map((jugador) => (
              <Jugador key={jugador.usuarioId} usuarioId={jugador.usuarioId} nombre={jugador.nombre} draggable />
            ))}
          </div>
        </div>
      )}

      {esAdmin && (
        <>
          {error && <p className="mt-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
          <Boton
            variante="ghost"
            className="mt-4 w-full"
            onClick={generarAutomaticamente}
            disabled={generando || guardando}
          >
            {generando ? 'Generando…' : 'Generar equipos automáticos'}
          </Boton>
          <Boton variante="primario" className="mt-2 w-full" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
        </>
      )}
    </div>
  );

  if (!esAdmin) return contenido;

  return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;
}
```

- [ ] **Step 3: Delete the now-unused `formacion.js` (singular)**

Only if Step 1 confirmed no other consumer:
```bash
rm "frontend/src/utils/formacion.js"
```

- [ ] **Step 4: Manual verification in the browser**

Run: `cd frontend && npm run dev` (and `cd backend && npm run dev` in another terminal if not already running).
Open the app, go to a partido as admin with titulares completos, and check:
1. Both team selectors show "Automático", the catálogo options for that team's headcount, and "Libre".
2. Picking a named formation (e.g. `1-2-1` for a 5-a-side team) renders exactly that many columns/slots and clears that team's placements.
3. "Libre" shows the +/- steppers and the `x/y jugadores de campo` counter turns green when it matches.
4. "Generar equipos automáticos" respects the chosen formations (correct slot counts per team).
5. Manual drag-and-drop between slots still works and "Guardar formación" persists it (reload the page and confirm it comes back — reconstructed via `lineasEsperadas` derived from placements, defaulting each selector's dropdown back to Automático since selection isn't persisted, but showing the *actual* saved layout on the board via `estructuraDesdeUbicaciones`... note: after reload the selector will show "Automático" even though a named formation produced the layout — this is expected per the "ephemeral selection" design decision, confirm with the user this is acceptable in practice, not just in the abstract spec).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MapaCancha.jsx
git add -u frontend/src/utils/formacion.js  # stages the deletion, if applicable
git commit -m "feat(frontend): selector de formación táctica por equipo en el mapa de cancha"
```

---

## Self-Review Notes

- **Spec coverage:** catalog (Task 1) ✓, backend algorithm generalization + capacity-based overflow (Task 2) ✓, `guardarFormacion` validation (Task 2) ✓, `obtenerFormacion` derived `lineasEsperadas` (Task 2) ✓, controller body passthrough (Task 3) ✓, frontend catalog mirror (Task 4) ✓, selector + dynamic board + Libre steppers (Task 5) ✓. No DB schema changes, matches spec. No frontend tests, matches spec's explicit exclusion.
- **Type consistency:** `resolverLineas`/`capacidadBroad` signatures match between Task 1 (defined) and Task 2 (consumed). `generarFormacionAutomatica(partidoId, grupoId, seleccion)` signature matches between Task 2 (defined) and Task 3 (called). Frontend `listarFormaciones`/`ETIQUETAS_LINEA`/`ORDEN_LINEAS_CAMPO` match between Task 4 (defined) and Task 5 (consumed).
- **Known UX gap (called out in Task 5 Step 4):** since selection isn't persisted, reloading the page after a named formation was used to generate/save shows the board correctly (derived from actual `linea` values) but resets the dropdown to "Automático". This was an explicit trade-off accepted during brainstorming, not an oversight.
