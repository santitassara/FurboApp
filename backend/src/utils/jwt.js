const jwt = require('jsonwebtoken');

const ALGORITMO = 'HS256';

function firmarToken(usuario) {
  return jwt.sign(
    { uid: usuario.uid, email: usuario.email, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { algorithm: ALGORITMO, expiresIn: '7d' }
  );
}

function verificarTokenPropio(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITMO] });
  } catch (error) {
    return null;
  }
}

module.exports = { firmarToken, verificarTokenPropio };
