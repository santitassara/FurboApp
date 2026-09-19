const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarSuperAdmin = require('../middlewares/verificarSuperAdmin');
const envolverAsync = require('../utils/envolverAsync');
const backupController = require('../controllers/backupController');

const router = express.Router();

router.post('/telegram', verificarToken, verificarSuperAdmin, envolverAsync(backupController.enviarBackupTelegram));

module.exports = router;
