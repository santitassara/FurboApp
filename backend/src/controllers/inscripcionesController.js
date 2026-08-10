const inscripcionesService = require('../services/inscripcionesService');

async function anotarse(req, res) {
  const inscripcion = await inscripcionesService.anotarse(req.params.partidoId, req.usuario.uid);
  res.status(201).json(inscripcion);
}

async function bajarse(req, res) {
  const inscripcion = await inscripcionesService.bajarse(req.params.partidoId, req.usuario.uid);
  res.json(inscripcion);
}

async function promover(req, res) {
  const inscripcion = await inscripcionesService.promover(req.params.partidoId, req.params.usuarioId);
  res.json(inscripcion);
}

module.exports = { anotarse, bajarse, promover };
