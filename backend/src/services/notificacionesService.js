const webpush = require('web-push');
const { db } = require('../config/db');

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
    console.warn('VAPID keys no configurados. Notificaciones deshabilitadas.');
    return;
  }

  try {
    const suscripcion = JSON.parse(suscripcionJson);
    await webpush.sendNotification(suscripcion, JSON.stringify({
      title: titulo,
      ...opciones,
    }));
  } catch (error) {
    console.error('Error enviando notificación:', error.message);
  }
}

async function enviarNotificacionesPrePartido() {
  // Buscar partidos que son en 1 hora, abiertos, sin recordatorio enviado
  const ahora = new Date();
  const en1Hora = new Date(ahora.getTime() + 60 * 60 * 1000);

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
      SELECT u.uid, u.suscripcionPush
      FROM Inscripciones i
      JOIN Usuarios u ON i.usuarioId = u.uid
      WHERE i.partidoId = ?
        AND i.tipo = 'titular'
        AND i.estado = 'anotado'
        AND u.suscripcionPush IS NOT NULL
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
      await enviarNotificacion(titular.suscripcionPush, titulo, opciones);
    }

    // Marcar como enviado
    db.prepare('UPDATE Partidos SET recordatorioEnviado = 1 WHERE id = ?').run(partido.id);
  }
}

async function enviarNotificacionesPostPartido() {
  // Buscar partidos jugados hace 1 hora
  const ahora = new Date();
  const hace1Hora = new Date(ahora.getTime() - 60 * 60 * 1000);

  // Ventana: partidos jugados entre hace61min y hace59min
  const desde = new Date(ahora.getTime() - 61 * 60 * 1000).toISOString();
  const hasta = new Date(ahora.getTime() - 59 * 60 * 1000).toISOString();

  const partidos = db.prepare(`
    SELECT p.id, p.grupoId, g.nombre as nombreGrupo
    FROM Partidos p
    JOIN Grupos g ON p.grupoId = g.id
    WHERE p.estado = 'jugado'
      AND p.recordatorioPostPartidoEnviado = 0
      AND p.fecha >= ? AND p.fecha <= ?
  `).all(desde, hasta);

  for (const partido of partidos) {
    // Buscar jugadores que se anotaron en el partido
    const jugadores = db.prepare(`
      SELECT u.uid, u.suscripcionPush
      FROM Inscripciones i
      JOIN Usuarios u ON i.usuarioId = u.uid
      WHERE i.partidoId = ?
        AND i.estado = 'anotado'
        AND u.suscripcionPush IS NOT NULL
    `).all(partido.id);

    const titulo = '¿Cómo estuvo el partido?';
    const opciones = {
      body: 'No te olvides de nominar tu MVP y puntuar a los jugadores',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `post-partido-${partido.id}`,
      data: {
        url: `/grupos/${partido.grupoId}/ratings`,
      },
    };

    for (const jugador of jugadores) {
      await enviarNotificacion(jugador.suscripcionPush, titulo, opciones);
    }

    // Marcar como enviado
    db.prepare('UPDATE Partidos SET recordatorioPostPartidoEnviado = 1 WHERE id = ?').run(partido.id);
  }
}

module.exports = {
  enviarNotificacionesPrePartido,
  enviarNotificacionesPostPartido,
};
