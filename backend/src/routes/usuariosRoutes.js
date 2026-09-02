const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarSuperAdmin = require('../middlewares/verificarSuperAdmin');
const { subirFoto } = require('../middlewares/subirFoto');
const envolverAsync = require('../utils/envolverAsync');
const usuariosController = require('../controllers/usuariosController');
const estadisticasController = require('../controllers/estadisticasController');

const router = express.Router();

router.get('/', verificarToken, envolverAsync(usuariosController.listarUsuarios));
router.get(
  '/admin',
  verificarToken,
  verificarSuperAdmin,
  envolverAsync(usuariosController.listarUsuariosAdmin)
);
router.patch(
  '/:uid/password',
  verificarToken,
  verificarSuperAdmin,
  envolverAsync(usuariosController.resetearPassword)
);
router.patch('/me/posiciones', verificarToken, envolverAsync(usuariosController.actualizarMisPosiciones));
router.patch('/me/perfil', verificarToken, envolverAsync(usuariosController.actualizarMiPerfil));
router.post('/me/foto', verificarToken, subirFoto, envolverAsync(usuariosController.subirMiFoto));
router.post('/me/suscripcion', verificarToken, envolverAsync(usuariosController.guardarSuscripcionPush));
router.post('/me/fcm-token', verificarToken, envolverAsync(usuariosController.guardarFcmToken));
router.get(
  '/me/notificaciones/pendientes',
  verificarToken,
  envolverAsync(usuariosController.obtenerNotificacionesPendientes)
);
router.get('/:uid/perfil', verificarToken, envolverAsync(usuariosController.obtenerPerfilDeJugador));
router.get('/:uid/estadisticas/:grupoId', verificarToken, envolverAsync(estadisticasController.obtenerEstadisticas));
router.get('/:uid/estadisticas', verificarToken, envolverAsync(estadisticasController.obtenerEstadisticasTotales));

module.exports = router;
