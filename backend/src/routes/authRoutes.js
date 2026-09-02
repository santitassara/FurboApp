const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const envolverAsync = require('../utils/envolverAsync');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', envolverAsync(authController.register));
router.post('/login', envolverAsync(authController.login));
router.post('/forgot-password', envolverAsync(authController.olvidePassword));
router.post('/reset-password', envolverAsync(authController.restablecerPassword));
router.post('/sync', verificarToken, envolverAsync(authController.sync));

module.exports = router;
