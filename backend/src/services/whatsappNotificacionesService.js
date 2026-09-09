const crypto = require('node:crypto');
const { db } = require('../config/db');
const whatsapp = require('../config/whatsapp');

const ZONA = 'America/Argentina/Buenos_Aires';

function fechaLocalYMD(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('en-CA', { timeZone: ZONA });
}

function formatearDiaYHora(fechaIso) {
  const fecha = new Date(fechaIso);
  const dia = fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: ZONA,
  });
  const hora = fecha.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });
  return { dia, hora };
}

function obtenerPartidoConGrupo(partidoId) {
  return db
    .prepare(
      `SELECT p.*, g.nombre AS nombreGrupo, g.whatsappGrupoJid
       FROM Partidos p JOIN Grupos g ON g.id = p.grupoId
       WHERE p.id = ?`
    )
    .get(partidoId);
}

function yaEnviadoHoy(partidoId, tipo) {
  const hoy = fechaLocalYMD(new Date().toISOString());
  return Boolean(
    db
      .prepare('SELECT id FROM WhatsappRecordatoriosDiarios WHERE partidoId = ? AND tipo = ? AND fecha = ?')
      .get(partidoId, tipo, hoy)
  );
}

function marcarEnviadoHoy(partidoId, tipo) {
  const hoy = fechaLocalYMD(new Date().toISOString());
  db.prepare('INSERT OR IGNORE INTO WhatsappRecordatoriosDiarios (id, partidoId, tipo, fecha) VALUES (?, ?, ?, ?)').run(
    crypto.randomUUID(),
    partidoId,
    tipo,
    hoy
  );
}

function textoAnotate(partido) {
  const { dia, hora } = formatearDiaYHora(partido.fecha);
  return `@todos Hay partido el dia ${dia} a las ${hora} ANOTATE!!`;
}

async function enviarWhatsappNuevoPartido(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, textoAnotate(partido));
  marcarEnviadoHoy(partidoId, 'anotate');
}

async function enviarWhatsappVotacionAbierta(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const { dia, hora } = formatearDiaYHora(partido.fecha);
  const texto = `@todos Ya podés votar los equipos posibles para el partido del grupo "${partido.nombreGrupo}", ${dia} ${hora}`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

async function enviarWhatsappVotacionCerrada(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const { dia, hora } = formatearDiaYHora(partido.fecha);
  const texto = `@todos Se cerró la votación de equipos del partido de tu grupo "${partido.nombreGrupo}", ${dia} ${hora}. Mirá en qué equipo quedaste`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

function contarTitulares(partidoId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`
    )
    .get(partidoId).total;
}

async function enviarWhatsappRecordatorioPartido(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const texto = `@todos Sos titular en el partido del grupo ${partido.nombreGrupo}. No seas Pancho/García y llega a horario`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

async function enviarWhatsappRecordatoriosVotacion(partidoId, ventana) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  const texto = `@todos Todavía no votaste - faltan ${ventana}hs. Acordate de votar tu formación, después no hay quejas por los equipos`;
  await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, texto);
}

async function enviarWhatsappPostPartido(partidoId) {
  const partido = obtenerPartidoConGrupo(partidoId);
  if (!partido || !partido.whatsappGrupoJid) return;

  await whatsapp.enviarMensajeGrupo(
    partido.whatsappGrupoJid,
    '@todos Valoren la actuacion de los participantes del partido'
  );
  marcarEnviadoHoy(partidoId, 'post_partido');
}

async function enviarWhatsappRecordatoriosDiariosAnotate() {
  const hoy = fechaLocalYMD(new Date().toISOString());

  const partidos = db
    .prepare(
      `SELECT p.*, g.nombre AS nombreGrupo, g.whatsappGrupoJid
       FROM Partidos p JOIN Grupos g ON g.id = p.grupoId
       WHERE p.estado = 'abierto' AND g.whatsappGrupoJid IS NOT NULL`
    )
    .all();

  for (const partido of partidos) {
    const diaPartido = fechaLocalYMD(partido.fecha);
    if (diaPartido <= hoy) continue;
    if (contarTitulares(partido.id) >= partido.cupoTitulares) continue;
    if (yaEnviadoHoy(partido.id, 'anotate')) continue;

    await whatsapp.enviarMensajeGrupo(partido.whatsappGrupoJid, textoAnotate(partido));
    marcarEnviadoHoy(partido.id, 'anotate');
  }
}

async function enviarWhatsappRecordatoriosDiariosPostPartido() {
  const partidos = db
    .prepare(
      `SELECT p.*, g.whatsappGrupoJid
       FROM Partidos p JOIN Grupos g ON g.id = p.grupoId
       WHERE p.estado = 'jugado' AND p.votacionEquiposCerrada = 0 AND g.whatsappGrupoJid IS NOT NULL`
    )
    .all();

  for (const partido of partidos) {
    if (yaEnviadoHoy(partido.id, 'post_partido')) continue;

    await whatsapp.enviarMensajeGrupo(
      partido.whatsappGrupoJid,
      '@todos Valoren la actuacion de los participantes del partido'
    );
    marcarEnviadoHoy(partido.id, 'post_partido');
  }
}

module.exports = {
  enviarWhatsappNuevoPartido,
  enviarWhatsappVotacionAbierta,
  enviarWhatsappVotacionCerrada,
  enviarWhatsappRecordatorioPartido,
  enviarWhatsappRecordatoriosVotacion,
  enviarWhatsappPostPartido,
  enviarWhatsappRecordatoriosDiariosAnotate,
  enviarWhatsappRecordatoriosDiariosPostPartido,
};
