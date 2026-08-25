const verificarTokenValor = require('../utils/verificarTokenValor');

async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const usuario = await verificarTokenValor(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  req.usuario = usuario;
  next();
}

module.exports = verificarToken;
