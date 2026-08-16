const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const inscripcionesService = require('./inscripcionesService');
const { enviarMail } = require('../utils/mailer');

const VENTANA_MIN_MS = 55 * 60 * 1000;
const VENTANA_MAX_MS = 65 * 60 * 1000;

function partidosPendientesDeRecordatorio() {
  const ahora = Date.now();
  const desde = new Date(ahora + VENTANA_MIN_MS).toISOString();
  const hasta = new Date(ahora + VENTANA_MAX_MS).toISOString();
  return db
    .prepare('SELECT * FROM Partidos WHERE recordatorioEnviado = 0 AND fecha >= ? AND fecha <= ?')
    .all(desde, hasta);
}

function marcarRecordatorioEnviado(partidoId) {
  db.prepare('UPDATE Partidos SET recordatorioEnviado = 1 WHERE id = ?').run(partidoId);
}

function formatearFechaHora(fechaIso) {
  return new Date(fechaIso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function armarHtml({ fechaTexto, equipo, companeros }) {
  const lineaEquipo = equipo ? `<p>Vos pertenecés al equipo ${escaparHtml(equipo)}.</p>` : '';
  const lineaCompaneros = companeros.length
    ? `<p>Titulares: ${companeros.map(escaparHtml).join(', ')}</p>`
    : '';
  return [
    `<p>Tu partido es el ${escaparHtml(fechaTexto)}.</p>`,
    lineaEquipo,
    lineaCompaneros,
    '<p>Sos titular, no faltes. No te cagués en tus amigos. La pelota no se mancha.</p>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function enviarRecordatoriosDePartido(partido) {
  // inscripcionesService no expone listarTitularesActivos en su module.exports
  // (existe pero solo se usa internamente), así que reutilizamos listarActivas
  // -que sí está exportada- y filtramos por tipo 'titular' acá.
  const inscripcionesTitulares = (await inscripcionesService.listarActivas(partido.id)).filter(
    (inscripcion) => inscripcion.tipo === 'titular'
  );
  if (inscripcionesTitulares.length === 0) {
    marcarRecordatorioEnviado(partido.id);
    return;
  }

  const titulares = await Promise.all(
    inscripcionesTitulares.map(async (inscripcion) => ({
      usuario: await usuariosService.obtenerUsuario(inscripcion.usuarioId),
      equipo: inscripcion.equipo,
    }))
  );

  const fechaTexto = formatearFechaHora(partido.fecha);

  for (const titular of titulares) {
    if (!titular.usuario) continue;
    const companeros = titulares
      .filter((otro) => otro.usuario && otro.usuario.uid !== titular.usuario.uid)
      .map((otro) => otro.usuario.nombre);

    try {
      await enviarMail({
        to: titular.usuario.email,
        subject: 'Tu partido es en 1 hora',
        html: armarHtml({ fechaTexto, equipo: titular.equipo, companeros }),
      });
    } catch (error) {
      console.error(`Error enviando recordatorio a ${titular.usuario.email}:`, error);
    }
  }

  marcarRecordatorioEnviado(partido.id);
}

async function enviarRecordatoriosPendientes() {
  const partidos = partidosPendientesDeRecordatorio();
  for (const partido of partidos) {
    await enviarRecordatoriosDePartido(partido);
  }
}

module.exports = { enviarRecordatoriosPendientes };
