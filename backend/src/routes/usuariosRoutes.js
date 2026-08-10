const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarAdmin = require('../middlewares/verificarAdmin');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');

const router = express.Router();

router.get('/sancionados', verificarToken, verificarAdmin, envolverAsync(usuariosController.listarSancionados));
router.post('/:uid/perdonar', verificarToken, verificarAdmin, envolverAsync(usuariosController.perdonar));

module.exports = router;
