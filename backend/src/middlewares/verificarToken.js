const { admin } = require('../config/firebase');

async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.usuario = {
      uid: decoded.uid,
      email: decoded.email,
      nombre: decoded.name || decoded.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = verificarToken;
