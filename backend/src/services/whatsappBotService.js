const { db } = require('../config/db');

const ZONA = 'America/Argentina/Buenos_Aires';

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

function obtenerGrupoPorJid(jid) {
  return db.prepare('SELECT * FROM Grupos WHERE whatsappGrupoJid = ?').get(jid);
}

function obtenerProximoPartido(grupoId) {
  return db
    .prepare("SELECT * FROM Partidos WHERE grupoId = ? AND estado = 'abierto' ORDER BY fecha ASC LIMIT 1")
    .get(grupoId);
}

function contarInscriptos(partidoId, tipo) {
  return db
    .prepare("SELECT COUNT(*) AS total FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = ?")
    .get(partidoId, tipo).total;
}

function obtenerTitularesPorEquipo(partidoId) {
  return db
    .prepare(
      `SELECT i.equipo AS equipo, u.nombre AS nombre
       FROM Inscripciones i
       JOIN Usuarios u ON u.uid = i.usuarioId
       WHERE i.partidoId = ?
         AND i.estado = 'anotado'
         AND i.tipo = 'titular'
       ORDER BY i.equipo ASC, i.ordenLinea ASC, u.nombre ASC`
    )
    .all(partidoId);
}

function formatearEquipos(partidoId) {
  const titulares = obtenerTitularesPorEquipo(partidoId);

  const equipoA = titulares.filter((jugador) => jugador.equipo === 'A').map((jugador) => `• ${jugador.nombre}`);
  const equipoB = titulares.filter((jugador) => jugador.equipo === 'B').map((jugador) => `• ${jugador.nombre}`);

  const bloques = [];
  if (equipoA.length > 0) bloques.push(`⚪ *Equipo A* (${equipoA.length})\n${equipoA.join('\n')}`);
  if (equipoB.length > 0) bloques.push(`⚫ *Equipo B* (${equipoB.length})\n${equipoB.join('\n')}`);

  if (bloques.length === 0) {
    return 'Todavía no están armados los equipos para el próximo partido.';
  }

  return bloques.join('\n\n');
}

function generarRespuestaLocal(grupoId, textoMensaje) {
  const texto = textoMensaje.toLowerCase();
  const partido = obtenerProximoPartido(grupoId);

  if (!partido) {
    return 'No hay ningún partido abierto por ahora.';
  }

  if (texto.includes('cuándo') || texto.includes('cuando') || texto.includes('hora') || texto.includes('dia')) {
    const { dia, hora } = formatearDiaYHora(partido.fecha);
    return `📅 El próximo partido es el *${dia}* a las *${hora}*.`;
  }

  if (
    texto.includes('equipos') ||
    texto.includes('equipo') ||
    texto.includes('formacion') ||
    texto.includes('formación') ||
    texto.includes('alineacion') ||
    texto.includes('alineación')
  ) {
    return formatearEquipos(partido.id);
  }

  if (
    texto.includes('quienes') ||
    texto.includes('quiénes') ||
    texto.includes('anotados') ||
    texto.includes('lista') ||
    texto.includes('cuantos') ||
    texto.includes('cuántos')
  ) {
    const titulares = contarInscriptos(partido.id, 'titular');
    const suplentes = contarInscriptos(partido.id, 'suplente');
    return `📋 Hay *${titulares}/${partido.cupoTitulares}* titulares y *${suplentes}/${partido.cupoSuplentes}* suplentes anotados.`;
  }

  if (texto.includes('hola') || texto.includes('buenas')) {
    return '¡Hola! ⚽ Preguntame *cuándo* jugamos, *cuántos* estamos anotados o cómo quedaron los *equipos*.';
  }

  return '⚽ No entendí bien. Podés preguntarme *cuándo* jugamos, *cuántos* están anotados o cómo quedaron los *equipos*.';
}

function normalizarJid(jid) {
  if (!jid) return jid;
  const [usuario, dominio] = jid.split('@');
  return `${usuario.split(':')[0]}@${dominio}`;
}

function registrarListenerBot(socket) {
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const mentions = (msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []).map(normalizarJid);
    // El bot puede ser mencionado como @s.whatsapp.net o, en grupos con addressingMode 'lid', como @lid.
    const idsPropios = [socket.user?.id, socket.user?.lid].filter(Boolean).map(normalizarJid);

    if (!mentions.some((jid) => idsPropios.includes(jid))) return;

    const chatId = msg.key.remoteJid;
    const grupo = obtenerGrupoPorJid(chatId);
    if (!grupo) return;

    const cleanText = text.replace(/@\d+/g, '').trim();

    try {
      await socket.sendPresenceUpdate('composing', chatId);
      const respuesta = generarRespuestaLocal(grupo.id, cleanText);
      await socket.sendMessage(chatId, { text: respuesta }, { quoted: msg });
    } catch (error) {
      console.error('[BOT] Error al procesar la respuesta:', error.message);
    }
  });
}

module.exports = { registrarListenerBot, generarRespuestaLocal };
