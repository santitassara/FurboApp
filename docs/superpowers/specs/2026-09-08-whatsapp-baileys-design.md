# Notificaciones por WhatsApp (Baileys) — Diseño

Fecha: 2026-09-08
Estado: aprobado por usuario, sin tests (decisión explícita)

## 1. Objetivo

Agregar un canal de notificación por WhatsApp, además de los ya existentes (push web,
FCM, email). Los mensajes se mandan a un grupo de WhatsApp real vinculado a cada Grupo
de FurboApp (no DMs individuales), usando `@todos` para mencionar a todos los
participantes del chat.

Fuera de alcance: tests automatizados (decisión explícita del usuario), pantalla
frontend para vincular el JID (se hace vía API directa por ahora).

## 2. Librería y sesión de Baileys

- Dependencia nueva: `@whiskeysockets/baileys` (fork mantenido; el paquete `baileys` a
  secas está abandonado) + `qrcode-terminal` (solo para imprimir el QR de pairing en
  consola).
- Socket único global, inicializado una vez al boot del server.
- Auth persistida con `useMultiFileAuthState` en `backend/data/whatsapp_auth/`
  (gitignored, mismo patrón que `backend/data/furboapp.db`).
- Primer uso: no hay sesión guardada -> se imprime QR en la consola del server, se
  escanea una vez con el número ya existente. Sesiones siguientes reconectan solas.
- Reconexión automática ante `connection.update` con `close` salvo que el motivo sea
  `DisconnectReason.loggedOut` (ahí no reintenta, hay que volver a escanear QR).
- Si el socket no está conectado al momento de mandar un mensaje: se loguea warning y
  se skippea ese envío (no rompe el resto del batch), mismo patrón que
  `notificacionesService.enviarNotificacion` ante errores.

## 3. Modelo de datos

### Columna nueva: `Grupos.whatsappGrupoJid`
`TEXT`, nullable. JID del grupo de WhatsApp vinculado a este Grupo de FurboApp. Si es
`NULL`, ese Grupo no manda nada por WhatsApp (todas las funciones de envío chequean
esto primero y skippean en silencio).

Agregado en `backend/src/config/db.js` seteado con el mismo patrón `ALTER TABLE`
guardado por `PRAGMA table_info` que ya usa el resto del archivo.

### Tabla nueva: `WhatsappRecordatoriosDiarios`
Dedupe de los cron jobs diarios (13hs y 15hs) para no mandar el mismo mensaje dos veces
el mismo día si el cron corre de nuevo o el server reinicia.

```sql
CREATE TABLE IF NOT EXISTS WhatsappRecordatoriosDiarios (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  tipo TEXT NOT NULL, -- 'anotate' | 'post_partido'
  fecha TEXT NOT NULL -- fecha local (YYYY-MM-DD, America/Argentina/Buenos_Aires) del envío
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_recordatorio_diario_unico
  ON WhatsappRecordatoriosDiarios (partidoId, tipo, fecha);
```

Agregada directamente en `backend/src/db/schema.sql` (mismo lugar que
`RecordatoriosVotacionEnviados`), ya que es tabla nueva, no ALTER de una existente.

## 4. Módulo Baileys: `backend/src/config/whatsapp.js`

Responsabilidad única: ciclo de vida del socket y primitivas de envío/lectura. No sabe
nada de partidos ni de triggers.

```js
async function iniciarWhatsapp()       // arranca el socket, maneja reconexión, imprime QR
function obtenerEstadoConexion()       // 'conectado' | 'desconectado' (para logs/health)
async function enviarMensajeGrupo(jid, texto)
  // 1. socket.groupMetadata(jid) -> participants
  // 2. socket.sendMessage(jid, { text: texto, mentions: participants.map(p => p.id) })
  // 3. try/catch -> log y no relanza
async function listarGruposDisponibles()
  // socket.groupFetchAllParticipating() -> [{ jid, nombre }]
```

`server.js` llama `iniciarWhatsapp()` una vez al boot, junto al resto de la
inicialización (mailer, scheduler, etc.).

## 5. Módulo de negocio: `backend/src/services/whatsappNotificacionesService.js`

Arma los textos y decide si corresponde mandar, por cada trigger. Todas las funciones
reciben el `grupoId`/`partidoId` igual que sus contrapartes en `notificacionesService`,
resuelven el Grupo, y si `whatsappGrupoJid` es `NULL` no hacen nada.

Textos (literal, según lo definido con el usuario):

| Trigger | Texto |
|---|---|
| Nuevo partido (inmediato) | `@todos Hay partido el dia {dia} a las {hora} ANOTATE!!` |
| Recordatorio diario 13hs (mientras cupo no lleno y no llegó el día del partido) | mismo texto que arriba |
| Recordatorio partido (1h antes) | `@todos ` + texto actual de `enviarNotificacionesPrePartido` |
| Votación abierta | `@todos ` + texto actual de `enviarNotificacionVotacionAbierta` |
| Votación cerrada | `@todos ` + texto actual de `enviarNotificacionVotacionCerrada` |
| Recordatorios de votación (72/48/24hs) | `@todos ` + texto actual de `enviarRecordatoriosVotacion` |
| Post-partido (inmediato) | `@todos Valoren la actuacion de los participantes del partido` |
| Recordatorio diario 15hs (post-partido, hasta votación cerrada) | mismo texto que arriba |
| Perdón de sanción | **excluido**, no se manda por WhatsApp |

`{dia}` / `{hora}` formateados en `America/Argentina/Buenos_Aires`, mismo criterio que
`formatearFechaHora` existente.

Funciones expuestas (llamadas "fire and forget" con `.catch()` igual que las de
`notificacionesService`, para no bloquear el flujo principal si WhatsApp falla):

```js
async function enviarWhatsappNuevoPartido(partidoId)
async function enviarWhatsappRecordatorioPartido(partido)       // recibe la fila de Partidos ya resuelta
async function enviarWhatsappVotacionAbierta(partidoId)
async function enviarWhatsappVotacionCerrada(partidoId)
async function enviarWhatsappRecordatoriosVotacion(partidoId, ventana)
async function enviarWhatsappPostPartido(partidoId)

async function enviarWhatsappRecordatoriosDiariosAnotate()      // cron 13hs, recorre partidos
async function enviarWhatsappRecordatoriosDiariosPostPartido()  // cron 15hs, recorre partidos
```

### Condición cupo no lleno (recordatorio diario 13hs)
`COUNT(Inscripciones WHERE partidoId=? AND tipo='titular' AND estado='anotado') <
Partidos.cupoTitulares`

### Condición "no llegó el día del partido" (recordatorio diario 13hs)
Se deja de mandar el día calendario del partido (ese día ya lo cubre el recordatorio de
1h antes). Comparación por fecha local, no por timestamp exacto.

## 6. Puntos de integración (hooks)

Se agrega una llamada `whatsappNotificacionesService.enviarWhatsapp...(...).catch(...)`
al lado de cada llamada existente a `notificacionesService`, mismo archivo y línea:

- `backend/src/services/partidosService.js:44` (al lado de
  `enviarNotificacionNuevoPartido`) -> `enviarWhatsappNuevoPartido`.
- `backend/src/services/formacionesPropuestasService.js:71` (al lado de
  `enviarNotificacionVotacionAbierta`) -> `enviarWhatsappVotacionAbierta`.
- `backend/src/services/formacionesPropuestasService.js:169` (al lado de
  `enviarNotificacionVotacionCerrada`) -> `enviarWhatsappVotacionCerrada`.
- `backend/src/services/notificacionesService.js`, dentro de
  `enviarNotificacionesPrePartido` (recordatorio 1h) -> `enviarWhatsappRecordatorioPartido`.
- `backend/src/services/notificacionesService.js`, dentro de
  `enviarNotificacionesPostPartido` -> `enviarWhatsappPostPartido`.
- `backend/src/services/notificacionesService.js`, dentro de
  `enviarRecordatoriosVotacion` (por ventana) -> `enviarWhatsappRecordatoriosVotacion`.
- `backend/src/services/gruposService.js:119` (perdón de sanción): **no se toca**, ese
  trigger queda excluido de WhatsApp.

No se modifica el comportamiento de push/email existente; WhatsApp es un canal
adicional en paralelo.

## 7. Cron jobs diarios

Se agregan a `backend/src/config/scheduler.js`, mismo `iniciarScheduler()`, usando
`node-cron` (ya es dependencia):

```js
cron.schedule('0 13 * * *', () => whatsappNotificacionesService.enviarWhatsappRecordatoriosDiariosAnotate());
cron.schedule('0 15 * * *', () => whatsappNotificacionesService.enviarWhatsappRecordatoriosDiariosPostPartido());
```

Cada función recorre los partidos candidatos, chequea contra
`WhatsappRecordatoriosDiarios` si ya se mandó hoy (por `partidoId` + `tipo`), y si no,
manda e inserta el registro dedupe.

## 8. Mención real de `@todos`

`enviarMensajeGrupo` arma `mentions: participantes.map(p => p.id)` (todos los JIDs del
grupo) junto al texto literal que dice `@todos`. WhatsApp resuelve la mención real de
todos los participantes aunque el texto no contenga sus números.

## 9. Configuración del JID por Grupo

Sin frontend por ahora (decisión explícita, se configura vía API):

- `GET /api/whatsapp/grupos-disponibles` — nueva ruta, `verificarSuperAdmin()`. Lista
  los grupos de WhatsApp donde ya está el número vinculado
  (`listarGruposDisponibles()`). Router nuevo `backend/src/routes/whatsappRoutes.js`,
  montado en `app.js` como `app.use('/api/whatsapp', whatsappRoutes)`.
- `PUT /api/grupos/:grupoId/whatsapp` — nueva ruta en `gruposRoutes.js`,
  `verificarMiembroGrupo('admin')` (mismo criterio que crear partido). Body `{ jid }`.
  Guarda `whatsappGrupoJid` en el Grupo. Controlador nuevo:
  `gruposController.vincularWhatsapp`, service `gruposService.vincularWhatsapp(grupoId, jid)`.

## 10. Configuración / entorno

- `.env` backend: `WHATSAPP_AUTH_DIR` (opcional, default
  `backend/data/whatsapp_auth`), siguiendo el mismo patrón que `SQLITE_DB_PATH`.
- `package.json`: agregar `@whiskeysockets/baileys` y `qrcode-terminal`.
- `.gitignore`: agregar `backend/data/whatsapp_auth/`.

## 11. Manejo de errores

- Grupo sin `whatsappGrupoJid` -> skip silencioso, sin log (caso normal, no todos los
  Grupos van a usar WhatsApp).
- Socket desconectado -> log warning, skip ese envío, sigue el resto del batch.
- Falla puntual de un `sendMessage` (rate limit, grupo eliminado, etc.) -> try/catch
  local, log de error, no relanza (mismo patrón que el resto de
  `notificacionesService`).

## 12. Fuera de alcance (explícito)

- Tests automatizados.
- Frontend para vincular el JID (se hace por API directa).
- Envío por WhatsApp del perdón de sanción (excluido a pedido del usuario).
