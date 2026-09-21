const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const programacionesController = require('../controllers/programacionesController');

const router = express.Router({ mergeParams: true });

router.get('/', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(programacionesController.listar));
router.post('/', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(programacionesController.crear));
router.put(
  '/:programacionId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(programacionesController.actualizar)
);
router.delete(
  '/:programacionId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(programacionesController.eliminar)
);

module.exports = router;
