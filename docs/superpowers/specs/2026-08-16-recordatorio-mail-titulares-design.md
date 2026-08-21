# Recordatorio por mail a titulares 1 hora antes del partido

## Contexto y objetivo

Los jugadores anotados como titulares en un partido no reciben ningún aviso
cercano al horario de juego. Se busca un job automático de backend que, 1
hora antes del inicio de cada partido, envíe un mail a cada titular anotado
recordándole que juega, con la lista de sus compañeros titulares y su
equipo asignado (si ya está formado).

Solo se avisa a titulares (no a suplentes). Si un partido llega a la
ventana de 1 hora sin titulares anotados, no se envía nada.

## Alcance

- Nuevo job periódico en el backend (mismo patrón que
  `cerrarPartidosVencidosSeguro` en `server.js`).
- Nuevo servicio `recordatoriosService.js`.
- Nuevo util `mailer.js` que envuelve `nodemailer` (SMTP).
- Columna nueva `recordatorioEnviado` en `Partidos`.
- Nuevas variables de entorno SMTP en `backend/.env`.
- Fuera de alcance: endpoints HTTP nuevos, UI, reintentos con backoff,
  cola de mails, notificaciones a suplentes o admins.

## Arquitectura

- **Scheduler**: `setInterval` en `server.js`, cada 5 minutos, siguiendo el
  mismo patrón que el cierre de partidos vencidos (wrapper con try/catch
  para no tumbar el proceso si algo falla).
- **Servicio**: `src/services/recordatoriosService.js` con la función
  `enviarRecordatoriosPendientes()`, invocada por el interval.
- **Mailer**: `src/utils/mailer.js`, crea el transporte de `nodemailer` a
  partir de variables de entorno y expone `enviarMail({ to, subject,
  html })`. Si faltan variables SMTP, loguea warning una sola vez al boot
  y las llamadas a `enviarMail` no-opean (resuelven sin enviar), para no
  romper el servidor en dev sin config de mail.

## Modelo de datos

Migración en `src/config/db.js`, mismo patrón `ALTER TABLE` condicional
usado para las demás columnas agregadas:

```sql
ALTER TABLE Partidos ADD COLUMN recordatorioEnviado INTEGER NOT NULL DEFAULT 0
```

No se agregan tablas nuevas. No se registra qué mails individuales
fallaron: la marca es a nivel partido, no a nivel destinatario.

## Flujo detallado

1. Cada 5 minutos, `enviarRecordatoriosPendientes()`:
   - Query: partidos con `recordatorioEnviado = 0` y
     `fecha` dentro de la ventana `[ahora + 55min, ahora + 65min]`.
   - No se filtra por `estado` del partido (puede estar `abierto` o
     `cerrado` según cuándo se cierre el cupo; lo relevante es la
     ventana de tiempo).
2. Por cada partido en la ventana:
   - Buscar inscripciones con `tipo = 'titular' AND estado = 'anotado'`,
     con join a `Usuarios` para obtener `nombre` y `email`.
   - Si no hay titulares: marcar `recordatorioEnviado = 1` y continuar
     con el siguiente partido (no se envía nada).
   - Si hay titulares: por cada titular, armar y enviar un mail
     individual (ver contenido abajo) con la lista del resto de los
     titulares y, si `equipo` no es null, el equipo asignado.
   - Un fallo de envío individual (`enviarMail` rechaza) se loguea con
     `console.error` y no interrumpe el envío a los demás titulares del
     partido.
   - Al terminar de intentar con todos los titulares del partido
     (hayan fallado o no envíos individuales), marcar
     `recordatorioEnviado = 1`. No hay reintento posterior: un fallo de
     SMTP puntual implica que ese jugador se queda sin mail para ese
     partido.

## Contenido del mail

- **Asunto**: `Tu partido es en 1 hora`
- **Cuerpo** (texto plano o HTML simple):
  - Fecha y hora del partido, formateada en zona horaria local.
  - Si `equipo` asignado: línea `Vos pertenecés al equipo A` (o `B`).
  - Lista de nombres de los demás titulares anotados.
  - Cierre fijo: `Sos titular, no faltes. No te cagués en tus amigos. La
    pelota no se mancha.`

## Configuración

Nuevas variables en `backend/.env` (documentar en `.env.example` si
existe): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.

## Manejo de errores

- Wrapper del interval con try/catch (igual que
  `cerrarPartidosVencidosSeguro`): una excepción no controlada en el
  servicio no debe tumbar el proceso.
- Fallo de un mail individual: se loguea, no bloquea a los demás
  destinatarios ni al resto de partidos en la corrida.
- SMTP no configurado: `mailer.js` loguea warning al boot y `enviarMail`
  no-opea; el resto del flujo (marcar `recordatorioEnviado`) sigue
  funcionando igual.

## Testing

Jest sobre `recordatoriosService` con `mailer` mockeado:
- Partido dentro de la ventana con titulares → envía un mail por
  titular y marca `recordatorioEnviado = 1`.
- Partido dentro de la ventana sin titulares → no envía nada, marca
  `recordatorioEnviado = 1`.
- Partido con `recordatorioEnviado = 1` ya seteado → se ignora aunque
  esté en la ventana.
- Partido fuera de la ventana (antes o después) → se ignora.
- Falla un envío individual → el resto de los titulares igual reciben
  su mail y el partido se marca como procesado.
