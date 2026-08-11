const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarAdmin = require('../middlewares/verificarAdmin');
const envolverAsync = require('../utils/envolverAsync');
const partidosController = require('../controllers/partidosController');
const inscripcionesController = require('../controllers/inscripcionesController');

const router = express.Router();

router.get('/', verificarToken, envolverAsync(partidosController.listar));
router.post('/', verificarToken, verificarAdmin, envolverAsync(partidosController.crear));
router.post('/:partidoId/anotarse', verificarToken, envolverAsync(inscripcionesController.anotarse));
router.post('/:partidoId/bajarse', verificarToken, envolverAsync(inscripcionesController.bajarse));
router.get('/:partidoId/inscripciones', verificarToken, envolverAsync(inscripcionesController.listarPorPartido));
router.post(
  '/:partidoId/promover/:usuarioId',
  verificarToken,
  verificarAdmin,
  envolverAsync(inscripcionesController.promover)
);

router.post(
  '/:partidoId/sancionar/:usuarioId',
  verificarToken,
  verificarAdmin,
  envolverAsync(inscripcionesController.sancionarManualmente)
);

module.exports = router;
