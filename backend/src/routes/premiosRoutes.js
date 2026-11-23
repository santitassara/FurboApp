const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const premiosController = require('../controllers/premiosController');

const router = express.Router({ mergeParams: true });

// All routes require membership in grupo
router.get('/catalogo', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.obtenerCatalogo));
router.post('/comprar', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.comprarPremio));
router.post('/usar/:compraId', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.usarPremio));
router.get('/mis-premios', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.obtenerMisPremios));
router.get('/efectos-activos', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.obtenerEfectosActivos));
router.get('/efectos-activos/:uid', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.obtenerEfectosActivosUsuario));
router.get('/efectos-partido/:partidoId', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.obtenerEfectosActivosPartido));
router.post('/efectos/:efectoId/metadata', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.actualizarEfectoMetadata));
router.post('/efectos/armar-equipo-completo/expirar/:partidoId', verificarToken, verificarMiembroGrupo(), envolverAsync(premiosController.expirarEfectoArmarEquipoCompleto));

module.exports = router;