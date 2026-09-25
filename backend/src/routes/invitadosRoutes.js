const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const invitadosController = require('../controllers/invitadosController');

const router = express.Router({ mergeParams: true });

router.get('/', verificarToken, verificarMiembroGrupo(), envolverAsync(invitadosController.listar));
router.post('/', verificarToken, verificarMiembroGrupo(), envolverAsync(invitadosController.proponer));
router.post(
  '/:invitadoId/aprobar',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(invitadosController.aprobar)
);
router.post(
  '/:invitadoId/rechazar',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(invitadosController.rechazar)
);

module.exports = router;
