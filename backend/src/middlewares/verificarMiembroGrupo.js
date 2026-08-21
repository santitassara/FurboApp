const usuariosService = require('../services/usuariosService');
const gruposService = require('../services/gruposService');

function verificarMiembroGrupo(rolRequerido) {
  return async function (req, res, next) {
    try {
      const { grupoId } = req.params;
      const usuario = await usuariosService.obtenerUsuario(req.usuario.uid);

      if (usuario?.esSuperAdmin) {
        req.miembro = { grupoId, usuarioId: req.usuario.uid, rol: 'admin', estaSancionado: false };
        return next();
      }

      const membresia = await gruposService.obtenerMembresia(grupoId, req.usuario.uid);
      if (!membresia) {
        return res.status(403).json({ error: 'No pertenecés a este grupo' });
      }
      if (rolRequerido === 'admin' && membresia.rol !== 'admin') {
        return res.status(403).json({ error: 'Requiere rol de administrador del grupo' });
      }

      req.miembro = membresia;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = verificarMiembroGrupo;
