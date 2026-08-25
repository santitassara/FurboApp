const { admin } = require('../config/firebase');
const { verificarTokenPropio } = require('./jwt');

async function verificarTokenValor(token) {
  const payloadPropio = verificarTokenPropio(token);
  if (payloadPropio) {
    // Un JWT propio (login por password) no prueba la titularidad del email:
    // cualquiera puede escribir cualquier email en el formulario de registro.
    // emailVerificado debe quedar en false para que sincronizarUsuario nunca
    // promueva a admin a partir de esta vía.
    return {
      uid: payloadPropio.uid,
      email: payloadPropio.email,
      nombre: payloadPropio.nombre,
      emailVerificado: false,
    };
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      nombre: decoded.name || decoded.email,
      emailVerificado: decoded.email_verified === true,
    };
  } catch (error) {
    return null;
  }
}

module.exports = verificarTokenValor;
