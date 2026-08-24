const votosService = require('../services/votosService');
const ratingService = require('../services/ratingService');

async function guardar(req, res) {
  const votos = await votosService.guardarVotos(req.params.partidoId, req.params.grupoId, req.usuario.uid, req.body);
  res.json(votos);
}

async function obtenerMios(req, res) {
  const votos = await votosService.obtenerVotosDeVotante(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(votos);
}

async function cerrarVotacion(req, res) {
  const resumen = await ratingService.cerrarVotacion(req.params.partidoId, req.params.grupoId);
  res.json(resumen);
}

module.exports = { guardar, obtenerMios, cerrarVotacion };
