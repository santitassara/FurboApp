const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');

const router = express.Router({ mergeParams: true });

router.get('/', verificarToken, verificarMiembroGrupo(), envolverAsync(usuariosController.listarUsuariosDeGrupo));
router.get('/sancionados', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(usuariosController.listarSancionados));
router.post('/:uid/perdonar', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(usuariosController.perdonar));

module.exports = router;
