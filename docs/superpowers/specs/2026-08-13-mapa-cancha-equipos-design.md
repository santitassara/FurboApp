# Mapa interactivo de cancha para armar equipos — Diseño

Fecha: 2026-08-13

## 1. Contexto y objetivo

Hoy `Home.jsx` solo lista titulares/suplentes de un partido (`ListaJugadores`), sin ningún concepto de equipo ni posición en la cancha. Se necesita que, una vez completo el cupo de titulares, el admin pueda arrastrar a cada titular desde una lista hacia spots ubicados en un dibujo de cancha, dividida en dos mitades (Equipo A / Equipo B), para dejar armados los dos equipos antes de jugar. El resultado se persiste para que cualquier jugador logueado pueda ver cómo quedaron armados los equipos.

## 2. Alcance de esta spec

Cubre: columnas nuevas en `Inscripciones` (`equipo`, `linea`, `ordenLinea`), algoritmo determinístico de generación de líneas de formación, endpoints de lectura y guardado bulk de la formación, validaciones de integridad, y el componente de frontend `MapaCancha` (con `@dnd-kit/core`) integrado en `Home.jsx` junto a `ListaJugadores`.

No cubre: reasignación automática cuando un titular ya ubicado se da de baja (el slot simplemente queda vacío, el admin reordena a mano), drag de suplentes, edición de la formación fuera de partidos con estado `abierto`/`cerrado` con cupo completo, histórico de formaciones pasadas más allá del registro actual en `Inscripciones`, y tests automatizados (preferencia ya establecida del usuario para este proyecto).

## 3. Decisiones clave (resueltas en brainstorming)

- **Split de equipos**: mitad y mitad automático sobre `cupoTitulares`. Si es impar, Equipo A recibe el excedente (`Math.ceil(cupoTitulares/2)`), Equipo B el resto (`Math.floor(...)`).
- **Forma de los spots**: formación por líneas (arquero, defensa, medio, delantero), generada automáticamente a partir del tamaño de cada equipo — no hay selección manual de formación tipo "4-4-2".
- **Persistencia**: se guarda en la base (columnas en `Inscripciones`), visible en modo solo-lectura para cualquier jugador logueado.
- **Almacenamiento**: columnas planas en `Inscripciones` (mismo patrón que `posicionPrincipal` en `Usuarios`), no una tabla `Formaciones` separada — la relación es 1:1 con la inscripción activa del titular, una tabla nueva solo agregaría joins innecesarios.
- **Guardado**: un único endpoint bulk (`PUT`) que recibe el tablero completo y lo valida/persiste de una vez, con botón "Guardar formación" en el frontend — no hay autoguardado por cada drag.
- **Habilitación**: el mapa solo es interactivo cuando `ocupados.titulares >= cupoTitulares`. Antes de eso se muestra un placeholder.
- **Librería drag&drop**: `@dnd-kit/core` (nueva dependencia en `frontend/package.json`), por soporte táctil/mobile.

## 4. Backend

### Esquema (`schema.sql` + migración en `db.js`)

`Inscripciones` gana:
```sql
equipo TEXT,        -- 'A' | 'B' | NULL
linea TEXT,         -- 'arquero' | 'defensa' | 'medio' | 'delantero' | NULL
ordenLinea INTEGER  -- posición dentro de la línea (0-indexed) | NULL
```

Todas nullable (un titular recién anotado no tiene ubicación todavía). Se extiende el mismo bloque de `PRAGMA table_info` en `db.js` que ya agrega columnas a `Usuarios`/`Inscripciones`, agregando estas tres con `ALTER TABLE Inscripciones ADD COLUMN ...` si faltan.

### Algoritmo de líneas (`backend/src/utils/formacion.js`, duplicado en frontend igual que `constants/posiciones.js`)

```js
const LINEAS = ['arquero', 'defensa', 'medio', 'delantero'];

function generarLineas(cantidadJugadores) {
  if (cantidadJugadores <= 0) return { arquero: 0, defensa: 0, medio: 0, delantero: 0 };
  if (cantidadJugadores === 1) return { arquero: 1, defensa: 0, medio: 0, delantero: 0 };

  const resto = cantidadJugadores - 1;
  const base = Math.floor(resto / 3);
  const extra = resto % 3;
  const lineas = { arquero: 1, defensa: base, medio: base, delantero: base };

  const ordenReparto = ['medio', 'defensa', 'delantero'];
  for (let i = 0; i < extra; i++) lineas[ordenReparto[i]]++;

  return lineas;
}

function splitEquipos(cupoTitulares) {
  const A = Math.ceil(cupoTitulares / 2);
  const B = Math.floor(cupoTitulares / 2);
  return { A, B };
}

module.exports = { LINEAS, generarLineas, splitEquipos };
```

Ejemplos: 5 → arquero 1, defensa 1, medio 2, delantero 1. 6 → 1-2-2-1. 7 → 1-2-2-2. Determinístico, sin estado.

Si `cupoTitulares` es muy bajo (ej. 1), un equipo puede quedar con 0 jugadores — comportamiento aceptado, no bloqueado.

### `inscripcionesService.js`

Nueva función `obtenerFormacion(partidoId)`:
1. Busca el partido (404 si no existe).
2. Calcula `ocupados` (ya existe vía `contarOcupados`) y `habilitado = ocupados.titulares >= partido.cupoTitulares`.
3. Calcula `cupoPorEquipo = splitEquipos(partido.cupoTitulares)` y `lineasEsperadas = { A: generarLineas(cupoPorEquipo.A), B: generarLineas(cupoPorEquipo.B) }`.
4. Trae todos los titulares activos (`estado='anotado' AND tipo='titular'`) con `usuarioId, nombre, posicionPrincipal, equipo, linea, ordenLinea`.
5. Devuelve `{ habilitado, cupoPorEquipo, lineasEsperadas, jugadores }`.

Nueva función `guardarFormacion(partidoId, asignaciones, adminUid)`:
1. Busca el partido (404 si no existe).
2. `ocupados.titulares >= partido.cupoTitulares` (si no, error 400 "El cupo de titulares no está completo").
3. Trae el set de `usuarioId` de titulares activos del partido. Valida que `asignaciones` tenga exactamente esa cantidad de elementos y que cada `usuarioId` de `asignaciones` esté en ese set exactamente una vez (sin duplicados, sin ids ajenos, sin faltantes) → error 400 en caso contrario.
4. Valida cada asignación: `equipo` ∈ `['A','B']`, `linea` ∈ `LINEAS`, `ordenLinea` entero ≥ 0 → error 400 si algo no cumple.
5. Agrupa por `equipo` y valida que el conteo total por equipo coincida con `splitEquipos(cupoTitulares)`, y que el conteo por `linea` dentro de cada equipo coincida exactamente con `generarLineas(tamañoDeEseEquipo)` (mismas cantidades, sin líneas de más/menos) → error 400 si no coincide.
6. Valida que dentro de cada `(equipo, linea)` los `ordenLinea` sean únicos y cubran exactamente `0..cantidad-1` → error 400 si hay huecos o duplicados.
7. Si todo es válido, dentro de una transacción (`db.transaction`) hace un `UPDATE Inscripciones SET equipo=?, linea=?, ordenLinea=? WHERE partidoId=? AND usuarioId=?` por cada asignación.
8. Devuelve el resultado de `obtenerFormacion(partidoId)`.

Las validaciones de forma (pasos 3-6) son deliberadamente estrictas: rechazan cualquier tablero que no sea exactamente la formación generada, evitando estados inconsistentes (huecos, superposición de jugadores en un mismo slot, líneas inventadas).

### `inscripcionesController.js` + `partidosRoutes.js`

```js
async function verFormacion(req, res) {
  const formacion = await inscripcionesService.obtenerFormacion(req.params.partidoId);
  res.json(formacion);
}

async function guardarFormacion(req, res) {
  const formacion = await inscripcionesService.guardarFormacion(
    req.params.partidoId,
    req.body.asignaciones,
    req.usuario.uid
  );
  res.json(formacion);
}
```

Nuevas rutas en `partidosRoutes.js`:
```
GET /:partidoId/formacion              (verificarToken)              -> verFormacion
PUT /:partidoId/formacion               (verificarToken, verificarAdmin) -> guardarFormacion
```

## 5. Frontend

### Dependencia nueva

`@dnd-kit/core` agregado a `frontend/package.json`.

### `frontend/src/utils/formacion.js` (espejo del backend)

Mismo `generarLineas`/`splitEquipos`/`LINEAS` que el backend, usado solo para renderizar slots vacíos antes de tener respuesta del servidor (el servidor ya los manda calculados en `lineasEsperadas`, pero tenerlo también en frontend evita un parpadeo mientras carga).

### `frontend/src/components/MapaCancha.jsx` (nuevo)

- Recibe `partidoId`, `habilitado`, `cupoPorEquipo`, `lineasEsperadas`, `jugadores` (shape de `GET /formacion`), y `esAdmin`.
- Si `!habilitado`: renderiza placeholder ("El mapa se habilita cuando se complete el cupo de titulares").
- Si `habilitado`: renderiza dos mitades de cancha (Equipo A izquierda, Equipo B derecha; en mobile, apiladas), cada una con sus líneas (arquero/defensa/medio/delantero) y un spot circular por posición esperada según `lineasEsperadas`. Cada spot muestra el nombre del jugador ubicado ahí (si `jugadores` trae alguno con ese `equipo`/`linea`/`ordenLinea`) o vacío.
- Si `esAdmin`: los spots son `droppable` (`@dnd-kit/core` `useDroppable`) y los titulares (propios o de un panel lateral "Sin ubicar") son `draggable` (`useDraggable`). Soltar un jugador sobre un spot ocupado hace swap (el que estaba ahí pasa a "Sin ubicar"). Estado del tablero se mantiene en memoria local (`useState`) hasta apretar "Guardar formación", que arma el array de `asignaciones` y llama `PUT /partidos/:id/formacion`.
- Si no es admin: misma UI pero sin `DndContext`/handlers, puramente de lectura.

### `ListaJugadores.jsx`

Sin cambios estructurales. Cuando se usa junto a `MapaCancha` en modo admin, la sección de titulares sigue listando a todos (ubicados o no); no se oculta a nadie ni se quita de la lista al ubicarlo en el mapa.

### `Home.jsx`

- Por cada partido con `ocupados.titulares >= partido.cupoTitulares`, pide `GET /partidos/:id/formacion` (mismo patrón que ya usa para inscripciones) y renderiza `<MapaCancha />` al lado de `<TarjetaPartido>` en desktop (grid de 2 columnas) y debajo en mobile (stack), usando `esAdmin` del `AuthContext` para decidir si es editable.
- Para partidos con cupo incompleto, no se pide `/formacion` y no se renderiza nada extra (ni siquiera el placeholder, para no sobrecargar la vista de partidos que recién arrancan a llenarse).

## 6. No incluido (fuera de alcance)

- Reasignación automática de un suplente al slot vacío que deja un titular dado de baja.
- Drag de suplentes o mezcla suplente/titular en el mapa.
- Selección manual de formación táctica (4-4-2, 3-5-2, etc.) — las líneas se generan siempre con el mismo algoritmo determinístico.
- Histórico de formaciones de partidos ya jugados (solo existe el estado actual en `Inscripciones`).
- Tests automatizados (por preferencia ya establecida del usuario para este proyecto).
