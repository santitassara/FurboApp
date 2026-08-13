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

async function actualizarMiPerfil(req, res) {
  const usuario = await usuariosService.actualizarPerfil(req.usuario.uid, req.body);
  res.json(usuario);
}

async function obtenerPerfilDeJugador(req, res) {
  const perfil = await usuariosService.obtenerPerfilPublico(req.params.uid);
  res.json(perfil);
}

async function listarUsuarios(req, res) {
  const usuarios = await usuariosService.listarUsuarios();
  res.json(usuarios);
}

module.exports = {
  listarSancionados,
  perdonar,
  actualizarMisPosiciones,
  actualizarMiPerfil,
  obtenerPerfilDeJugador,
  listarUsuarios,
};
