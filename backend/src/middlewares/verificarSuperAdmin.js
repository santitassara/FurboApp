const usuariosService = require('../services/usuariosService');

async function verificarSuperAdmin(req, res, next) {
  const usuario = await usuariosService.obtenerUsuario(req.usuario.uid);
  if (!usuario?.esSuperAdmin) {
    return res.status(403).json({ error: 'Requiere ser super admin' });
  }
  next();
}

module.exports = verificarSuperAdmin;
