const usuariosService = require('../services/usuariosService');
const { firmarToken } = require('../utils/jwt');

function lanzarError(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  throw error;
}

function validarEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function sync(req, res) {
  const usuario = await usuariosService.sincronizarUsuario(req.usuario);
  res.json(usuario);
}

async function register(req, res) {
  const { nombre, email, password } = req.body;

  if (!nombre || !String(nombre).trim()) lanzarError(400, 'El nombre es obligatorio');
  if (!validarEmail(email)) lanzarError(400, 'El email no es válido');
  if (!password || String(password).length < 6) lanzarError(400, 'La contraseña debe tener al menos 6 caracteres');
  if (String(password).length > 72) lanzarError(400, 'La contraseña no puede tener más de 72 caracteres');

  const usuario = await usuariosService.registrarConPassword({ nombre, email, password });
  const token = firmarToken(usuario);
  res.status(201).json({ token, usuario });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!validarEmail(email)) lanzarError(400, 'El email no es válido');
  if (!password) lanzarError(400, 'La contraseña es obligatoria');

  const usuario = await usuariosService.autenticarConPassword({ email, password });
  const token = firmarToken(usuario);
  res.json({ token, usuario });
}

module.exports = { sync, register, login };
