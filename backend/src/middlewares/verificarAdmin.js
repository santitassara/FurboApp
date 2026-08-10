const usuariosService = require('../services/usuariosService');

async function verificarAdmin(req, res, next) {
  const usuario = await usuariosService.obtenerUsuario(req.usuario.uid);
  if (!usuario || usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol de administrador' });
  }
  next();
}

module.exports = verificarAdmin;
