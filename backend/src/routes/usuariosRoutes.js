const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const { subirFoto } = require('../middlewares/subirFoto');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');
const estadisticasController = require('../controllers/estadisticasController');

const router = express.Router();

router.get('/', verificarToken, envolverAsync(usuariosController.listarUsuarios));
router.patch('/me/posiciones', verificarToken, envolverAsync(usuariosController.actualizarMisPosiciones));
router.patch('/me/perfil', verificarToken, envolverAsync(usuariosController.actualizarMiPerfil));
router.post('/me/foto', verificarToken, subirFoto, envolverAsync(usuariosController.subirMiFoto));
router.post('/me/suscripcion', verificarToken, envolverAsync(usuariosController.guardarSuscripcionPush));
router.get('/:uid/perfil', verificarToken, envolverAsync(usuariosController.obtenerPerfilDeJugador));
router.get('/:uid/estadisticas/:grupoId', verificarToken, envolverAsync(estadisticasController.obtenerEstadisticas));

module.exports = router;
