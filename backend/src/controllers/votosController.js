const votosService = require('../services/votosService');

async function guardar(req, res) {
  const votos = await votosService.guardarVotos(req.params.partidoId, req.usuario.uid, req.body);
  res.json(votos);
}

async function obtenerMios(req, res) {
  const votos = await votosService.obtenerVotosDeVotante(req.params.partidoId, req.usuario.uid);
  res.json(votos);
}

module.exports = { guardar, obtenerMios };
