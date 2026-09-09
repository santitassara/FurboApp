const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarSuperAdmin = require('../middlewares/verificarSuperAdmin');
const envolverAsync = require('../utils/envolverAsync');
const whatsappController = require('../controllers/whatsappController');

const router = express.Router();

router.get('/grupos-disponibles', verificarToken, verificarSuperAdmin, envolverAsync(whatsappController.listarGruposDisponibles));

module.exports = router;
