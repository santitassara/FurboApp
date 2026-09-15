# Rediseño visual de Home + info extendida de partido

## Contexto

`Home.jsx` hoy renderiza una lista simple de partidos abiertos, cada uno con
`TarjetaPartido` (fecha, cupos, lista de jugadores, botón anotarse/baja) y,
si ya se completaron los titulares, `MapaCancha` al lado. El pedido es
llevar el próximo partido a un layout tipo "dashboard" (mockup adjunto por
el usuario): header grande con el partido de hoy/próximo, tarjeta de info
extendida (estadio, tipo de suelo, dirección, clima, cupo, valor), listado
de convocados con alto fijo y scroll, formaciones con overlay de espera,
MVP de la última fecha y líderes goleadores/asistencias del mes. Se
descartan explícitamente "Finanzas del Picado" y "Pizarra del Vestuario" —
no existen hoy y no se agregan.

Alcance acordado con el usuario: **full-stack** (no solo maquetado visual).
Se agregan campos nuevos al modelo de Partido, integración real con
OpenWeather, y dos endpoints nuevos de datos (MVP última fecha, líderes del
mes).

## Decisiones ya tomadas (no volver a preguntar)

- **Clima**: geocoding automático de la `direccion` cargada por el admin
  (OpenWeather Geocoding API) → se guardan `lat`/`lon` en el partido. Si el
  partido es a más de ~5 días (límite del forecast free tier), se muestra
  el texto "Pronóstico no disponible aún" en vez de ocultar el bloque.
- **Número de partido**: autoincremental por Grupo (`MAX(numero)+1`),
  calculado en el backend al crear el partido. El admin no lo carga.
- **Líderes del mes**: top 3 goleadores + top 1 asistencias del mes
  calendario actual, dentro del Grupo.
- **Hero header**: se aplica solo al próximo partido (el primero de la
  lista que devuelve el backend). Si hay otro partido abierto/cerrado
  visible después, se sigue mostrando con la tarjeta simple actual
  (`TarjetaPartido`), sin el layout hero.
- MVP y líderes del mes se muestran debajo de convocados/formaciones (el
  usuario los pidió mantenidos, en ese orden).

## Modelo de datos

Tabla `Partidos` — nuevas columnas (migradas con `ALTER TABLE` siguiendo el
patrón existente en `backend/src/config/db.js`):

| Columna      | Tipo    | Notas                                              |
|--------------|---------|-----------------------------------------------------|
| `numero`     | INTEGER | `MAX(numero) WHERE grupoId=?` + 1, calculado al crear |
| `estadio`    | TEXT    | Nombre de la cancha, cargado por el admin           |
| `tipoSuelo`  | TEXT    | Ej. "Sintético Cubierto Pro 7vs7", cargado por admin |
| `direccion`  | TEXT    | Dirección del estadio, cargada por admin            |
| `lat`        | REAL    | Geocodificado a partir de `direccion` al crear       |
| `lon`        | REAL    | Ídem                                                 |
| `valorCuota` | INTEGER | Monto por jugador, cargado por admin                 |

Todas nullable/con default para no romper partidos existentes creados
antes de esta migración (van a mostrar esos datos vacíos/ocultos en el
frontend).

## Backend

### `partidosService.crearPartido`
Acepta `estadio`, `tipoSuelo`, `direccion`, `valorCuota` además de los
campos actuales. Al crear:
1. Calcula `numero` con `SELECT COALESCE(MAX(numero), 0) + 1 FROM Partidos WHERE grupoId = ?`.
2. Si `direccion` viene cargada, llama a `climaService.geocodificar(direccion)`
   (OpenWeather Geocoding API) para obtener `lat`/`lon`. Si falla o no hay
   `direccion`, guarda `lat`/`lon` en `null` (no bloquea la creación del
   partido — el clima simplemente no se muestra).
3. Inserta con los campos nuevos.

Validación: `estadio`, `tipoSuelo`, `direccion` opcionales (string o
vacío); `valorCuota` opcional, si viene debe ser entero ≥ 0.

### `partidosController` / rutas
`POST /api/grupos/:grupoId/partidos` body extendido con los campos de
arriba. Sin cambios de permisos (sigue siendo solo admin del grupo).

### `climaService.js` (nuevo)
- `geocodificar(direccion)`: GET a
  `https://api.openweathermap.org/geo/1.0/direct` → `{ lat, lon }` o `null`
  si no matchea nada.
- `obtenerPronostico(lat, lon, fechaPartidoISO)`: GET a
  `https://api.openweathermap.org/data/2.5/forecast` (5 día/3h, free
  tier), busca el slot más cercano a la fecha del partido. Si la fecha
  está a más de 5 días, devuelve `{ disponible: false }`. Cachea en
  memoria (`Map`) por `lat,lon,díaISO` durante ~1h para no repetir
  llamadas en cada `GET /partidos`.
- Falla silenciosa: si `OPENWEATHER_API_KEY` no está seteada o la API
  responde error, devuelve `null`/`{ disponible: false }` — nunca tira el
  request de partidos.

`GET /api/grupos/:grupoId/partidos` enriquece cada partido con
`clima: { disponible, temp, descripcion, icono } | null` antes de
devolver la lista (solo si tiene `lat`/`lon`).

### `estadisticasService.js` — nuevas funciones
- `obtenerMvpUltimaFecha(grupoId)`: toma el último partido `jugado` del
  grupo, calcula el jugador con más votos en `VotosMvp` para ese
  `partidoId` (mismo patrón de empate que ya usa `resultadosService`),
  devuelve `{ jugador, goles, asistencias, valoracion, porcentajeVotos }`
  o `null` si no hay partidos jugados o no hay votos.
- `obtenerLideresDelMes(grupoId)`: rango = primer/último día del mes
  calendario actual (server time). Query sobre `Goles` filtrando
  `p.fecha BETWEEN inicioMes AND finMes AND p.grupoId = ?`:
  - top 3 por `COUNT(*) WHERE enContra = 0 GROUP BY usuarioId`
  - top 1 por `COUNT(*) GROUP BY asistenciaUsuarioId`
  Devuelve `{ goleadores: [{usuarioId, nombre, goles}], asistidor: {usuarioId, nombre, asistencias} | null }`.

### Rutas nuevas
- `GET /api/grupos/:grupoId/mvp-ultima-fecha`
- `GET /api/grupos/:grupoId/lideres-mes`

Ambas protegidas por membresía del grupo igual que el resto de rutas
anidadas bajo `/grupos/:grupoId`.

### Config
`.env` nuevo: `OPENWEATHER_API_KEY=`. Se agrega a `.env.example`.

## Frontend

### Componentes nuevos (`frontend/src/components/`)
- **`HeroPartido.jsx`**: título grande — "¡Hoy tenés partido a las HH:MM!"
  si `fecha` es hoy, o "Próximo partido: <día> a las HH:MM" si no. Botón
  anotarse/titular-suplente o "Darme de baja" al costado (reusa
  `onAnotarse`/`onSolicitarBaja` que ya maneja `Home.jsx`, mismo
  `ModalPosicion`/`ModalConfirmacionSancion` existentes).
- **`TarjetaInfoPartido.jsx`**: día formateado (reusa
  `formatearFechaPartido`), `#numero`, `estadio`, `tipoSuelo`,
  `direccion`, clima (o "Pronóstico no disponible aún" / oculto si
  `clima === null` por falta de lat/lon), `BarraCupos`-style
  confirmados/total, `valorCuota` formateado como moneda. Todos los
  campos nuevos son opcionales — si el partido no los tiene cargados
  (partidos viejos), esa línea no se renderiza.
- **`ListaConvocadosScroll.jsx`**: wrapper delgado sobre `ListaJugadores`
  existente con `max-h-80 overflow-y-auto` (o valor similar a ajustar en
  implementación) — no toca lógica interna de `ListaJugadores`.
- **`MvpUltimaFecha.jsx`**: consume `GET /mvp-ultima-fecha`, muestra
  jugador + stats + `%` de votos. Si no hay datos, no renderiza nada.
- **`LideresDelMes.jsx`**: consume `GET /lideres-mes`, muestra top 3
  goleadores + destacado de asistencias. Si no hay datos, no renderiza
  nada.

### `MapaCancha` — blur de espera
Cuando `ocupados.titulares < cupoTitulares` (formación aún no armada),
envolver en overlay blureado con texto "Esperando a todos los
titulares", mismo patrón visual que ya usa `PartidoConEstado` para el
estado `cerrado` (blur + mensaje superpuesto). No se toca la lógica
interna de `MapaCancha`, solo el wrapper condicional en `Home.jsx`.

### `Home.jsx`
- El primer partido de la lista (`partidos[0]`) se renderiza con
  `HeroPartido` + `TarjetaInfoPartido` + `ListaConvocadosScroll` +
  `MapaCancha` (blureado o no) + `MvpUltimaFecha` + `LideresDelMes`.
- Partidos restantes (si los hay) se siguen renderizando como hoy
  (`TarjetaPartido` simple), sin el layout hero.
- Se agregan dos llamadas a la carga inicial: `GET .../mvp-ultima-fecha`
  y `GET .../lideres-mes` (solo para el partido hero / grupo activo).
- Formulario de creación de partido (donde esté hoy — a confirmar path
  exacto en el plan) gana los campos nuevos: estadio, tipo de suelo,
  dirección, valor de cuota.

## Error handling
- Backend: mismos códigos ya usados (400 validación, 403 sin permiso,
  404 no encontrado, 500 error de servidor). Fallas de OpenWeather nunca
  propagan error al cliente — se degradan a "sin clima".
- Frontend: si `mvp-ultima-fecha` o `lideres-mes` fallan, esas secciones
  simplemente no se muestran (no bloquean el resto de `Home`).

## Testing
Sin tests automáticos salvo que se pida — consistente con preferencia ya
registrada del usuario de no escribir tests salvo pedido explícito.
Verificación manual: correr backend+frontend, crear partido con los
campos nuevos, confirmar clima/numero/mvp/líderes se ven correctos con
datos reales del dev DB.

## Fuera de alcance
- Finanzas del Picado, Pizarra del Vestuario: no se implementan.
- Rediseño de `TarjetaPartido` para partidos no-hero: se mantiene igual.
- Edición retroactiva de estadio/suelo/dirección en partidos ya creados
  antes de esta migración (quedan sin esos datos).
