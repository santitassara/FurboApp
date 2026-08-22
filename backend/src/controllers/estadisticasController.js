const { obtenerEstadisticasJugador } = require('../services/estadisticasService');

async function obtenerEstadisticas(req, res) {
  const { uid, grupoId } = req.params;

  const stats = obtenerEstadisticasJugador(uid, grupoId);
  res.json(stats);
}

module.exports = { obtenerEstadisticas };
