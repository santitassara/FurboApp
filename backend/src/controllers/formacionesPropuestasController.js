const formacionesPropuestasService = require('../services/formacionesPropuestasService');

async function crear(req, res) {
  await formacionesPropuestasService.crearPropuesta(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.status(201).json(propuestas);
}

async function listar(req, res) {
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function eliminar(req, res) {
  await formacionesPropuestasService.eliminarPropuestaAdmin(req.params.partidoId, req.params.grupoId, req.params.propuestaId);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function votar(req, res) {
  await formacionesPropuestasService.votar(req.params.partidoId, req.params.grupoId, req.params.propuestaId, req.usuario.uid);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function cerrar(req, res) {
  await formacionesPropuestasService.cerrarManual(req.params.partidoId, req.params.grupoId);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

async function reiniciar(req, res) {
  await formacionesPropuestasService.reiniciarVotacion(req.params.partidoId, req.params.grupoId);
  const propuestas = await formacionesPropuestasService.listarPropuestas(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(propuestas);
}

module.exports = { crear, listar, eliminar, votar, cerrar, reiniciar };
