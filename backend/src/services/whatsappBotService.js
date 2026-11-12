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
      `SELECT i.equipo AS equipo,
              COALESCE(u.nombre, inv.nombre) AS nombre
       FROM Inscripciones i
       JOIN Partidos p ON p.id = i.partidoId
       LEFT JOIN Usuarios u ON u.uid = i.usuarioId
       LEFT JOIN Invitados inv ON inv.id = i.invitadoId AND inv.grupoId = p.grupoId
       WHERE i.partidoId = ?
         AND i.estado = 'anotado'
         AND i.tipo = 'titular'
       ORDER BY i.equipo ASC, i.ordenLinea ASC, nombre ASC`
    )
    .all(partidoId);
}

const MENSAJE_VOTACION_NO_DISPONIBLE = '🗳️ El estado de la votación de formaciones no se puede consultar.';

function hayVotacionFormacionAbierta(partidoId) {
  const partidoRow = db.prepare('SELECT votacionEquiposCerrada FROM Partidos WHERE id = ?').get(partidoId);
  if (!partidoRow || partidoRow.votacionEquiposCerrada) return false;
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM FormacionesPropuestas WHERE partidoId = ?')
    .get(partidoId);
  return total > 0;
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
      `SELECT COALESCE(u.nombre, i.nombre) AS nombre, COUNT(*) AS goles
       FROM Goles g
       LEFT JOIN Usuarios u ON u.uid = g.usuarioId
       LEFT JOIN Invitados i ON i.id = g.invitadoId
       WHERE g.partidoId = ? AND g.enContra = 0
       GROUP BY COALESCE(g.usuarioId, g.invitadoId)
       ORDER BY goles DESC, nombre ASC`
    )
    .all(partidoId);
}

function obtenerAsistidoresPartido(partidoId) {
  return db
    .prepare(
      `SELECT COALESCE(u.nombre, i.nombre) AS nombre, COUNT(*) AS asistencias
       FROM Goles g
       LEFT JOIN Usuarios u ON u.uid = g.asistenciaUsuarioId
       LEFT JOIN Invitados i ON i.id = g.asistenciaInvitadoId
       WHERE g.partidoId = ? AND (g.asistenciaUsuarioId IS NOT NULL OR g.asistenciaInvitadoId IS NOT NULL)
       GROUP BY COALESCE(g.asistenciaUsuarioId, g.asistenciaInvitadoId)
       ORDER BY asistencias DESC, nombre ASC`
    )
    .all(partidoId);
}

function obtenerMvpPartido(partidoId) {
  const votos = db
    .prepare(
      `SELECT COALESCE(u.nombre, i.nombre) AS nombre, COUNT(*) AS votos
       FROM VotosMvp v
       LEFT JOIN Usuarios u ON u.uid = v.jugadorId
       LEFT JOIN Invitados i ON i.id = v.invitadoId
       WHERE v.partidoId = ?
       GROUP BY COALESCE(v.jugadorId, v.invitadoId)
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
      `SELECT COALESCE(u.nombre, i.nombre) AS nombre, COUNT(*) AS goles
       FROM Goles g
       JOIN Partidos p ON p.id = g.partidoId
       LEFT JOIN Usuarios u ON u.uid = g.usuarioId
       LEFT JOIN Invitados i ON i.id = g.invitadoId AND i.grupoId = p.grupoId
       WHERE p.grupoId = ? AND g.enContra = 0
       GROUP BY COALESCE(g.usuarioId, g.invitadoId)
       ORDER BY goles DESC, nombre ASC
       LIMIT ?`
    )
    .all(grupoId, TOP_RANKING);
}

function obtenerAsistidoresGrupo(grupoId) {
  return db
    .prepare(
      `SELECT COALESCE(u.nombre, i.nombre) AS nombre, COUNT(*) AS asistencias
       FROM Goles g
       JOIN Partidos p ON p.id = g.partidoId
       LEFT JOIN Usuarios u ON u.uid = g.asistenciaUsuarioId
       LEFT JOIN Invitados i ON i.id = g.asistenciaInvitadoId AND i.grupoId = p.grupoId
       WHERE p.grupoId = ? AND (g.asistenciaUsuarioId IS NOT NULL OR g.asistenciaInvitadoId IS NOT NULL)
       GROUP BY COALESCE(g.asistenciaUsuarioId, g.asistenciaInvitadoId)
       ORDER BY asistencias DESC, nombre ASC
       LIMIT ?`
    )
    .all(grupoId, TOP_RANKING);
}

function obtenerMvpsGrupo(grupoId) {
  return db
    .prepare(
      `SELECT COALESCE(u.nombre, i.nombre) AS nombre, COUNT(*) AS mvps
       FROM (
         SELECT v.partidoId, COALESCE(v.jugadorId, v.invitadoId) AS jugadorClave, COUNT(*) AS votos,
                MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) AS maxVotos
         FROM VotosMvp v
         JOIN Partidos p ON p.id = v.partidoId
         WHERE p.grupoId = ?
         GROUP BY v.partidoId, COALESCE(v.jugadorId, v.invitadoId)
       ) t
       LEFT JOIN Usuarios u ON u.uid = t.jugadorClave
       LEFT JOIN Invitados i ON i.id = t.jugadorClave AND i.grupoId = (SELECT grupoId FROM Partidos WHERE id = t.partidoId)
       WHERE t.votos = t.maxVotos
       GROUP BY t.jugadorClave
       ORDER BY mvps DESC, nombre ASC
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

function formatearMvpsGrupo(grupoId) {
  const mvps = obtenerMvpsGrupo(grupoId);
  if (mvps.length === 0) return 'Sin MVPs registrados en el grupo.';
  return `🏆 MVPs del grupo:\n${formatearListaConCantidad(mvps, 'mvps', 'MVP', 'MVPs')}`;
}

function obtenerEstadisticasJugador(grupoId, nombreJugador) {
  let jugador = db
    .prepare('SELECT uid, nombre FROM Usuarios WHERE nombre LIKE ?')
    .get(`%${nombreJugador}%`);

  let esInvitado = false;
  let invitadoId = null;

  if (!jugador) {
    const invitado = db
      .prepare('SELECT id, nombre FROM Invitados WHERE grupoId = ? AND nombre LIKE ? AND estado = "aprobado"')
      .get(grupoId, `%${nombreJugador}%`);
    if (invitado) {
      esInvitado = true;
      invitadoId = invitado.id;
      jugador = { uid: null, nombre: invitado.nombre };
    }
  }

  if (!jugador) return null;

  const uid = jugador.uid;

  let goles, asistencias, mvps, partidosJugados;

  if (esInvitado) {
    goles = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM Goles g
         JOIN Partidos p ON p.id = g.partidoId
         WHERE p.grupoId = ? AND g.invitadoId = ? AND g.enContra = 0`
      )
      .get(grupoId, invitadoId).total;

    asistencias = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM Goles g
         JOIN Partidos p ON p.id = g.partidoId
         WHERE p.grupoId = ? AND g.asistenciaInvitadoId = ?`
      )
      .get(grupoId, invitadoId).total;

    mvps = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM (
           SELECT v.partidoId, v.invitadoId, COUNT(*) AS votos,
                  MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) AS maxVotos
           FROM VotosMvp v
           JOIN Partidos p ON p.id = v.partidoId
           WHERE p.grupoId = ?
           GROUP BY v.partidoId, v.invitadoId
         ) t
         WHERE t.invitadoId = ? AND t.votos = t.maxVotos`
      )
      .get(grupoId, invitadoId).total;

    partidosJugados = db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS total
         FROM Inscripciones i
         JOIN Partidos p ON p.id = i.partidoId
         WHERE p.grupoId = ? AND i.invitadoId = ? AND i.estado = 'anotado' AND p.estado = 'jugado'`
      )
      .get(grupoId, invitadoId).total;
  } else {
    goles = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM Goles g
         JOIN Partidos p ON p.id = g.partidoId
         WHERE p.grupoId = ? AND g.usuarioId = ? AND g.enContra = 0`
      )
      .get(grupoId, uid).total;

    asistencias = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM Goles g
         JOIN Partidos p ON p.id = g.partidoId
         WHERE p.grupoId = ? AND g.asistenciaUsuarioId = ?`
      )
      .get(grupoId, uid).total;

    mvps = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM (
           SELECT v.partidoId, v.jugadorId, COUNT(*) AS votos,
                  MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) AS maxVotos
           FROM VotosMvp v
           JOIN Partidos p ON p.id = v.partidoId
           WHERE p.grupoId = ?
           GROUP BY v.partidoId, v.jugadorId
         ) t
         WHERE t.jugadorId = ? AND t.votos = t.maxVotos`
      )
      .get(grupoId, uid).total;

    partidosJugados = db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS total
         FROM Inscripciones i
         JOIN Partidos p ON p.id = i.partidoId
         WHERE p.grupoId = ? AND i.usuarioId = ? AND i.estado = 'anotado' AND p.estado = 'jugado'`
      )
      .get(grupoId, uid).total;
  }

  return { nombre: jugador.nombre, goles, asistencias, mvps, partidosJugados };
}

function formatearEstadisticasJugador(grupoId, nombreJugador) {
  const stats = obtenerEstadisticasJugador(grupoId, nombreJugador);
  if (!stats) return `No encontré a ningún jugador llamado "${nombreJugador}".`;
  return (
    `📊 *Estadísticas de ${stats.nombre}*\n` +
    `⚽ Goles: ${stats.goles}\n` +
    `🎯 Asistencias: ${stats.asistencias}\n` +
    `🏆 MVPs: ${stats.mvps}\n` +
    `🏟️ Partidos jugados: ${stats.partidosJugados}`
  );
}

function obtenerSancionadosGrupo(grupoId) {
  return db
    .prepare(
      `SELECT u.nombre AS nombre
       FROM UsuariosGrupos ug
       JOIN Usuarios u ON u.uid = ug.usuarioId
       WHERE ug.grupoId = ? AND ug.estaSancionado = 1
       ORDER BY u.nombre ASC`
    )
    .all(grupoId);
}

function formatearSancionadosGrupo(grupoId) {
  const sancionados = obtenerSancionadosGrupo(grupoId);
  if (sancionados.length === 0) return '✅ Nadie está sancionado en el grupo.';
  const lista = sancionados.map((j) => `• ${j.nombre}`).join('\n');
  return `🚫 *Jugadores sancionados:*\n${lista}`;
}

function formatearCuposLibres(grupoId) {
  const partido = obtenerProximoPartido(grupoId);
  if (!partido) return 'No hay ningún partido abierto por ahora.';

  const titulares = contarInscriptos(partido.id, 'titular');
  const suplentes = contarInscriptos(partido.id, 'suplente');
  const libresTitulares = partido.cupoTitulares - titulares;
  const libresSuplentes = partido.cupoSuplentes - suplentes;

  const { dia, hora } = formatearDiaYHora(partido.fecha);
  return (
    `📋 *Cupos para el partido del ${dia} a las ${hora}:*\n` +
    `⚪ Titulares: ${libresTitulares} libre${libresTitulares !== 1 ? 's' : ''} (${titulares}/${partido.cupoTitulares})\n` +
    `⚫ Suplentes: ${libresSuplentes} libre${libresSuplentes !== 1 ? 's' : ''} (${suplentes}/${partido.cupoSuplentes})`
  );
}

function obtenerEstadoJugadorProximoPartido(grupoId, nombreJugador) {
  let jugador = db
    .prepare('SELECT uid, nombre FROM Usuarios WHERE nombre LIKE ?')
    .get(`%${nombreJugador}%`);

  let esInvitado = false;
  let invitadoId = null;

  if (!jugador) {
    const invitado = db
      .prepare('SELECT id, nombre FROM Invitados WHERE grupoId = ? AND nombre LIKE ? AND estado = "aprobado"')
      .get(grupoId, `%${nombreJugador}%`);
    if (invitado) {
      esInvitado = true;
      invitadoId = invitado.id;
      jugador = { uid: null, nombre: invitado.nombre };
    }
  }

  if (!jugador) return null;

  const uid = jugador.uid;
  const partido = obtenerProximoPartido(grupoId);
  if (!partido) return { nombre: jugador.nombre, partido: null };

  let inscripcion;
  if (esInvitado) {
    inscripcion = db
      .prepare(
        `SELECT estado, tipo FROM Inscripciones WHERE partidoId = ? AND invitadoId = ?`
      )
      .get(partido.id, invitadoId);
  } else {
    inscripcion = db
      .prepare(
        `SELECT estado, tipo FROM Inscripciones WHERE partidoId = ? AND usuarioId = ?`
      )
      .get(partido.id, uid);
  }

  const sancionado = db
    .prepare('SELECT estaSancionado FROM UsuariosGrupos WHERE grupoId = ? AND usuarioId = ?')
    .get(grupoId, uid);

  return {
    nombre: jugador.nombre,
    partido: { id: partido.id, fecha: partido.fecha, cupoTitulares: partido.cupoTitulares, cupoSuplentes: partido.cupoSuplentes },
    inscripcion,
    estaSancionado: sancionado?.estaSancionado === 1,
  };
}

function formatearEstadoJugador(grupoId, nombreJugador) {
  const estado = obtenerEstadoJugadorProximoPartido(grupoId, nombreJugador);
  if (!estado) return `No encontré a ningún jugador llamado "${nombreJugador}".`;

  if (!estado.partido) {
    return `📭 *${estado.nombre}*: No hay partido abierto por ahora.`;
  }

  const { dia, hora } = formatearDiaYHora(estado.partido.fecha);
  let respuesta = `📋 *Estado de ${estado.nombre} para el ${dia} a las ${hora}:*\n`;

  if (estado.estaSancionado) {
    respuesta += `🚫 *Sancionado* — no puede anotarse.`;
    return respuesta;
  }

  if (!estado.inscripcion) {
    respuesta += `❌ No anotado.`;
    return respuesta;
  }

  const tipo = estado.inscripcion.tipo === 'titular' ? '⚪ Titular' : '⚫ Suplente';
  const estadoInscripcion = estado.inscripcion.estado === 'anotado' ? '✅ Anotado' : '❌ Dado de baja';
  respuesta += `${tipo} — ${estadoInscripcion}.`;

  return respuesta;
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
    const esMvpTotales = texto.includes('mas mvp') || texto.includes('más mvp') || texto.includes('total mvp') || texto.includes('mas mvps') || texto.includes('más mvps') || texto.includes('total mvps');
    if (esMvpTotales) {
      return formatearMvpsGrupo(grupoId);
    }
    return formatearMvpUltimoPartido(grupoId);
  }

  if (texto.includes('sancionado') || (texto.includes('quien') && texto.includes('sancion')) || (texto.includes('quién') && texto.includes('sancion'))) {
    return formatearSancionadosGrupo(grupoId);
  }

  if (texto.includes('cupo') || texto.includes('lugar') || texto.includes('disponible') || texto.includes('libre')) {
    return formatearCuposLibres(grupoId);
  }

  if (texto.includes('mi estado') || texto.includes('como estoy') || texto.includes('cómo estoy') || (texto.includes('estado') && texto.includes('de '))) {
    const match = texto.match(/estado\s+de\s+(.+)/i);
    if (match) {
      const nombreJugador = match[1].trim();
      return formatearEstadoJugador(grupoId, nombreJugador);
    }
    return '¿De qué jugador querés saber el estado? Escribí "estado de [nombre]".';
  }

  if (preguntaPorEstadisticas && (texto.includes(' de ') || texto.includes('de '))) {
    const match = texto.match(/estadisticas?\s+de\s+(.+)/i);
    if (match) {
      const nombreJugador = match[1].trim();
      return formatearEstadisticasJugador(grupoId, nombreJugador);
    }
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
    return MENSAJE_VOTACION_NO_DISPONIBLE;
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
      return '🗳️ La votación de formación está abierta. Los equipos se van a conocer cuando cierre.';
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

  if (texto.toLowerCase().includes('@todos')) {
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
  console.log('[BOT] Listener registrado. Usuario del socket:', socket.user?.id);
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const mentions = (msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []).map(normalizarJid);
    const idsPropios = [socket.user?.id, socket.user?.lid].filter(Boolean).map(normalizarJid);

    console.log('[BOT] Mensaje recibido. Menciones:', mentions, 'IDs propios:', idsPropios);

    if (!idsPropios.length) {
      console.warn('[BOT] Socket.user no cargado. Ignorando mensaje.');
      return;
    }

    if (!mentions.some((jid) => idsPropios.includes(jid))) return;

    const chatId = msg.key.remoteJid;
    const grupo = obtenerGrupoPorJid(chatId);
    if (!grupo) return;

    const cleanText = text.replace(/@\d+/g, '').trim();

    try {
      await socket.sendPresenceUpdate('composing', chatId);

      // Si el texto incluye "@todos", el bot repite el mensaje mencionando a todos
      const respuesta = cleanText.toLowerCase().includes('@todos')
        ? cleanText
        : generarRespuestaLocal(grupo.id, cleanText);

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