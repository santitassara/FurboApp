const usuariosService = require('../services/usuariosService');

async function listarSancionados(req, res) {
  const sancionados = await usuariosService.listarSancionados();
  res.json(sancionados);
}

async function perdonar(req, res) {
  await usuariosService.perdonarSancion(req.params.uid);
  res.json({ mensaje: 'Sanción revocada' });
}

async function actualizarMisPosiciones(req, res) {
  const usuario = await usuariosService.actualizarPosiciones(req.usuario.uid, req.body);
  res.json(usuario);
}

module.exports = { listarSancionados, perdonar, actualizarMisPosiciones };
