const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const envolverAsync = require('../utils/envolverAsync');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/sync', verificarToken, envolverAsync(authController.sync));

module.exports = router;
