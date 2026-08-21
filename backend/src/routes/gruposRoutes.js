const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const envolverAsync = require('../utils/envolverAsync');
const gruposController = require('../controllers/gruposController');

const router = express.Router();

router.post('/', verificarToken, envolverAsync(gruposController.crear));
router.post('/unirse', verificarToken, envolverAsync(gruposController.unirse));
router.get('/mios', verificarToken, envolverAsync(gruposController.listarMios));
router.delete('/:grupoId/abandonar', verificarToken, envolverAsync(gruposController.abandonar));

module.exports = router;
