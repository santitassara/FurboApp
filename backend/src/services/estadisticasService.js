const { db } = require('../config/db');

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

  const resultado = db
    .prepare(
      `SELECT AVG(
         CASE
           WHEN p.votacionCerrada = 1 AND NOT EXISTS (
             SELECT 1 FROM RendimientosJugador v
             WHERE v.partidoId = r.partidoId AND v.votanteId = r.jugadorId
           ) THEN r.puntaje / 2.0
           ELSE r.puntaje
         END
       ) as promedio
       FROM RendimientosJugador r
       JOIN Partidos p ON r.partidoId = p.id
       WHERE r.jugadorId = ? AND p.grupoId = ?`
    )
    .get(usuarioId, grupoId);

  const valoracion = resultado?.promedio ? parseFloat(resultado.promedio).toFixed(1) : '0.0';

  const mvps = db
    .prepare(
      `SELECT COUNT(*) as total FROM (
         SELECT v.partidoId, v.jugadorId, COUNT(*) as votos,
                MAX(COUNT(*)) OVER (PARTITION BY v.partidoId) as maxVotos
         FROM VotosMvp v
         JOIN Partidos p ON v.partidoId = p.id
         WHERE p.grupoId = ?
         GROUP BY v.partidoId, v.jugadorId
       ) t
       WHERE t.jugadorId = ? AND t.votos = t.maxVotos`
    )
    .get(grupoId, usuarioId)?.total || 0;

  return { pj, goles, asistencias, valoracion, mvps };
}

function obtenerEstadisticasTotalesJugador(usuarioId) {
  const goles = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles
       WHERE usuarioId = ? AND enContra = 0`
    )
    .get(usuarioId)?.total || 0;

  const mvps = db
    .prepare(
      `SELECT COUNT(*) as total FROM (
         SELECT partidoId, jugadorId, COUNT(*) as votos,
                MAX(COUNT(*)) OVER (PARTITION BY partidoId) as maxVotos
         FROM VotosMvp
         GROUP BY partidoId, jugadorId
       ) t
       WHERE t.jugadorId = ? AND t.votos = t.maxVotos`
    )
    .get(usuarioId)?.total || 0;

  return { goles, mvps };
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

module.exports = { obtenerEstadisticasJugador, obtenerEstadisticasTotalesJugador, obtenerLideresDelMes };
