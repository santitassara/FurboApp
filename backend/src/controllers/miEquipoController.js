const miEquipoService = require('../services/miEquipoService');

async function obtener(req, res) {
  const datos = await miEquipoService.obtenerMiEquipo(req.params.partidoId, req.params.grupoId, req.usuario.uid);
  res.json(datos);
}

async function enviarMensaje(req, res) {
  const mensaje = await miEquipoService.enviarMensaje(
    req.params.partidoId,
    req.params.grupoId,
    req.usuario.uid,
    req.body.texto
  );
  const io = req.app.get('io');
  if (io) {
    io.to(`equipo:${req.params.partidoId}:${mensaje.equipo}`).emit('nuevoMensaje', mensaje);
  }
  res.status(201).json(mensaje);
}

module.exports = { obtener, enviarMensaje };
