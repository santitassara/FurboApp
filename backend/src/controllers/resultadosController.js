const resultadosService = require('../services/resultadosService');

async function obtener(req, res) {
  const resultado = await resultadosService.obtenerResultado(req.params.partidoId, req.params.grupoId);
  res.json(resultado);
}

async function guardar(req, res) {
  const resultado = await resultadosService.guardarResultado(req.params.partidoId, req.params.grupoId, req.body);
  res.json(resultado);
}

module.exports = { obtener, guardar };
