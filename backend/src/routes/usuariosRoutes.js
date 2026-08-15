const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarAdmin = require('../middlewares/verificarAdmin');
const { subirFoto } = require('../middlewares/subirFoto');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');

const router = express.Router();

router.get('/', verificarToken, envolverAsync(usuariosController.listarUsuarios));
router.get('/sancionados', verificarToken, verificarAdmin, envolverAsync(usuariosController.listarSancionados));
router.post('/:uid/perdonar', verificarToken, verificarAdmin, envolverAsync(usuariosController.perdonar));
router.patch('/me/posiciones', verificarToken, envolverAsync(usuariosController.actualizarMisPosiciones));
router.patch('/me/perfil', verificarToken, envolverAsync(usuariosController.actualizarMiPerfil));
router.post('/me/foto', verificarToken, subirFoto, envolverAsync(usuariosController.subirMiFoto));
router.get('/:uid/perfil', verificarToken, envolverAsync(usuariosController.obtenerPerfilDeJugador));

module.exports = router;
