const usuariosService = require('../services/usuariosService');

async function verificarAdmin(req, res, next) {
  try {
    const usuario = await usuariosService.obtenerUsuario(req.usuario.uid);
    if (!usuario || usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Requiere rol de administrador' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = verificarAdmin;
