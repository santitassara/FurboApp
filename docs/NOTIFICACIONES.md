# Notificaciones en FurboApp

Documento de referencia: todas las notificaciones que existen hoy en la app, por canal.

---

## 1. Email (SMTP vía nodemailer)

Archivo base: `backend/src/utils/mailer.js` (`enviarMail()`). Usa `SMTP_HOST/PORT/USER/PASS` del `.env`. Si no está configurado, no falla: solo loguea warning y no envía nada.

| # | Disparador | Origen (archivo/función) | Asunto / contenido |
|---|---|---|---|
| 1 | Partido arranca en ~1 hora (jugador titular) | `backend/src/services/recordatoriosService.js:83` `enviarRecordatoriosDePartido`. Corre cada minuto vía cron en `backend/server.js:33` (`enviarRecordatoriosPendientes`) | "Tu partido es en 1 hora" — HTML con fecha, equipo, compañeros titulares, tono informal ("no te cagués en tus amigos") |
| 2 | Usuario pide reset de contraseña | `backend/src/services/usuariosService.js:396` `solicitarResetPassword` | "Restablecer tu contraseña de FurboApp" — link `{FRONTEND_URL}/restablecer-password?token=...`, válido 1h |

No hay más templates de mail: no hay email de bienvenida, invitación a grupo, resultado de partido, ni sanción.

---

## 2. Push (Web Push + Firebase Cloud Messaging)

Servicio: `backend/src/services/notificacionesService.js` → `notificarUsuario()`. Envía por **web-push** (VAPID) si el usuario tiene `suscripcionPush`, y/o por **Firebase Admin Messaging** (`admin.messaging().send()`) si tiene `fcmToken` (caso app Android nativa vía Capacitor).

| # | Disparador | Origen | Título / cuerpo |
|---|---|---|---|
| 1 | Cron, partido arranca en ~1h (titular) | `enviarNotificacionesPrePartido` en `backend/src/config/scheduler.js`, cron cada minuto | "Recordatorio: Partido a las HH:MM" / "Sos titular... No seas Pancho/García" |
| 2 | Cron, ~2h después de cargado el resultado | `enviarNotificacionesPostPartido` | "Puntuá el partido" / "Acordate de puntuar..." |
| 3 | Admin crea un partido nuevo | `backend/src/services/partidosService.js:44` → `enviarNotificacionNuevoPartido` | "Nuevo partido disponible" / "Hay un nuevo partido de tu grupo..." |
| 4 | Se crea la 5ª propuesta de formación (se abre votación) | `backend/src/services/formacionesPropuestasService.js:71` → `enviarNotificacionVotacionAbierta` | "Ya podés votar los equipos" |
| 5 | Cron, faltan 72/48/24h para el partido y el usuario no votó formación | `enviarRecordatoriosVotacion` | "Todavía no votaste - faltan Xhs" |
| 6 | Admin revoca sanción a un jugador | `backend/src/services/gruposService.js:119` → `enviarNotificacionPerdonSancion` | "Sanción revocada" / "El admin evaluó tu caso y fuiste perdonado" |
| 7 | Se cierra la votación de equipos (todos los titulares votaron o el admin cierra manual) | `backend/src/services/formacionesPropuestasService.js` → `aplicarGanadora` (llamada desde `votar` y `cerrarManual`) → `notificacionesService.js:209` `enviarNotificacionVotacionCerrada` | "Los equipos ya están definidos" / "Se cerró la votación de equipos... Mirá en qué equipo quedaste" |

**Frontend / registro de push**: `frontend/src/services/notificacionesService.js` registra la suscripción — Web Push (`/sw.js` + VAPID key) en navegador, o token FCM vía `@capacitor-firebase/messaging` cuando corre nativo en Android (`Capacitor.isNativePlatform()`). Se dispara desde `AuthContext.jsx` en login / refresh de token.

Service worker: `frontend/public/sw.js` maneja eventos `push` y `notificationclick`.

**Android**: wrapper es **Capacitor** (no Cordova/React Native) — carpeta `frontend/android/`, `frontend/capacitor.config.json`, deps `@capacitor/android`, `@capacitor-firebase/messaging`, `@capacitor-firebase/authentication`.

**Nota sobre VAPID key**: el commit que "removió" `VITE_VAPID_PUBLIC_KEY` de `.env.example` solo blanqueó un valor filtrado — la funcionalidad de push sigue intacta y activa en backend y frontend. `VITE_VAPID_PUBLIC_KEY` / `VAPID_PUBLIC_KEY` siguen como placeholders vacíos en ambos `.env.example`.

---

## 3. In-app (toast dentro de la web/app)

- **UI**: `frontend/src/components/Toast.jsx` + `ToastProvider.jsx`. Al loguearse, hace polling a `GET /usuarios/me/notificaciones/pendientes`.
- **Contenido único hoy**: "Te calificaron, mirá los resultados en tu perfil" — se muestra cuando existe una fila pendiente de tipo `calificacion_cerrada`.
- **Backend**: tabla `Notificaciones` + `backend/src/services/notificacionesInternasService.js`:
  - `crearPorVotacionCerrada` — crea una fila por jugador calificado, llamada desde `ratingService.js:136` cuando se cierra la votación/calificación.
  - `obtenerYMarcarPendientes` — usada por `usuariosController.js:61`, lee y marca como leídas.
- No existe campanita ni listado histórico de notificaciones, ni `NotificationContext` genérico: es un solo tipo de toast.

---

## Resumen rápido

| Canal | Cantidad de triggers | Implementado |
|---|---|---|
| Email | 2 | Sí (requiere SMTP configurado en `.env`) |
| Push (web + Android/FCM) | 7 | Sí, completo |
| In-app (toast) | 1 | Sí |

**No existe**: email de bienvenida/invitación/resultado, campanita de notificaciones, notificación nativa Android fuera del plugin FCM de Capacitor.
