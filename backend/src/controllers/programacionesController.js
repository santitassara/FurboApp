const programacionesService = require('../services/programacionesService');

async function listar(req, res) {
  res.json(programacionesService.listarProgramaciones(req.params.grupoId));
}

async function crear(req, res) {
  const programacion = programacionesService.crearProgramacion(req.body, req.params.grupoId, req.usuario.uid);
  res.status(201).json(programacion);
}

async function actualizar(req, res) {
  const programacion = programacionesService.actualizarProgramacion(
    req.params.programacionId,
    req.params.grupoId,
    req.body
  );
  res.json(programacion);
}

async function eliminar(req, res) {
  programacionesService.eliminarProgramacion(req.params.programacionId, req.params.grupoId);
  res.status(204).send();
}

module.exports = { listar, crear, actualizar, eliminar };
