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

async function olvidePassword(req, res) {
  const { email } = req.body;

  if (!validarEmail(email)) lanzarError(400, 'El email no es válido');

  await usuariosService.solicitarResetPassword(email);
  // Mensaje genérico siempre, exista o no el email, para no filtrar cuentas registradas.
  res.json({ mensaje: 'Si el email está registrado, vas a recibir un link para restablecer tu contraseña.' });
}

async function restablecerPassword(req, res) {
  const { token, password } = req.body;

  if (!token) lanzarError(400, 'El token es obligatorio');
  if (!password || String(password).length < 6) lanzarError(400, 'La contraseña debe tener al menos 6 caracteres');
  if (String(password).length > 72) lanzarError(400, 'La contraseña no puede tener más de 72 caracteres');

  await usuariosService.restablecerPasswordConToken(token, password);
  res.json({ mensaje: 'Contraseña actualizada' });
}

module.exports = { sync, register, login, olvidePassword, restablecerPassword };
