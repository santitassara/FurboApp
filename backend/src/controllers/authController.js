const usuariosService = require('../services/usuariosService');

async function sync(req, res) {
  const usuario = await usuariosService.sincronizarUsuario(req.usuario);
  res.json(usuario);
}

module.exports = { sync };
