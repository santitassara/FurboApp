const { db } = require('../config/db');

const ZONA = 'America/Argentina/Buenos_Aires';
const TOP_RANKING = 5;

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

function obtenerUltimoPartidoJugado(grupoId) {
  return db
    .prepare("SELECT * FROM Partidos WHERE grupoId = ? AND estado = 'jugado' ORDER BY fecha DESC LIMIT 1")
    .get(grupoId);
}

function obtenerGoleadoresPartido(partidoId) {
  return db
    .prepare(
      `SELECT u.nombre AS nombre, COUNT(*) AS goles
       FROM Goles g
       JOIN Usuarios u ON u.uid = g.usuarioId
       WHERE g.partidoId = ? AND g.enContra = 0
       GROUP BY g.usuarioId
       ORDER BY goles DESC, nombre ASC`
    )
    .all(partidoId);
}

function obtenerAsistidoresPartido(partidoId) {
  return db
    .prepare(
      `SELECT u.nombre AS nombre, COUNT(*) AS asistencias
       FROM Goles g
       JOIN Usuarios u ON u.uid = g.asistenciaUsuarioId
       WHERE g.partidoId = ? AND g.asistenciaUsuarioId IS NOT NULL
       GROUP BY g.asistenciaUsuarioId
       ORDER BY asistencias DESC, nombre ASC`
    )
    .all(partidoId);
}

function obtenerMvpPartido(partidoId) {
  const votos = db
    .prepare(
      `SELECT v.jugadorId AS jugadorId, u.nombre AS nombre, COUNT(*) AS votos
       FROM VotosMvp v
       JOIN Usuarios u ON u.uid = v.jugadorId
       WHERE v.partidoId = ?
       GROUP BY v.jugadorId
       ORDER BY votos DESC`
    )
    .all(partidoId);

  if (votos.length === 0) return [];
  const maxVotos = votos[0].votos;
  return votos.filter((fila) => fila.votos === maxVotos);
}

function obtenerGoleadoresGrupo(grupoId) {
  return db
    .prepare(
      `SELECT u.nombre AS nombre, COUNT(*) AS goles
       FROM Goles g
       JOIN Partidos p ON p.id = g.partidoId
       JOIN Usuarios u ON u.uid = g.usuarioId
       WHERE p.grupoId = ? AND g.enContra = 0
       GROUP BY g.usuarioId
       ORDER BY goles DESC, nombre ASC
       LIMIT ?`
    )
    .all(grupoId, TOP_RANKING);
}

function obtenerAsistidoresGrupo(grupoId) {
  return db
    .prepare(
      `SELECT u.nombre AS nombre, COUNT(*) AS asistencias
       FROM Goles g
       JOIN Partidos p ON p.id = g.partidoId
       JOIN Usuarios u ON u.uid = g.asistenciaUsuarioId
       WHERE p.grupoId = ? AND g.asistenciaUsuarioId IS NOT NULL
       GROUP BY g.asistenciaUsuarioId
       ORDER BY asistencias DESC, nombre ASC
       LIMIT ?`
    )
    .all(grupoId, TOP_RANKING);
}

function obtenerMvpsGrupo(grupoId) {
  return db
    .prepare(
      `SELECT u.nombre AS nombre, COUNT(*) AS mvps
       FROM (
         SELECT v.partidoId AS partidoId, v.jugadorId AS jugadorId, COUNT(*) AS votos,
                MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) AS maxVotos
         FROM VotosMvp v
         JOIN Partidos p ON p.id = v.partidoId
         WHERE p.grupoId = ?
         GROUP BY v.partidoId, v.jugadorId
       ) t
       JOIN Usuarios u ON u.uid = t.jugadorId
       WHERE t.votos = t.maxVotos
       GROUP BY t.jugadorId
       ORDER BY mvps DESC, u.nombre ASC
       LIMIT ?`
    )
    .all(grupoId, TOP_RANKING);
}

function formatearListaConCantidad(filas, campoCantidad, etiquetaSingular, etiquetaPlural) {
  return filas
    .map((fila) => {
      const cantidad = fila[campoCantidad];
      const etiqueta = cantidad === 1 ? etiquetaSingular : etiquetaPlural;
      return `• ${fila.nombre} (${cantidad} ${etiqueta})`;
    })
    .join('\n');
}

function formatearGoleadorUltimoPartido(grupoId) {
  const partido = obtenerUltimoPartidoJugado(grupoId);
  if (!partido) return 'Todavía no se jugó ningún partido en el grupo.';

  const goleadores = obtenerGoleadoresPartido(partido.id);
  if (goleadores.length === 0) return 'En el último partido no hubo goles registrados.';

  const maxGoles = goleadores[0].goles;
  const top = goleadores.filter((fila) => fila.goles === maxGoles);
  return `⚽ Goleador/es del último partido:\n${formatearListaConCantidad(top, 'goles', 'gol', 'goles')}`;
}

function formatearAsistidorUltimoPartido(grupoId) {
  const partido = obtenerUltimoPartidoJugado(grupoId);
  if (!partido) return 'Todavía no se jugó ningún partido en el grupo.';

  const asistidores = obtenerAsistidoresPartido(partido.id);
  if (asistidores.length === 0) return 'En el último partido no hubo asistencias registradas.';

  const maxAsistencias = asistidores[0].asistencias;
  const top = asistidores.filter((fila) => fila.asistencias === maxAsistencias);
  return `🎯 Máximo/s asistidor/es del último partido:\n${formatearListaConCantidad(top, 'asistencias', 'asistencia', 'asistencias')}`;
}

function formatearMvpUltimoPartido(grupoId) {
  const partido = obtenerUltimoPartidoJugado(grupoId);
  if (!partido) return 'Todavía no se jugó ningún partido en el grupo.';

  const mvps = obtenerMvpPartido(partido.id);
  if (mvps.length === 0) return 'En el último partido todavía no se votó el MVP.';

  return `🏆 MVP del último partido:\n${formatearListaConCantidad(mvps, 'votos', 'voto', 'votos')}`;
}

function formatearEstadisticasUltimoPartido(grupoId) {
  const partido = obtenerUltimoPartidoJugado(grupoId);
  if (!partido) return 'Todavía no se jugó ningún partido en el grupo.';

  const goleadores = obtenerGoleadoresPartido(partido.id);
  const asistidores = obtenerAsistidoresPartido(partido.id);
  const mvps = obtenerMvpPartido(partido.id);

  const bloques = [];

  if (goleadores.length > 0) {
    const maxGoles = goleadores[0].goles;
    const top = goleadores.filter((fila) => fila.goles === maxGoles);
    bloques.push(`⚽ *Goleador/es*\n${formatearListaConCantidad(top, 'goles', 'gol', 'goles')}`);
  } else {
    bloques.push('⚽ *Goleador/es*\nSin goles registrados.');
  }

  if (asistidores.length > 0) {
    const maxAsistencias = asistidores[0].asistencias;
    const top = asistidores.filter((fila) => fila.asistencias === maxAsistencias);
    bloques.push(`🎯 *Asistidor/es*\n${formatearListaConCantidad(top, 'asistencias', 'asistencia', 'asistencias')}`);
  } else {
    bloques.push('🎯 *Asistidor/es*\nSin asistencias registradas.');
  }

  if (mvps.length > 0) {
    bloques.push(`🏆 *MVP*\n${formatearListaConCantidad(mvps, 'votos', 'voto', 'votos')}`);
  } else {
    bloques.push('🏆 *MVP*\nTodavía no se votó.');
  }

  return `📊 Estadísticas del último partido:\n\n${bloques.join('\n\n')}`;
}

function formatearGoleadoresGrupo(grupoId) {
  const goleadores = obtenerGoleadoresGrupo(grupoId);
  if (goleadores.length === 0) return 'Todavía no hay goles registrados en el grupo.';
  return `⚽ Goleadores del grupo:\n${formatearListaConCantidad(goleadores, 'goles', 'gol', 'goles')}`;
}

function formatearAsistidoresGrupo(grupoId) {
  const asistidores = obtenerAsistidoresGrupo(grupoId);
  if (asistidores.length === 0) return 'Todavía no hay asistencias registradas en el grupo.';
  return `🎯 Máximos asistidores del grupo:\n${formatearListaConCantidad(asistidores, 'asistencias', 'asistencia', 'asistencias')}`;
}

function formatearEstadisticasGrupo(grupoId) {
  const goleadores = obtenerGoleadoresGrupo(grupoId);
  const asistidores = obtenerAsistidoresGrupo(grupoId);
  const mvps = obtenerMvpsGrupo(grupoId);

  const bloques = [
    `⚽ *Goleadores*\n${
      goleadores.length > 0 ? formatearListaConCantidad(goleadores, 'goles', 'gol', 'goles') : 'Sin goles registrados.'
    }`,
    `🎯 *Asistidores*\n${
      asistidores.length > 0
        ? formatearListaConCantidad(asistidores, 'asistencias', 'asistencia', 'asistencias')
        : 'Sin asistencias registradas.'
    }`,
    `🏆 *MVPs*\n${mvps.length > 0 ? formatearListaConCantidad(mvps, 'mvps', 'MVP', 'MVPs') : 'Sin MVPs registrados.'}`,
  ];

  return `📊 Estadísticas del grupo:\n\n${bloques.join('\n\n')}`;
}

function parsearFechaDelTexto(texto) {
  const match = texto.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  let anio = match[3] ? Number(match[3]) : null;
  if (anio !== null && anio < 100) anio += 2000;

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return { dia, mes, anio };
}

function obtenerPartidoJugadoPorFecha(grupoId, { dia, mes, anio }) {
  const partidos = db
    .prepare("SELECT * FROM Partidos WHERE grupoId = ? AND estado = 'jugado' ORDER BY fecha DESC")
    .all(grupoId);

  return (
    partidos.find((partido) => {
      const fecha = new Date(partido.fecha);
      const diaLocal = Number(fecha.toLocaleDateString('es-AR', { day: '2-digit', timeZone: ZONA }));
      const mesLocal = Number(fecha.toLocaleDateString('es-AR', { month: '2-digit', timeZone: ZONA }));
      const anioLocal = Number(fecha.toLocaleDateString('es-AR', { year: 'numeric', timeZone: ZONA }));

      if (diaLocal !== dia || mesLocal !== mes) return false;
      if (anio !== null && anioLocal !== anio) return false;
      return true;
    }) || null
  );
}

function obtenerMarcadorPartido(partidoId) {
  const filas = db.prepare('SELECT equipo FROM Goles WHERE partidoId = ?').all(partidoId);
  const marcador = { A: 0, B: 0 };
  for (const fila of filas) marcador[fila.equipo] += 1;
  return marcador;
}

function formatearResultadoPartido(partido) {
  const { dia } = formatearDiaYHora(partido.fecha);
  const marcador = obtenerMarcadorPartido(partido.id);
  return `🏟️ Resultado del partido del *${dia}*:\n⚪ Equipo A *${marcador.A}* - *${marcador.B}* Equipo B ⚫`;
}

function formatearResultadoUltimoPartido(grupoId) {
  const partido = obtenerUltimoPartidoJugado(grupoId);
  if (!partido) return 'Todavía no se jugó ningún partido en el grupo.';
  return formatearResultadoPartido(partido);
}

function formatearResultadoPorFecha(grupoId, fecha) {
  const partido = obtenerPartidoJugadoPorFecha(grupoId, fecha);
  if (!partido) return 'No encontré ningún partido jugado en esa fecha.';
  return formatearResultadoPartido(partido);
}

function generarRespuestaLocal(grupoId, textoMensaje) {
  const texto = textoMensaje.toLowerCase();

  const preguntaPorUltimoPartido = texto.includes('ultimo') || texto.includes('último');
  const preguntaPorEstadisticas = texto.includes('estadistica') || texto.includes('estadística');
  const preguntaPorGoleador = texto.includes('goleador');
  const preguntaPorMvp = texto.includes('mvp');
  const preguntaPorAsistidor = texto.includes('asistidor') || texto.includes('asistencia');
  const preguntaPorResultado =
    texto.includes('resultado') || texto.includes('salio') || texto.includes('salió');

  if (preguntaPorResultado) {
    const fecha = parsearFechaDelTexto(texto);
    return fecha ? formatearResultadoPorFecha(grupoId, fecha) : formatearResultadoUltimoPartido(grupoId);
  }

  if (preguntaPorEstadisticas) {
    return preguntaPorUltimoPartido ? formatearEstadisticasUltimoPartido(grupoId) : formatearEstadisticasGrupo(grupoId);
  }

  if (preguntaPorGoleador) {
    return preguntaPorUltimoPartido ? formatearGoleadorUltimoPartido(grupoId) : formatearGoleadoresGrupo(grupoId);
  }

  if (preguntaPorMvp) {
    return formatearMvpUltimoPartido(grupoId);
  }

  if (preguntaPorAsistidor) {
    return preguntaPorUltimoPartido ? formatearAsistidorUltimoPartido(grupoId) : formatearAsistidoresGrupo(grupoId);
  }

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

// NUEVA FUNCIÓN: Intercepta el mensaje para extraer a los participantes si dice @todos
async function enviarMensajeConMenciones(socket, chatId, texto, mensajeCitado = null) {
  let opcionesMensaje = { text: texto };

  if (texto.includes('@todos')) {
    try {
      const groupMetadata = await socket.groupMetadata(chatId);
      const participantes = groupMetadata.participants.map((p) => p.id);
      opcionesMensaje.mentions = participantes;
    } catch (error) {
      console.error('[BOT] Error al obtener participantes del grupo:', error.message);
    }
  }

  const opcionesExtra = mensajeCitado ? { quoted: mensajeCitado } : {};
  return await socket.sendMessage(chatId, opcionesMensaje, opcionesExtra);
}

function registrarListenerBot(socket) {
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const mentions = (msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []).map(normalizarJid);
    const idsPropios = [socket.user?.id, socket.user?.lid].filter(Boolean).map(normalizarJid);

    if (!mentions.some((jid) => idsPropios.includes(jid))) return;

    const chatId = msg.key.remoteJid;
    const grupo = obtenerGrupoPorJid(chatId);
    if (!grupo) return;

    const cleanText = text.replace(/@\d+/g, '').trim();

    try {
      await socket.sendPresenceUpdate('composing', chatId);
      let respuesta = generarRespuestaLocal(grupo.id, cleanText);
      
      // Si el texto incluye "@todos", el bot repite el mensaje mencionando a todos
      if (cleanText.includes('@todos')) {
         respuesta = cleanText; 
      }

      // Reemplazamos socket.sendMessage por nuestra nueva función
      await enviarMensajeConMenciones(socket, chatId, respuesta, msg);
    } catch (error) {
      console.error('[BOT] Error al procesar la respuesta:', error.message);
    }
  });
}

module.exports = { 
  registrarListenerBot, 
  generarRespuestaLocal, 
  enviarMensajeConMenciones // Se exporta por si mandás mensajes desde otro archivo/endpoint
};