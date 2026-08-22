# Selección de formación táctica por equipo

## Contexto

La rama `AutoTeamShuffle` ya implementa armado de equipos (automático y manual, drag & drop en `MapaCancha.jsx`) con reparto de líneas siempre parejo (`generarLineas`, `backend/src/utils/formacion.js`), sin concepto de formación con nombre (4-4-2, etc.).

Este diseño agrega un catálogo de formaciones reales de fútbol (5 a 11), filtrado por cantidad de jugadores por equipo, seleccionable de forma independiente para cada equipo (A y B), más una opción "Libre" donde el admin define la cantidad de jugadores por línea a mano. No requiere cambios de esquema en SQLite.

## Modelo de datos: catálogo de formaciones

Nuevo archivo `backend/src/data/formaciones.js`, con espejo `frontend/src/utils/formaciones.js` (mismo patrón que el `formacion.js` existente, que ya se duplica backend/frontend).

```js
// cantidadJugadores = jugadores por equipo, incluyendo arquero (5..11)
const FORMACIONES_POR_CANTIDAD = {
  5: [
    { codigo: '1-2-1', nombre: 'El Rombo', lineas: [
      { key: 'defensa', label: 'DEF', cantidad: 1 },
      { key: 'medio', label: 'MED', cantidad: 2 },
      { key: 'delantero', label: 'ATA', cantidad: 1 },
    ]},
    { codigo: '2-2', nombre: 'El Cuadrado', lineas: [
      { key: 'defensa', label: 'DEF', cantidad: 2 },
      { key: 'delantero', label: 'ATA', cantidad: 2 },
    ]},
    // ... 2-1-1, 1-1-2, 3-1
  ],
  // ... 6, 7, 8, 9, 10, 11 (todas las formaciones listadas por el usuario)
  11: [
    // formaciones de 3 líneas de campo (4-4-2, 4-3-3, 4-5-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1, 5-2-3, ...)
    { codigo: '4-2-3-1', nombre: 'Estándar moderno', lineas: [
      { key: 'defensa', label: 'DEF', cantidad: 4 },
      { key: 'medioContencion', label: 'MCD', cantidad: 2 },
      { key: 'medioOfensivo', label: 'MOF', cantidad: 3 },
      { key: 'delantero', label: 'ATA', cantidad: 1 },
    ]},
    // ... 4-1-4-1, 4-4-1-1, 4-3-1-2, 3-4-1-2/3-4-2-1, 3-1-4-2 (4 líneas de campo)
  ],
};
```

Reglas:
- `key` es una de: `defensa`, `medio`, `medioContencion`, `medioOfensivo`, `delantero`. `medio` se usa cuando la formación tiene una sola línea media (2-3 líneas de campo en total); `medioContencion`/`medioOfensivo` cuando tiene dos (solo aparece en catálogo de 11, ej. 4-2-3-1, 4-1-4-1, 4-3-1-2, 3-1-4-2). Una formación nunca mezcla `medio` con `medioContencion`/`medioOfensivo`.
- Fuente de verdad del listado completo: el mensaje del usuario que originó este spec (fútbol 5 a 11, con nombre y descripción de cada formación). El plan de implementación debe transcribir esa lista completa al formato de arriba — no es un placeholder pendiente, es transcripción mecánica siguiendo las reglas de `key` ya definidas. Formaciones con más de 4 números en el nombre (ej. "4-3-1-2" tiene 4 números pero son 4 líneas de campo reales) se interpretan línea por línea en el orden dado (defensa → ataque); cuando el nombre tiene una única franja media, esa franja completa es `medio`.
- `arquero` no forma parte de `lineas`: siempre 1, implícito.
- Invariante: `1 + sum(lineas[].cantidad) === cantidadJugadores` de esa entrada del catálogo. Se valida con un test que recorra todo `FORMACIONES_POR_CANTIDAD`.
- El algoritmo parejo existente (`generarLineas`) se expone además como pseudo-entrada `{ codigo: 'automatico', nombre: 'Automático (parejo)', lineas: [...] }`, calculada on the fly con `generarLineas(cantidadJugadores)` normalizada al mismo formato — no se hardcodea en el catálogo, así no se desincroniza del algoritmo real.

## Modo Libre

No es una entrada del catálogo. El admin elige cantidad de líneas de campo (2 a 4) y la cantidad de jugadores en cada una, vía steppers +/-, con un contador de "jugadores sin asignar" que debe llegar a 0 antes de habilitar generar/guardar. Se envía al backend como `{ codigo: 'libre', lineas: [{key, cantidad}, ...] }` con las mismas keys genéricas (`defensa`/`medio` o `medioContencion`+`medioOfensivo`/`delantero`, según cuántas líneas eligió) y se valida con la misma regla de invariante que una formación con nombre.

## Backend

### `backend/src/utils/formacion.js`
- Se agrega `LINEAS_CAMPO_VALIDAS = ['defensa', 'medio', 'medioContencion', 'medioOfensivo', 'delantero']` (mas `arquero`) como set de validación, reemplazando el `LINEAS` fijo de 4 elementos donde se usa para validar (no para iterar layout).
- `generarLineas` se mantiene igual (fallback "automático"), pero se agrega `normalizarComoFormacion(cantidadJugadores)` que la envuelve en `{ codigo: 'automatico', lineas: [...] }`.

### `backend/src/services/inscripcionesService.js`
- `guardarFormacion` (línea ~314): `if (!LINEAS.includes(linea))` pasa a validar contra `arquero` + `LINEAS_CAMPO_VALIDAS`. Sin cambios de firma ni de contrato HTTP.
- `generarFormacionAutomatica(partidoId, grupoId, seleccion)`: nueva firma, `seleccion = { A: {codigo, lineas}, B: {codigo, lineas} }` viene del body de `POST .../formacion/auto`. Se valida cada lado contra el catálogo (si `codigo !== 'libre'`, `lineas` se ignora y se toma del catálogo por `codigo`; si es `'libre'`, se valida el invariante cantidad).
  - El balanceador inter-equipo (`crearBalanceador`, sin cambios) sigue operando sobre categorías anchas: un jugador con `posicionPrincipal: 'mediocampista'` es candidato a cualquier línea de tipo medio de su equipo.
  - Dentro de un equipo, si su formación elegida tiene `medioContencion` + `medioOfensivo`, se llenan en ese orden fijo (contención primero) con los jugadores de esa categoría ya ordenados por habilidad — no hay balance adicional ahí, es reparto posicional, no competitivo.
  - Arqueros sobrantes (misma regla ya existente: máx. 2 en cancha) siguen reasignándose a `posicionSecundaria`.
- `obtenerFormacion`: sin cambio de contrato. `lineasEsperadas` dejó de ser información persistida — es una foto de las líneas realmente usadas por los jugadores ya ubicados (derivado, como hoy), no de una formación "recordada". Si el partido nunca se generó/guardó, el front no tiene de dónde derivar una forma — la elección de formación vive solo en el estado del componente hasta el submit (confirmado: no se persiste entre sesiones).

### `backend/src/routes/partidosRoutes.js` / `backend/src/controllers/inscripcionesController.js`
- `POST .../formacion/auto` pasa a leer `req.body` (`{ A, B }`) y pasarlo a `generarFormacionAutomatica`. Ruta y permisos (solo admin) sin cambios.

## Frontend

### `frontend/src/utils/formaciones.js` (nuevo, espejo del catálogo backend)
Mismo objeto `FORMACIONES_POR_CANTIDAD`, usado para listar opciones sin pegarle al backend.

### `frontend/src/components/MapaCancha.jsx`
- Constantes fijas `LINEAS`, `ETIQUETAS_LINEA`, `CUPO_LINEA` (líneas 5-20) pasan a derivarse de la formación elegida por equipo: `estructuraEquipo(equipo)` devuelve `['arquero', ...formación.lineas.map(l => l.key)]` con label y cantidad por key, en vez de la lista fija de 4.
- `MitadCancha`/`Columna` iteran esa estructura dinámica (2 a 5 columnas: arquero + 2 a 4 líneas de campo) en vez de `LINEAS_POR_EQUIPO` fijo.
- Nuevo selector de formación por equipo (dropdown con las opciones del catálogo filtradas por `cupoPorEquipo[equipo]`, más "Automático" y "Libre"). Libre despliega los steppers descriptos arriba. Estado local (`formacionElegidaA`, `formacionElegidaB`), no se persiste ni se pide al backend.
- `generarAutomaticamente()`: manda `{ A: seleccionA, B: seleccionB }` en el body del POST.
- Modo manual: la formación elegida define cuántos asientos (`Asiento`) dibuja cada columna (reemplaza el `CUPO_LINEA` fijo de hoy); guardar (`PUT .../formacion`) no cambia de forma, solo ahora puede incluir las nuevas keys de línea.

### Componentes sin cambios
`ListaJugadores.jsx`, `ItemHistorialPartido.jsx`, `Home.jsx`, `AdminPanel.jsx` — agrupan por `equipo`, no por `linea`, así que no dependen de las keys nuevas.

## Testing
- Backend: test de invariante del catálogo completo (suma de líneas + 1 = cantidad, para las 7 tablas de tamaño). Test de `generarFormacionAutomatica` con una formación de 4 líneas (contención/ofensivo) y con `'libre'` inválido (suma no coincide → 400). Test de `guardarFormacion` aceptando las nuevas keys y rechazando una inválida.
- Frontend: no se agregan tests automáticos (confirmado con el usuario en sesiones previas: sin tests salvo que se pidan explícitamente).

## Fuera de alcance
- Persistir la formación elegida entre sesiones (confirmado con el usuario: efímera).
- Balance de habilidad entre `medioContencion` y `medioOfensivo` dentro del mismo equipo (confirmado: reparto fijo, no balanceado).
- Posicionamiento libre por coordenadas x/y (el modo "Libre" es cantidad libre por línea, no posición libre por jugador).
- Nuevo campo `tipoFutbol` en `Partidos` (se deriva siempre de `cupoTitulares`/2).
