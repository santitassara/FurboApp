const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarCreadorGrupo = require('../middlewares/verificarCreadorGrupo');
const emitirActualizacionGrupo = require('../middlewares/emitirActualizacionGrupo');
const envolverAsync = require('../utils/envolverAsync');
const gruposController = require('../controllers/gruposController');

const router = express.Router();

router.post('/', verificarToken, envolverAsync(gruposController.crear));
router.post('/unirse', verificarToken, envolverAsync(gruposController.unirse));
router.get('/mios', verificarToken, envolverAsync(gruposController.listarMios));
router.use('/:grupoId', emitirActualizacionGrupo);
router.delete('/:grupoId/abandonar', verificarToken, envolverAsync(gruposController.abandonar));
router.get('/:grupoId/miembros', verificarToken, envolverAsync(gruposController.listarMiembros));
router.post('/:grupoId/usuarios/:uid/promover', verificarToken, verificarCreadorGrupo(), envolverAsync(gruposController.promoverAAdmin));
router.post('/:grupoId/usuarios/:uid/desporomover', verificarToken, verificarCreadorGrupo(), envolverAsync(gruposController.desporomoverDeAdmin));

module.exports = router;
