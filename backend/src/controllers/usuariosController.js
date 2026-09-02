const usuariosService = require('../services/usuariosService');
const gruposService = require('../services/gruposService');
const notificacionesInternasService = require('../services/notificacionesInternasService');

async function listarSancionados(req, res) {
  const sancionados = await gruposService.listarSancionados(req.params.grupoId);
  res.json(sancionados);
}

async function perdonar(req, res) {
  await gruposService.perdonarSancion(req.params.grupoId, req.params.uid);
  res.json({ mensaje: 'Sanción revocada' });
}

async function actualizarMisPosiciones(req, res) {
  const usuario = await usuariosService.actualizarPosiciones(req.usuario.uid, req.body);
  res.json(usuario);
}

async function actualizarMiPerfil(req, res) {
  const usuario = await usuariosService.actualizarPerfil(req.usuario.uid, req.body);
  res.json(usuario);
}

async function subirMiFoto(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Falta el archivo de la foto' });
  }
  const usuario = await usuariosService.guardarFoto(req.usuario.uid, req.file);
  res.json(usuario);
}

async function obtenerPerfilDeJugador(req, res) {
  const perfil = await usuariosService.obtenerPerfilPublico(req.params.uid);
  res.json(perfil);
}

async function listarUsuarios(req, res) {
  const usuarios = await usuariosService.listarUsuarios();
  res.json(usuarios);
}

async function listarUsuariosDeGrupo(req, res) {
  const usuarios = await usuariosService.listarUsuarios(req.params.grupoId);
  res.json(usuarios);
}

async function guardarSuscripcionPush(req, res) {
  const suscripcion = req.body;
  await usuariosService.guardarSuscripcionPush(req.usuario.uid, suscripcion);
  res.json({ mensaje: 'Suscripción guardada' });
}

async function guardarFcmToken(req, res) {
  const { fcmToken } = req.body;
  await usuariosService.guardarFcmToken(req.usuario.uid, fcmToken);
  res.json({ mensaje: 'Token FCM guardado' });
}

async function obtenerNotificacionesPendientes(req, res) {
  const resultado = notificacionesInternasService.obtenerYMarcarPendientes(req.usuario.uid);
  res.json(resultado);
}

async function listarUsuariosAdmin(req, res) {
  const usuarios = await usuariosService.listarUsuariosConEmail();
  res.json(usuarios);
}

async function resetearPassword(req, res) {
  const { password } = req.body;
  await usuariosService.establecerPassword(req.params.uid, password);
  res.json({ mensaje: 'Contraseña actualizada' });
}

module.exports = {
  listarSancionados,
  perdonar,
  actualizarMisPosiciones,
  actualizarMiPerfil,
  subirMiFoto,
  obtenerPerfilDeJugador,
  listarUsuarios,
  listarUsuariosDeGrupo,
  guardarSuscripcionPush,
  guardarFcmToken,
  obtenerNotificacionesPendientes,
  listarUsuariosAdmin,
  resetearPassword,
};
