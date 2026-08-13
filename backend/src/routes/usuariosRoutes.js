const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarAdmin = require('../middlewares/verificarAdmin');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');

const router = express.Router();

router.get('/sancionados', verificarToken, verificarAdmin, envolverAsync(usuariosController.listarSancionados));
router.post('/:uid/perdonar', verificarToken, verificarAdmin, envolverAsync(usuariosController.perdonar));
router.patch('/me/posiciones', verificarToken, envolverAsync(usuariosController.actualizarMisPosiciones));
router.patch('/me/perfil', verificarToken, envolverAsync(usuariosController.actualizarMiPerfil));
router.get('/:uid/perfil', verificarToken, envolverAsync(usuariosController.obtenerPerfilDeJugador));

module.exports = router;
