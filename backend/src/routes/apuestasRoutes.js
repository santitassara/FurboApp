const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const apuestasController = require('../controllers/apuestasController');

const router = express.Router({ mergeParams: true });

// All routes require membership in grupo
router.get('/partidos-disponibles', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.listarPartidosApostables));
router.get('/saldo', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.obtenerSaldo));
router.get('/casa', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.obtenerSaldoCasa));
router.get('/partido/:partidoId/opciones', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.obtenerOpcionesPartido));
router.post('/partido/:partidoId/apostar', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.crearApuestas));
router.get('/mis-apuestas', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.obtenerMisApuestas));
router.get('/partido/:partidoId/apuestas', verificarToken, verificarMiembroGrupo(), envolverAsync(apuestasController.obtenerApuestasPartido));

// Admin only
router.post('/partido/:partidoId/resolver', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(apuestasController.resolverPartido));
router.post('/partido/:partidoId/reembolsar', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(apuestasController.reembolsarPartido));

module.exports = router;