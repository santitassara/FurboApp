const { db } = require('../config/db');

function verificarCreadorGrupo() {
  return async function (req, res, next) {
    try {
      const { grupoId } = req.params;
      const grupo = db.prepare('SELECT creadoPor FROM Grupos WHERE id = ?').get(grupoId);

      if (!grupo) {
        return res.status(404).json({ error: 'Grupo no encontrado' });
      }

      if (grupo.creadoPor !== req.usuario.uid) {
        return res.status(403).json({ error: 'Solo el creador del grupo puede realizar esta acción' });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = verificarCreadorGrupo;
