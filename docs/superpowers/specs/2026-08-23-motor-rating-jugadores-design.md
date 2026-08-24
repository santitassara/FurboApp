# Motor de rating progresivo de jugadores

## Contexto

Hoy los jugadores votan el rendimiento de sus compañeros por partido
(`RendimientosJugador`, puntaje 1-10), pero ese puntaje solo se muestra
como promedio informativo (`estadisticasService`, `resultadosService`) y
nunca afecta las habilidades del perfil (`Usuarios.velocidad, pegada,
tocaPase, gambeta, marcaDefensa, fisico`). Este documento define cómo
esas votaciones empiezan a mover las habilidades del jugador con el
tiempo, con un enfoque estilo Elo/FIFA ponderado por posición.

## Problema descubierto durante el diseño

No existe hoy un momento de "cierre de votación": un partido pasa a
`estado = 'jugado'` cuando el admin carga el resultado (`resultadosService.
guardarResultado`), y recién ahí se habilita votar (`votosService.
guardarVotos`). Los votos se pueden cargar o editar sin límite de tiempo
(`ON CONFLICT ... DO UPDATE`). La fórmula de actualización de habilidades
es un delta que se aplica una única vez por partido — no es idempotente
ni se puede "recalcular" sin deshacer el cambio anterior. Por eso se
introduce un cierre de votación explícito (ver Flujo).

## Modelo de datos

### `Partidos` (columna nueva)

- `votacionCerrada INTEGER NOT NULL DEFAULT 0`

Migración incremental en `backend/src/config/db.js`, mismo patrón que
las columnas existentes (`ALTER TABLE ... ADD COLUMN` guardado por
`PRAGMA table_info`).

### `Usuarios` (cambio de tipo)

Las 6 columnas de habilidad pasan de `INTEGER` a `REAL`:
`velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico`.

Nota técnica: SQLite tiene tipado dinámico — una columna con afinidad
INTEGER que recibe un REAL con parte fraccionaria (75.3) lo guarda igual
como REAL sin truncar, así que funcionalmente ya "andaría". Aun así se
hace el cambio de tipo real y explícito (para que `PRAGMA table_info` y
cualquier futura migración reflejen la realidad), vía el proceso
estándar de SQLite para cambiar tipo de columna: crear tabla nueva con
las columnas REAL, copiar los datos, dropear la vieja, renombrar. Se
hace una sola vez, guardado por chequeo de tipo en `PRAGMA table_info`.

Rango de valores: se mantiene 0-100 (ya validado hoy en
`usuariosService.esHabilidadValida`). Se guarda con precisión decimal
(no se redondea al persistir); el redondeo a entero es solo de
presentación en frontend si corresponde (fuera del alcance de este
documento — el frontend ya muestra estos números, ver `Cambios fuera
de backend`).

## Flujo

1. Partido pasa a `jugado` (sin cambios, `resultadosService.
   guardarResultado`).
2. Jugadores elegibles (titulares con equipo asignado) votan mientras
   `votacionCerrada = 0` (sin cambios funcionales en la carga de voto,
   salvo el chequeo nuevo del punto 6).
3. Admin del grupo (o Super Admin) llama al nuevo endpoint:
   `POST /api/grupos/:grupoId/partidos/:partidoId/cerrar-votacion`.
4. Validaciones del endpoint:
   - Partido existe en el grupo → si no, 404.
   - `partido.estado === 'jugado'` → si no, 400 ("El partido todavía no
     tiene resultado cargado").
   - `partido.votacionCerrada === 0` → si no, 400 ("La votación de este
     partido ya está cerrada").
   - Solo admin del grupo o Super Admin → si no, 403.
5. En una transacción: `UPDATE Partidos SET votacionCerrada = 1 WHERE
   id = ?`, luego `ratingService.procesarPartido(partidoId, grupoId)`.
6. `votosService.guardarVotos` agrega un chequeo: si
   `partido.votacionCerrada === 1` → 400 ("La votación de este partido
   está cerrada").

## Motor de rating (`backend/src/services/ratingService.js`, nuevo)

Constante `K = 5` (factor de cambio máximo, dentro del rango 3-5
sugerido).

Para cada jugador elegible del partido (mismo criterio que
`resultadosService.obtenerElegibles`: titular, `estado = 'anotado'`,
`equipo IS NOT NULL`):

1. Buscar sus puntajes en `RendimientosJugador` (`WHERE partidoId = ?
   AND jugadorId = ?`).
   - Si no hay votos → se salta, motivo `sin_votos`.
2. Buscar el usuario y sus 6 habilidades actuales.
   - Si alguna es `NULL` (perfil incompleto) → se salta, motivo
     `perfil_incompleto`.
3. Calcular `P`: mediana de los puntajes (no promedio, para anular
   votos extremos aislados) × 10, escalado a 1-100. Mediana par =
   promedio de los dos valores centrales.
4. Calcular `OVR`: promedio simple de las 6 habilidades actuales
   (antes de aplicar el cambio).
5. Obtener la posición jugada en ese partido específico:
   `Inscripciones.posicionPrincipal` (ya es obligatoria al anotarse,
   `sonPosicionesValidas`, no puede ser `NULL` para un titular con
   equipo asignado).
6. Para cada una de las 6 habilidades, aplicar:

   ```
   nuevo = clamp(actual + K * W[posicion][habilidad] * (P - OVR) / 100, 0, 100)
   ```

7. Persistir las 6 habilidades nuevas del jugador con un solo `UPDATE`.

### Matriz de pesos por posición

Colapsa la matriz de 5 filas del enunciado original a las 4 posiciones
que ya existen en el sistema (`backend/src/constants/posiciones.js`):
promedio de Delantero+Extremo → `delantero`, promedio de DFC+Lateral →
`defensor`. La fila de `arquero` no viene del enunciado original (no
estaba contemplada); se define acá porque el sistema sí tiene esa
posición.

| Posición | Velocidad | Gambeta | Pegada | Defensa | Pase | Físico |
|---|---|---|---|---|---|---|
| `delantero` | 0.225 | 0.25 | 0.275 | 0.05 | 0.125 | 0.075 |
| `mediocampista` | 0.10 | 0.15 | 0.10 | 0.15 | 0.35 | 0.15 |
| `defensor` | 0.175 | 0.075 | 0.05 | 0.375 | 0.125 | 0.20 |
| `arquero` | 0.10 | 0.00 | 0.00 | 0.50 | 0.15 | 0.25 |

Cada fila suma 1.0. El mapeo columna-habilidad es directo:
Velocidad→`velocidad`, Gambeta→`gambeta`, Pegada→`pegada`,
Defensa→`marcaDefensa`, Pase→`tocaPase`, Físico→`fisico`.

### Respuesta del endpoint

`cerrar-votacion` devuelve un resumen (no se persiste, es solo para que
el admin vea qué pasó):

```json
{
  "procesados": [
    {
      "usuarioId": "...",
      "nombre": "...",
      "mediana": 8.5,
      "ovrPrevio": 70.0,
      "cambios": { "velocidad": 0.1, "pegada": 0.3, ... }
    }
  ],
  "saltados": [
    { "usuarioId": "...", "nombre": "...", "motivo": "sin_votos" }
  ]
}
```

## Casos de error

- Cerrar votación de un partido que no está `jugado` → 400.
- Cerrar votación ya cerrada → 400.
- Cerrar votación sin ser admin del grupo / Super Admin → 403.
- Votar (crear o editar) después del cierre → 400.
- Jugador sin votos en el cierre → se salta sin error (no rompe el
  cierre de los demás).
- Jugador con perfil incompleto → se salta sin error.

## Cambios fuera de backend

El frontend consume `Usuarios.velocidad/pegada/tocaPase/gambeta/
marcaDefensa/fisico` en al menos el perfil de jugador y el shuffle de
equipos (commit reciente "pierna hábil y mejoras de equipo shuffle").
Pasar esas columnas a decimal no debería romper nada si ya se
muestran/usan como número (JS no distingue int/float), pero cualquier
lugar que compare con `Number.isInteger` o similar debería revisarse
durante la implementación. No se agrega UI nueva en este documento: el
endpoint de cierre puede dispararse desde una pantalla existente de
admin de partido, a definir en el plan de implementación.

## Fuera de alcance

- Tests automáticos (feedback registrado: no agregar sin pedido
  explícito).
- Expandir el enum de posiciones a variantes granulares (lateral,
  extremo, etc.) — se usan las 4 posiciones existentes.
- Cambiar cómo se calcula el promedio que ya se muestra en
  `estadisticasService`/`resultadosService` (sigue siendo un promedio
  simple, informativo, sin relación con el motor de rating).
- Notificaciones o UI de "tus stats subieron/bajaron".
