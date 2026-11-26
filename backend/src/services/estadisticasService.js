const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const { CAMPOS_HABILIDAD } = usuariosService;

function obtenerEstadisticasJugador(usuarioId, grupoId) {
  const pj = db
    .prepare(
      `SELECT COUNT(*) as total FROM Inscripciones i
       JOIN Partidos p ON i.partidoId = p.id
       WHERE i.usuarioId = ? AND p.grupoId = ? AND i.estado = 'anotado'
         AND i.tipo = 'titular' AND i.equipo IS NOT NULL AND p.estado = 'jugado'`
    )
    .get(usuarioId, grupoId)?.total || 0;

  const goles = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE g.usuarioId = ? AND p.grupoId = ? AND g.enContra = 0`
    )
    .get(usuarioId, grupoId)?.total || 0;

  const asistencias = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE g.asistenciaUsuarioId = ? AND p.grupoId = ?`
    )
    .get(usuarioId, grupoId)?.total || 0;

  // Get user's current skills to calculate OVR (overall rating)
  const usuario = db
    .prepare('SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico FROM Usuarios WHERE uid = ?')
    .get(usuarioId);

  const ovr = usuario && CAMPOS_HABILIDAD.every(c => usuario[c] != null)
    ? CAMPOS_HABILIDAD.reduce((sum, c) => sum + usuario[c], 0) / CAMPOS_HABILIDAD.length
    : 0;

  const valoracion = ovr > 0 ? parseFloat(ovr).toFixed(1) : '0.0';

  // Los MVPs salen de dos fuentes: la votación de los compañeros (convocatoria) y la
  // figura que el admin elige al cargar el resultado (plantel).
  const mvps = db
    .prepare(
      `SELECT COUNT(DISTINCT partidoId) as total FROM (
         SELECT t.partidoId
         FROM (
           SELECT v.partidoId, v.jugadorId, COUNT(*) as votos,
                  MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) as maxVotos
           FROM VotosMvp v
           JOIN Partidos p ON v.partidoId = p.id
           WHERE p.grupoId = ?
           GROUP BY v.partidoId, v.jugadorId
         ) t
         WHERE t.jugadorId = ? AND t.votos = t.maxVotos
         UNION
         SELECT r.partidoId
         FROM Resultados r
         JOIN Partidos p ON r.partidoId = p.id
         WHERE p.grupoId = ? AND r.jugadorDestacadoId = ?
       )`
    )
    .get(grupoId, usuarioId, grupoId, usuarioId)?.total || 0;

  return { pj, goles, asistencias, valoracion, mvps };
}

function obtenerEstadisticasTotalesJugador(usuarioId) {
  const goles = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles
       WHERE usuarioId = ? AND enContra = 0`
    )
    .get(usuarioId)?.total || 0;

  const asistencias = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles
       WHERE asistenciaUsuarioId = ?`
    )
    .get(usuarioId)?.total || 0;

  const pj = db
    .prepare(
      `SELECT COUNT(DISTINCT i.partidoId) as total FROM Inscripciones i
       JOIN Partidos p ON i.partidoId = p.id
       WHERE i.usuarioId = ? AND i.estado = 'anotado'
         AND i.tipo = 'titular' AND i.equipo IS NOT NULL AND p.estado = 'jugado'`
    )
    .get(usuarioId)?.total || 0;

  const mvps = db
    .prepare(
      `SELECT COUNT(DISTINCT partidoId) as total FROM (
         SELECT t.partidoId
         FROM (
           SELECT partidoId, jugadorId, COUNT(*) as votos,
                  MAX(COUNT(*)) OVER (PARTITION BY partidoId) as maxVotos
           FROM VotosMvp
           GROUP BY partidoId, jugadorId
         ) t
         WHERE t.jugadorId = ? AND t.votos = t.maxVotos
         UNION
         SELECT r.partidoId
         FROM Resultados r
         WHERE r.jugadorDestacadoId = ?
       )`
    )
    .get(usuarioId, usuarioId)?.total || 0;

  return { goles, asistencias, pj, mvps };
}

async function obtenerLideresDelMes(grupoId) {
  const usuariosService = require('./usuariosService');

  const filasGoleadores = db
    .prepare(
      `SELECT g.usuarioId, COUNT(*) as goles
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.enContra = 0
       GROUP BY g.usuarioId
       ORDER BY goles DESC
       LIMIT 3`
    )
    .all(grupoId);

  const filaAsistidor = db
    .prepare(
      `SELECT g.asistenciaUsuarioId as usuarioId, COUNT(*) as asistencias
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.asistenciaUsuarioId IS NOT NULL
       GROUP BY g.asistenciaUsuarioId
       ORDER BY asistencias DESC
       LIMIT 1`
    )
    .get(grupoId);

  const goleadores = await Promise.all(
    filasGoleadores.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', goles: fila.goles };
    })
  );

  let asistidor = null;
  if (filaAsistidor) {
    const usuario = await usuariosService.obtenerUsuario(filaAsistidor.usuarioId);
    asistidor = {
      usuarioId: filaAsistidor.usuarioId,
      nombre: usuario?.nombre || 'Jugador',
      asistencias: filaAsistidor.asistencias,
    };
  }

  return { goleadores, asistidor };
}

async function obtenerLideresGrupo(grupoId) {
  const usuariosService = require('./usuariosService');
  const { CAMPOS_HABILIDAD } = usuariosService;

  const goleadores = db
    .prepare(
      `SELECT g.usuarioId, COUNT(*) as goles
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.enContra = 0
       GROUP BY g.usuarioId
       ORDER BY goles DESC
       LIMIT 10`
    )
    .all(grupoId);

  const mvps = db
    .prepare(
      `SELECT jugadorId as usuarioId, COUNT(DISTINCT partidoId) as mvps FROM (
         SELECT partidoId, jugadorId FROM (
           SELECT v.partidoId, v.jugadorId, COUNT(*) as votos,
                  MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) as maxVotos
           FROM VotosMvp v
           JOIN Partidos p ON v.partidoId = p.id
           WHERE p.grupoId = ?
           GROUP BY v.partidoId, v.jugadorId
         ) WHERE votos = maxVotos
         UNION
         SELECT r.partidoId, r.jugadorDestacadoId
         FROM Resultados r
         JOIN Partidos p ON r.partidoId = p.id
         WHERE p.grupoId = ? AND r.jugadorDestacadoId IS NOT NULL
       )
       GROUP BY jugadorId
       ORDER BY mvps DESC
       LIMIT 5`
    )
    .all(grupoId, grupoId);

  const asistidores = db
    .prepare(
      `SELECT g.asistenciaUsuarioId as usuarioId, COUNT(*) as asistencias
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.asistenciaUsuarioId IS NOT NULL
       GROUP BY g.asistenciaUsuarioId
       ORDER BY asistencias DESC
       LIMIT 10`
    )
    .all(grupoId);

  const promedioGol = db
    .prepare(
      `SELECT g.usuarioId, COUNT(*) as goles,
              (SELECT COUNT(DISTINCT i.partidoId)
               FROM Inscripciones i
               JOIN Partidos p2 ON i.partidoId = p2.id
               WHERE i.usuarioId = g.usuarioId
                 AND i.estado = 'anotado'
                 AND i.tipo = 'titular'
                 AND i.equipo IS NOT NULL
                 AND p2.grupoId = ?
                 AND p2.estado = 'jugado') as pj
       FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE p.grupoId = ? AND g.enContra = 0
       GROUP BY g.usuarioId
       HAVING pj > 0
       ORDER BY (goles * 1.0 / pj) DESC
       LIMIT 10`
    )
    .all(grupoId, grupoId);

  const mejoresValorados = db
    .prepare(
      `SELECT u.uid as usuarioId,
              ((u.velocidad + u.pegada + u.tocaPase + u.gambeta + u.marcaDefensa + u.fisico) / 6.0) as ovr
       FROM Usuarios u
       JOIN UsuariosGrupos ug ON ug.usuarioId = u.uid
       WHERE ug.grupoId = ? AND u.velocidad IS NOT NULL
       ORDER BY ovr DESC
       LIMIT 5`
    )
    .all(grupoId);

  const enriquecer = async (filas) => {
    return Promise.all(
      filas.map(async (fila) => {
        const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
        return { ...fila, nombre: usuario?.nombre || 'Jugador' };
      })
    );
  };

  return {
    goleadores: await enriquecer(goleadores),
    mvps: await enriquecer(mvps),
    asistidores: await enriquecer(asistidores),
    promedioGol: await enriquecer(promedioGol),
    mejoresValorados: await enriquecer(mejoresValorados),
  };
}

module.exports = { obtenerEstadisticasJugador, obtenerEstadisticasTotalesJugador, obtenerLideresDelMes, obtenerLideresGrupo };
