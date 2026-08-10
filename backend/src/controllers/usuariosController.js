const usuariosService = require('../services/usuariosService');

async function listarSancionados(req, res) {
  const sancionados = await usuariosService.listarSancionados();
  res.json(sancionados);
}

async function perdonar(req, res) {
  await usuariosService.perdonarSancion(req.params.uid);
  res.json({ mensaje: 'Sanción revocada' });
}

module.exports = { listarSancionados, perdonar };
