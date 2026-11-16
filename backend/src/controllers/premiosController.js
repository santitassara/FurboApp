const premiosService = require('../services/premiosService');

async function obtenerCatalogo(req, res) {
  const catalogo = await premiosService.obtenerCatalogo();
  res.json(catalogo);
}

async function comprarPremio(req, res) {
  const { premioId, partidoId } = req.body;
  const usuarioId = req.usuario.uid;
  const grupoId = req.grupo.id;

  if (!premioId) {
    return res.status(400).json({ error: 'premioId es requerido' });
  }

  const resultado = await premiosService.comprarPremio(usuarioId, premioId, grupoId, partidoId || null);
  res.json(resultado);
}

async function usarPremio(req, res) {
  const { compraId } = req.params;
  const usuarioId = req.usuario.uid;
  const metadata = req.body || {};

  const resultado = await premiosService.usarPremio(usuarioId, compraId, metadata);
  res.json(resultado);
}

async function obtenerMisPremios(req, res) {
  const usuarioId = req.usuario.uid;
  const grupoId = req.grupo.id;

  const premios = await premiosService.obtenerMisPremios(usuarioId, grupoId);
  res.json(premios);
}

async function obtenerEfectosActivos(req, res) {
  const usuarioId = req.usuario.uid;
  const grupoId = req.grupo.id;

  const efectos = await premiosService.obtenerEfectosActivos(usuarioId, grupoId);
  res.json(efectos);
}

async function obtenerEfectosActivosPartido(req, res) {
  const { partidoId } = req.params;
  const usuarioId = req.usuario.uid;

  const efectos = await premiosService.obtenerEfectosActivosPartido(usuarioId, partidoId);
  res.json(efectos);
}

module.exports = {
  obtenerCatalogo,
  comprarPremio,
  usarPremio,
  obtenerMisPremios,
  obtenerEfectosActivos,
  obtenerEfectosActivosPartido,
};