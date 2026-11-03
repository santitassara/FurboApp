const resultadosService = require('../services/resultadosService');

async function obtener(req, res) {
  const esAdmin = req.miembro && req.miembro.rol === 'admin';
  const resultado = await resultadosService.obtenerResultado(req.params.partidoId, req.params.grupoId, esAdmin);
  res.json(resultado);
}

async function guardar(req, res) {
  const resultado = await resultadosService.guardarResultado(req.params.partidoId, req.params.grupoId, req.body);
  res.json(resultado);
}

module.exports = { obtener, guardar };
