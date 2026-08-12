const { admin } = require('../config/firebase');
const { verificarTokenPropio } = require('../utils/jwt');

async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const payloadPropio = verificarTokenPropio(token);
  if (payloadPropio) {
    req.usuario = {
      uid: payloadPropio.uid,
      email: payloadPropio.email,
      nombre: payloadPropio.nombre,
      emailVerificado: true,
    };
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.usuario = {
      uid: decoded.uid,
      email: decoded.email,
      nombre: decoded.name || decoded.email,
      emailVerificado: decoded.email_verified === true,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = verificarToken;
