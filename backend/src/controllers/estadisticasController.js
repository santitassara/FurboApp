const { obtenerEstadisticasJugador, obtenerEstadisticasTotalesJugador } = require('../services/estadisticasService');

async function obtenerEstadisticas(req, res) {
  try {
    const { uid, grupoId } = req.params;
    const stats = obtenerEstadisticasJugador(uid, grupoId);
    res.json(stats);
  } catch (error) {
    console.error('Error en obtenerEstadisticas:', error);
    res.status(500).json({ error: 'Error de servidor' });
  }
}

async function obtenerEstadisticasTotales(req, res) {
  try {
    const { uid } = req.params;
    const stats = obtenerEstadisticasTotalesJugador(uid);
    res.json(stats);
  } catch (error) {
    console.error('Error en obtenerEstadisticasTotales:', error);
    res.status(500).json({ error: 'Error de servidor' });
  }
}

module.exports = { obtenerEstadisticas, obtenerEstadisticasTotales };
