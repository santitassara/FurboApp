# Programación automática de creación de partidos

Fecha: 2026-09-20

## Problema

Hoy un admin crea cada fecha a mano desde el panel de admin, repitiendo
siempre los mismos datos: mismo día, mismo horario, misma cancha, mismo
valor de cuota. El grupo típico juega todas las semanas en el mismo
horario, así que la creación manual es trabajo repetido y, cuando el
admin se olvida, la inscripción abre tarde.

## Objetivo

Un admin puede definir en el panel una o más **programaciones**: "todos
los lunes a las 20:00 creá un partido para el viernes a las 20:00, en
el Parador 4, con cupo 10+5 y cuota de $10.000". El sistema crea ese
partido solo, con la configuración guardada. La programación se puede
editar (cancha, horario, cupos, valor), desactivar y borrar en
cualquier momento.

## Alcance

Incluye:

- Varias programaciones por grupo, cada una con su propia configuración.
- Día de semana y hora del disparo, y día de semana y hora del partido,
  seteados por separado.
- Edición, activación/desactivación y borrado desde el panel de admin.
- Recuperación de disparos perdidos: si el backend estuvo caído a la
  hora del disparo, el partido se crea al volver.

No incluye:

- Programaciones con frecuencia distinta a semanal (quincenal, mensual).
- Zonas horarias configurables por grupo: se usa
  `America/Argentina/Buenos_Aires`, como el resto del backend.
- Aviso al admin cuando una ejecución falla o se saltea: por ahora solo
  queda registrado en el log del servidor.

## Decisiones de diseño

**Día de semana + hora, no offset en días.** El admin setea el día y la
hora del disparo, y el día y la hora del partido. Es como piensa el
problema ("los lunes se abre la lista del viernes"), y no lo obliga a
calcular días de anticipación.

**Un barrido en el cron por minuto, no un cron job por programación.**
`node-cron` no recupera disparos perdidos y obliga a registrar y
destruir jobs en cada alta, edición y baja. Guardar el próximo disparo
en la base y barrer la tabla cada minuto da la recuperación gratis y
deja un solo punto de ejecución.

**La fecha del partido se calcula desde el momento en que el disparo
debía correr**, no desde el momento en que efectivamente corre. Así, un
backend que vuelve el miércoles después de perder el disparo del lunes
igual crea el partido del viernes correcto.

**Si el día del disparo y el del partido coinciden, el partido va a los
7 días.** Sin esta regla, una programación "los viernes 20:00 creá el
partido del viernes 20:00" crearía un partido para dentro de unos
minutos.

## Modelo de datos

Tabla nueva en `backend/src/db/schema.sql`, con
`CREATE TABLE IF NOT EXISTS` como el resto del esquema. Al ser tabla
nueva no hace falta el patrón de `ALTER TABLE` condicional de
`db.js`.

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

Convenciones de los campos:

- `diaSemanaDisparo` y `diaSemanaPartido`: 0 a 6, con 0 = domingo, igual
  que `Date.prototype.getDay()`.
- `horaDisparo` y `horaPartido`: `'HH:MM'` en 24 horas, hora de
  Argentina.
- `proximoDisparo` y `ultimoDisparo`: ISO 8601 en UTC, como el resto de
  las fechas del proyecto.
- `nombre`: etiqueta opcional para distinguir programaciones en la
  lista (por ejemplo "Viernes Parador 4").

## Cálculo de fechas

Módulo nuevo `backend/src/utils/programacionFechas.js`. Sin
dependencias nuevas: el proyecto ya resuelve zonas horarias con `Intl`
en `whatsappNotificacionesService.js` y `whatsappBotService.js`.

- `ZONA = 'America/Argentina/Buenos_Aires'`.
- `offsetZonaMinutos(fecha)`: obtiene el offset real de la zona para esa
  fecha con `Intl.DateTimeFormat(..., { timeZoneName: 'longOffset' })`.
  Resolverlo dinámicamente en vez de hardcodear `-03:00` evita que el
  cálculo se rompa si Argentina vuelve a usar horario de verano.
- `calcularProximoDisparo(programacion, desde)`: devuelve la próxima
  ocurrencia de `diaSemanaDisparo` a `horaDisparo` en hora de
  Argentina, estrictamente posterior a `desde`.
- `calcularUltimoDisparo(programacion, hasta)`: devuelve la ocurrencia más
  reciente de `diaSemanaDisparo` a `horaDisparo` en o antes de `hasta`.
- `calcularFechaPartido(programacion, momentoDisparo)`: devuelve la
  primera ocurrencia de `diaSemanaPartido` a `horaPartido` estrictamente
  posterior a `momentoDisparo`; si el día de semana del partido es el
  mismo que el del disparo, devuelve la ocurrencia de 7 días después.

Ambas funciones devuelven objetos `Date` y son puras: reciben el
momento de referencia como parámetro en vez de leer el reloj, para que
el comportamiento sea predecible.

## Servicio

`backend/src/services/programacionesService.js`, con el patrón de
errores del resto de los servicios (`crearErrorValidacion` que setea
`error.status = 400`).

- `listarProgramaciones(grupoId)`: devuelve las filas del grupo,
  ordenadas por `proximoDisparo`.
- `crearProgramacion(datos, grupoId, creadoPor)`: valida, calcula
  `proximoDisparo` desde el momento actual y persiste.
- `actualizarProgramacion(programacionId, grupoId, cambios)`: valida,
  y si cambió `diaSemanaDisparo` o `horaDisparo`, recalcula
  `proximoDisparo`. Cubre también el alta y baja de `activa`.
- `eliminarProgramacion(programacionId, grupoId)`.
- `ejecutarProgramacionesVencidas()`: el barrido.

Validaciones, todas con status 400:

- `diaSemanaDisparo` y `diaSemanaPartido`: enteros entre 0 y 6.
- `horaDisparo` y `horaPartido`: string con formato `HH:MM` válido.
- `cupoTitulares`: entero mayor a 0. `cupoSuplentes`: entero mayor o
  igual a 0. `valorCuota`: entero mayor o igual a 0 o nulo. Mismas
  reglas que `partidosService.crearPartido`.

### Barrido

Para cada fila con `activa = 1` y `proximoDisparo <= ahora`, en orden de
`proximoDisparo`:

1. Calcular el disparo vencido **más reciente** con
   `calcularUltimoDisparo(fila, ahora)` y, desde ahí,
   `fechaPartido = calcularFechaPartido(fila, momentoDisparo)`. Se usa la
   ocurrencia más reciente y no el `proximoDisparo` guardado para que un
   backend que estuvo caído tres semanas cree el partido de esta semana en
   vez de intentar uno cuya fecha ya pasó.
2. Si `fechaPartido` ya pasó, no crear nada y seguir con la próxima fila.
   El nuevo `proximoDisparo` se calcula siempre como
   `calcularProximoDisparo(fila, ahora)`, que por definición queda en el
   futuro, así que una fila vencida nunca entra en bucle.
3. Si ya existe un `Partido` del mismo `grupoId` con esa misma `fecha`,
   no crear; solo avanzar `proximoDisparo`. Evita duplicados si el
   admin ya lo había creado a mano o si el barrido corre dos veces.
4. Crear el partido con `partidosService.crearPartido`, pasando la
   configuración guardada y `creadoPor` de la programación. Reusar ese
   servicio hereda la geocodificación de la dirección, la numeración
   por grupo y las notificaciones push y de WhatsApp de partido nuevo.
5. Guardar `ultimoDisparo`, `ultimoPartidoId` y el nuevo
   `proximoDisparo`, calculado desde el `proximoDisparo` anterior.

Cada fila se procesa dentro de su propio `try/catch`: una programación
con datos inválidos no puede frenar a las demás. Los errores se loguean
con `console.error`, igual que el resto del scheduler.

## Scheduler

En `backend/src/config/scheduler.js`:

- Agregar `programacionesService.ejecutarProgramacionesVencidas()` al
  bloque `cron.schedule('* * * * *')` existente, con su propio
  `try/catch`.
- Llamarlo también una vez al final de `iniciarScheduler()`, para que la
  recuperación de disparos perdidos ocurra al arrancar y no haya que
  esperar al siguiente minuto.

## API

Router nuevo `backend/src/routes/programacionesRoutes.js`
(`express.Router({ mergeParams: true })`), montado en `app.js` como
`/api/grupos/:grupoId/programaciones`, con `emitirActualizacionGrupo`
como los demás routers anidados en el grupo.

Todas las rutas pasan por `verificarToken` y
`verificarMiembroGrupo('admin')`, y los controladores van envueltos en
`envolverAsync`:

- `GET /`: lista las programaciones del grupo.
- `POST /`: crea una. Responde 201 con la programación creada.
- `PUT /:programacionId`: edita cualquier campo de configuración,
  incluido `activa`.
- `DELETE /:programacionId`: responde 204.

Controlador nuevo `backend/src/controllers/programacionesController.js`,
fino: parsea el body y delega en el servicio, como
`partidosController`.

## Frontend

`AdminPanel.jsx` ya tiene 466 líneas. La sección entera va en un
componente nuevo, `frontend/src/components/ProgramacionPartidos.jsx`,
que recibe el grupo activo y maneja su propia carga, alta, edición y
borrado. `AdminPanel` solo lo renderiza como una sección más.

El componente muestra:

- La lista de programaciones del grupo. Cada fila resume la regla en
  una línea legible ("Se crea los lunes 20:00 → partido viernes 20:00 ·
  Parador 4 · $10.000"), más el próximo disparo formateado y un
  indicador de activa o pausada.
- Botones por fila: editar, activar/pausar, borrar.
- Un formulario de alta y edición con los mismos campos que el
  formulario de creación manual de partidos (cupos, estadio, tipo de
  suelo, dirección, valor de cuota), más los selectores de día y hora
  de disparo y día y hora del partido.

El borrado pide confirmación antes de ejecutarse. Los estados de error
y de éxito usan el mismo patrón de `error` / `mensaje` que ya usa
`AdminPanel`.

## Manejo de errores

- Validaciones del servicio: 400 con mensaje en castellano.
- Acceso de no-admin o no-miembro: lo resuelve
  `verificarMiembroGrupo('admin')`, sin código nuevo.
- Programación inexistente o de otro grupo en `PUT` y `DELETE`: 404.
- Fallas durante el barrido: se loguean y no interrumpen al resto de
  las programaciones ni al scheduler.

## Testing

Sin tests automatizados, por preferencia explícita del usuario para
este proyecto.
