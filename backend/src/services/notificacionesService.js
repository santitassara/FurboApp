const crypto = require('node:crypto');
const webpush = require('web-push');
const { db } = require('../config/db');
const { admin } = require('../config/firebase');

const VENTANAS_RECORDATORIO_VOTACION_HORAS = [72, 48, 24];

function formatearFechaHora(fecha) {
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Configurar VAPID keys (deben estar en .env)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@furboapp.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function enviarNotificacion(suscripcionJson, titulo, opciones = {}) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys no configurados. Notificaciones web deshabilitadas.');
    return;
  }

  try {
    const suscripcion = JSON.parse(suscripcionJson);
    await webpush.sendNotification(suscripcion, JSON.stringify({
      title: titulo,
      ...opciones,
    }));
  } catch (error) {
    console.error('Error enviando notificación web:', error.message);
  }
}

async function enviarNotificacionFcm(fcmToken, titulo, opciones = {}) {
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: titulo,
        body: opciones.body,
      },
      data: Object.fromEntries(
        Object.entries(opciones.data || {}).map(([clave, valor]) => [clave, String(valor)])
      ),
    });
  } catch (error) {
    if (error.code === 'messaging/registration-token-not-registered') {
      db.prepare('UPDATE Usuarios SET fcmToken = NULL WHERE fcmToken = ?').run(fcmToken);
    } else {
      console.error('Error enviando notificación FCM:', error.message);
    }
  }
}

async function notificarUsuario(usuario, titulo, opciones = {}) {
  if (usuario.suscripcionPush) {
    await enviarNotificacion(usuario.suscripcionPush, titulo, opciones);
  }
  if (usuario.fcmToken) {
    await enviarNotificacionFcm(usuario.fcmToken, titulo, opciones);
  }
}

async function enviarNotificacionesPrePartido() {
  // Buscar partidos que son en 1 hora, abiertos, sin recordatorio enviado
  const ahora = new Date();

  // Ventana: partidos entre ahora+59min y ahora+61min
  const desde = new Date(ahora.getTime() + 59 * 60 * 1000).toISOString();
  const hasta = new Date(ahora.getTime() + 61 * 60 * 1000).toISOString();

  const partidos = db.prepare(`
    SELECT p.id, p.fecha, p.grupoId, g.nombre as nombreGrupo
    FROM Partidos p
    JOIN Grupos g ON p.grupoId = g.id
    WHERE p.estado = 'abierto'
      AND p.recordatorioEnviado = 0
      AND p.fecha >= ? AND p.fecha <= ?
  `).all(desde, hasta);

  for (const partido of partidos) {
    // Buscar titulares del partido
    const titulares = db.prepare(`
      SELECT u.uid, u.suscripcionPush, u.fcmToken
      FROM Inscripciones i
      JOIN Usuarios u ON i.usuarioId = u.uid
      WHERE i.partidoId = ?
        AND i.tipo = 'titular'
        AND i.estado = 'anotado'
        AND (u.suscripcionPush IS NOT NULL OR u.fcmToken IS NOT NULL)
    `).all(partido.id);

    const horarioPartido = new Date(partido.fecha).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const titulo = `Recordatorio: Partido a las ${horarioPartido}`;
    const opciones = {
      body: `Sos titular en el partido del grupo ${partido.nombreGrupo}. No seas Pancho/García y llega a horario`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `recordatorio-${partido.id}`,
      data: {
        url: '/',
      },
    };

    for (const titular of titulares) {
      await notificarUsuario(titular, titulo, opciones);
    }

    // Marcar como enviado
    db.prepare('UPDATE Partidos SET recordatorioEnviado = 1 WHERE id = ?').run(partido.id);
  }
}

async function enviarNotificacionesPostPartido() {
  // Buscar partidos con resultado cargado hace 2 horas (ancla = Resultados.fechaCarga,
  // no la fecha agendada del partido, porque el pase a 'jugado' es manual y puede demorar).
  const ahora = new Date();

  // Ventana: resultado cargado entre hace121min y hace119min
  const desde = new Date(ahora.getTime() - 121 * 60 * 1000).toISOString();
  const hasta = new Date(ahora.getTime() - 119 * 60 * 1000).toISOString();

  const partidos = db.prepare(`
    SELECT p.id, p.grupoId, g.nombre as nombreGrupo
    FROM Partidos p
    JOIN Grupos g ON p.grupoId = g.id
    JOIN Resultados r ON r.partidoId = p.id
    WHERE p.estado = 'jugado'
      AND p.recordatorioPostPartidoEnviado = 0
      AND r.fechaCarga >= ? AND r.fechaCarga <= ?
  `).all(desde, hasta);

  for (const partido of partidos) {
    // Buscar jugadores que se anotaron en el partido
    const jugadores = db.prepare(`
      SELECT u.uid, u.suscripcionPush, u.fcmToken
      FROM Inscripciones i
      JOIN Usuarios u ON i.usuarioId = u.uid
      WHERE i.partidoId = ?
        AND i.estado = 'anotado'
        AND (u.suscripcionPush IS NOT NULL OR u.fcmToken IS NOT NULL)
    `).all(partido.id);

    const titulo = 'Puntuá el partido';
    const opciones = {
      body: 'Acordate de puntuar el rendimiento de los jugadores para actualizar sus skills',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `post-partido-${partido.id}`,
      data: {
        url: `/grupos/${partido.grupoId}/ratings`,
      },
    };

    for (const jugador of jugadores) {
      await notificarUsuario(jugador, titulo, opciones);
    }

    // Marcar como enviado
    db.prepare('UPDATE Partidos SET recordatorioPostPartidoEnviado = 1 WHERE id = ?').run(partido.id);
  }
}

async function enviarNotificacionNuevoPartido(partidoId) {
  const partido = db.prepare(`
    SELECT p.id, p.fecha, p.grupoId, p.cupoTitulares, g.nombre as nombreGrupo
    FROM Partidos p
    JOIN Grupos g ON p.grupoId = g.id
    WHERE p.id = ?
  `).get(partidoId);
  if (!partido) return;

  const miembros = db.prepare(`
    SELECT u.uid, u.suscripcionPush, u.fcmToken
    FROM UsuariosGrupos ug
    JOIN Usuarios u ON u.uid = ug.usuarioId
    WHERE ug.grupoId = ? AND (u.suscripcionPush IS NOT NULL OR u.fcmToken IS NOT NULL)
  `).all(partido.grupoId);

  const titulo = 'Nuevo partido disponible';
  const opciones = {
    body: `Hay un nuevo partido de tu grupo "${partido.nombreGrupo}" para el ${formatearFechaHora(partido.fecha)}. Anotate ahora antes que se llene el cupo (${partido.cupoTitulares} jugadores)`,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: `nuevo-partido-${partido.id}`,
    data: {
      url: '/inicio',
    },
  };

  for (const miembro of miembros) {
    await notificarUsuario(miembro, titulo, opciones);
  }
}

async function enviarNotificacionVotacionAbierta(partidoId) {
  const partido = db.prepare(`
    SELECT p.id, p.fecha, p.grupoId, g.nombre as nombreGrupo
    FROM Partidos p
    JOIN Grupos g ON p.grupoId = g.id
    WHERE p.id = ?
  `).get(partidoId);
  if (!partido) return;

  const titulares = db.prepare(`
    SELECT u.uid, u.suscripcionPush, u.fcmToken
    FROM Inscripciones i
    JOIN Usuarios u ON i.usuarioId = u.uid
    WHERE i.partidoId = ?
      AND i.tipo = 'titular'
      AND i.estado = 'anotado'
      AND (u.suscripcionPush IS NOT NULL OR u.fcmToken IS NOT NULL)
  `).all(partido.id);

  const titulo = 'Ya podés votar los equipos';
  const opciones = {
    body: `Ya podés votar los equipos posibles para el partido del grupo "${partido.nombreGrupo}", ${formatearFechaHora(partido.fecha)}`,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: `votacion-abierta-${partido.id}`,
    data: {
      url: '/inicio',
    },
  };

  for (const titular of titulares) {
    await notificarUsuario(titular, titulo, opciones);
  }
}

async function enviarRecordatoriosVotacion() {
  const ahora = new Date();

  for (const ventana of VENTANAS_RECORDATORIO_VOTACION_HORAS) {
    const objetivo = ahora.getTime() + ventana * 60 * 60 * 1000;
    const desde = new Date(objetivo - 60 * 1000).toISOString();
    const hasta = new Date(objetivo + 60 * 1000).toISOString();

    const partidos = db.prepare(`
      SELECT p.id
      FROM Partidos p
      WHERE p.estado = 'abierto'
        AND p.votacionEquiposCerrada = 0
        AND EXISTS (SELECT 1 FROM FormacionesPropuestas fp WHERE fp.partidoId = p.id)
        AND p.fecha >= ? AND p.fecha <= ?
    `).all(desde, hasta);

    for (const partido of partidos) {
      const titularesSinVoto = db.prepare(`
        SELECT u.uid, u.suscripcionPush, u.fcmToken
        FROM Inscripciones i
        JOIN Usuarios u ON i.usuarioId = u.uid
        WHERE i.partidoId = ?
          AND i.tipo = 'titular'
          AND i.estado = 'anotado'
          AND (u.suscripcionPush IS NOT NULL OR u.fcmToken IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM VotosFormacion v WHERE v.partidoId = i.partidoId AND v.usuarioId = i.usuarioId
          )
          AND NOT EXISTS (
            SELECT 1 FROM RecordatoriosVotacionEnviados r
            WHERE r.partidoId = i.partidoId AND r.usuarioId = i.usuarioId AND r.ventana = ?
          )
      `).all(partido.id, ventana);

      const titulo = `Todavía no votaste - faltan ${ventana}hs`;
      const opciones = {
        body: 'Acordate de votar tu formación, después no hay quejas por los equipos',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: `recordatorio-votacion-${partido.id}-${ventana}`,
        data: {
          url: '/',
        },
      };

      for (const titular of titularesSinVoto) {
        await notificarUsuario(titular, titulo, opciones);
        db.prepare(
          `INSERT INTO RecordatoriosVotacionEnviados (id, partidoId, usuarioId, ventana) VALUES (?, ?, ?, ?)`
        ).run(crypto.randomUUID(), partido.id, titular.uid, ventana);
      }
    }
  }
}

module.exports = {
  enviarNotificacionesPrePartido,
  enviarNotificacionesPostPartido,
  enviarNotificacionNuevoPartido,
  enviarNotificacionVotacionAbierta,
  enviarRecordatoriosVotacion,
};
