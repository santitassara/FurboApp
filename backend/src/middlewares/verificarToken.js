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
    // Un JWT propio (login por password) no prueba la titularidad del email:
    // cualquiera puede escribir cualquier email en el formulario de registro.
    // emailVerificado debe quedar en false para que sincronizarUsuario nunca
    // promueva a admin a partir de esta vía.
    req.usuario = {
      uid: payloadPropio.uid,
      email: payloadPropio.email,
      nombre: payloadPropio.nombre,
      emailVerificado: false,
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
