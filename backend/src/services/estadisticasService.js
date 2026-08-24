const { db } = require('../config/db');

function obtenerEstadisticasJugador(usuarioId, grupoId) {
  const pj = db
    .prepare(
      `SELECT COUNT(*) as total FROM Inscripciones i
       JOIN Partidos p ON i.partidoId = p.id
       WHERE i.usuarioId = ? AND p.grupoId = ? AND i.estado = 'anotado'`
    )
    .get(usuarioId, grupoId)?.total || 0;

  const goles = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles g
       JOIN Partidos p ON g.partidoId = p.id
       WHERE g.usuarioId = ? AND p.grupoId = ?`
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
      `SELECT AVG(puntaje) as promedio FROM RendimientosJugador r
       JOIN Partidos p ON r.partidoId = p.id
       WHERE r.jugadorId = ? AND p.grupoId = ?`
    )
    .get(usuarioId, grupoId);

  const valoracion = resultado?.promedio ? parseFloat(resultado.promedio).toFixed(1) : '0.0';

  return { pj, goles, asistencias, valoracion };
}

function obtenerEstadisticasTotalesJugador(usuarioId) {
  const goles = db
    .prepare(
      `SELECT COUNT(*) as total FROM Goles
       WHERE usuarioId = ?`
    )
    .get(usuarioId)?.total || 0;

  return { goles };
}

module.exports = { obtenerEstadisticasJugador, obtenerEstadisticasTotalesJugador };
