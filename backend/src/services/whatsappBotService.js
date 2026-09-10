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
    return '¡Hola! ⚽ Preguntame *cuándo* jugamos o *cuántos* estamos anotados.';
  }

  return '⚽ No entendí bien. Podés preguntarme *cuándo* jugamos o *cuántos* están anotados.';
}

function registrarListenerBot(socket) {
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const botNumber = `${socket.user.id.split(':')[0]}@s.whatsapp.net`;

    if (!mentions.includes(botNumber)) return;

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
