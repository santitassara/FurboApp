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

function hayVotacionFormacionAbierta(partidoId) {
  const partidoRow = db.prepare('SELECT votacionEquiposCerrada FROM Partidos WHERE id = ?').get(partidoId);
  if (!partidoRow || partidoRow.votacionEquiposCerrada) return false;
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM FormacionesPropuestas WHERE partidoId = ?')
    .get(partidoId);
  return total > 0;
}

function obtenerPropuestasConVotos(partidoId) {
  return db
    .prepare(
      `SELECT p.id, p.numero, COUNT(v.id) AS votos
       FROM FormacionesPropuestas p
       LEFT JOIN VotosFormacion v ON v.propuestaId = p.id
       WHERE p.partidoId = ?
       GROUP BY p.id
       ORDER BY votos DESC, p.numero ASC`
    )
    .all(partidoId);
}

function seleccionarPropuestasMasVotadas(propuestas) {
  if (propuestas.length === 0) return [];

  const valoresDeVotos = [...new Set(propuestas.map((propuesta) => propuesta.votos))].sort((a, b) => b - a);
  let seleccionadas = propuestas.filter((propuesta) => propuesta.votos === valoresDeVotos[0]);

  if (seleccionadas.length < 2 && valoresDeVotos.length > 1) {
    seleccionadas = seleccionadas.concat(
      propuestas.filter((propuesta) => propuesta.votos === valoresDeVotos[1])
    );
  }

  return seleccionadas;
}

function obtenerDetallePropuesta(propuestaId) {
  return db
    .prepare(
      `SELECT d.equipo AS equipo, u.nombre AS nombre
       FROM FormacionesPropuestasDetalle d
       JOIN Usuarios u ON u.uid = d.usuarioId
       WHERE d.propuestaId = ?
       ORDER BY d.equipo ASC, d.ordenLinea ASC, u.nombre ASC`
    )
    .all(propuestaId);
}

function formatearPropuestaVotacion(propuesta) {
  const detalle = obtenerDetallePropuesta(propuesta.id);
  const equipoA = detalle.filter((jugador) => jugador.equipo === 'A').map((jugador) => `• ${jugador.nombre}`);
  const equipoB = detalle.filter((jugador) => jugador.equipo === 'B').map((jugador) => `• ${jugador.nombre}`);

  const bloques = [];
  if (equipoA.length > 0) bloques.push(`⚪ *Equipo A* (${equipoA.length})\n${equipoA.join('\n')}`);
  if (equipoB.length > 0) bloques.push(`⚫ *Equipo B* (${equipoB.length})\n${equipoB.join('\n')}`);

  const etiquetaVotos = propuesta.votos === 1 ? 'voto' : 'votos';
  return `*Propuesta ${propuesta.numero}* (${propuesta.votos} ${etiquetaVotos})\n${bloques.join('\n\n')}`;
}

function formatearVotacionFormacion(partidoId) {
  const propuestas = obtenerPropuestasConVotos(partidoId);
  if (propuestas.length === 0) {
    return 'Todavía no hay propuestas de formación para votar.';
  }

  const masVotadas = seleccionarPropuestasMasVotadas(propuestas);
  const encabezado = '🗳️ La votación de formación está abierta. Estas son las más votadas hasta ahora:';
  return `${encabezado}\n\n${masVotadas.map(formatearPropuestaVotacion).join('\n\n')}`;
}

function formatearEstadoVotacion(partidoId) {
  const propuestas = obtenerPropuestasConVotos(partidoId);
  if (propuestas.length === 0) {
    return 'Todavía no hay ninguna votación de formación en curso.';
  }

  const partidoRow = db
    .prepare('SELECT votacionEquiposCerrada, propuestaGanadoraId FROM Partidos WHERE id = ?')
    .get(partidoId);

  if (partidoRow?.votacionEquiposCerrada) {
    const ganadora = propuestas.find((propuesta) => propuesta.id === partidoRow.propuestaGanadoraId);
    if (ganadora) {
      return `✅ La votación ya cerró. Formación elegida:\n\n${formatearPropuestaVotacion(ganadora)}`;
    }
  }

  return formatearVotacionFormacion(partidoId);
}

function formatearEquipos(partidoId) {
  const titulares = obtenerTitularesPorEquipo(partidoId);

  const equipoA = titulares.filter((jugador) => jugador.equipo === 'A').map((jugador) => `• ${jugador.nombre}`);
  const equipoB = titulares.filter((jugador) => jugador.equipo === 'B').map((jugador) => `• ${jugador.nombre}`);

  const bloques = [];
  if (equipoA.length > 0) bloques.push(`⚪ *Equipo A* (${equipoA.length})\n${equipoA.join('\n')}`);
  if (equipoB.length > 0) bloques.push(`⚫ *Equipo B* (${equipoB.length})\n${equipoB.join('\n')}`);

  if (bloques.length === 0) {
    return `Todavía no están armados los equipos para el próximo partido. El listado de titulares es: ${titulares.map((j) => j.nombre).join(', ')}`;
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
    texto.includes('votacion') ||
    texto.includes('votación') ||
    texto.includes('voto') ||
    texto.includes('votos')
  ) {
    return formatearEstadoVotacion(partido.id);
  }

  if (
    texto.includes('equipos') ||
    texto.includes('equipo') ||
    texto.includes('formacion') ||
    texto.includes('formación') ||
    texto.includes('alineacion') ||
    texto.includes('alineación')
  ) {
    if (hayVotacionFormacionAbierta(partido.id)) {
      return formatearVotacionFormacion(partido.id);
    }
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
