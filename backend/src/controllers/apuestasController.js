const apuestasService = require('../services/apuestasService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function listarPartidosApostables(req, res) {
  const partidos = await apuestasService.obtenerPartidosApostables(req.params.grupoId);
  res.json(partidos);
}

async function obtenerSaldo(req, res) {
  const saldo = await apuestasService.obtenerSaldo(req.usuario.uid);
  res.json({ saldo });
}

async function obtenerOpcionesPartido(req, res) {
  const opciones = await apuestasService.obtenerOpcionesPartido(req.params.partidoId, req.params.grupoId);
  res.json(opciones);
}

async function crearApuestas(req, res) {
  const { apuestas } = req.body;
  if (!Array.isArray(apuestas) || apuestas.length === 0) {
    throw crearError('Debe enviar al menos una apuesta', 400);
  }
  const resultado = await apuestasService.crearApuestas(
    req.params.partidoId, req.params.grupoId, req.usuario.uid, apuestas
  );
  res.status(201).json(resultado);
}

async function obtenerMisApuestas(req, res) {
  const apuestas = await apuestasService.obtenerMisApuestas(req.usuario.uid, req.params.grupoId);
  res.json(apuestas);
}

async function resolverPartido(req, res) {
  const resumen = await apuestasService.resolverPartido(req.params.partidoId, req.params.grupoId);
  res.json(resumen);
}

async function reembolsarPartido(req, res) {
  const resultado = await apuestasService.reembolsarPartido(req.params.partidoId, req.params.grupoId);
  res.json(resultado);
}

module.exports = { listarPartidosApostables, obtenerSaldo, obtenerOpcionesPartido, crearApuestas, obtenerMisApuestas, resolverPartido, reembolsarPartido };