const { Server } = require('socket.io');
const verificarTokenValor = require('../utils/verificarTokenValor');
const usuariosService = require('../services/usuariosService');
const gruposService = require('../services/gruposService');
const miEquipoService = require('../services/miEquipoService');

function configurarSocket(servidorHttp) {
  const io = new Server(servidorHttp, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.on('unirseGrupo', async (payload) => {
      try {
        const { grupoId, token } = payload || {};
        const usuario = await verificarTokenValor(token);
        if (!usuario) throw new Error('Token inválido');

        const perfil = await usuariosService.obtenerUsuario(usuario.uid);
        if (!perfil?.esSuperAdmin) {
          const membresia = await gruposService.obtenerMembresia(grupoId, usuario.uid);
          if (!membresia) throw new Error('No pertenecés a este grupo');
        }

        socket.join(`grupo:${grupoId}`);
      } catch (error) {
        socket.emit('error', { mensaje: error.message });
      }
    });

    socket.on('unirse', async (payload) => {
      try {
        const { grupoId, partidoId, token } = payload || {};
        const usuario = await verificarTokenValor(token);
        if (!usuario) throw new Error('Token inválido');

        const perfil = await usuariosService.obtenerUsuario(usuario.uid);
        if (!perfil?.esSuperAdmin) {
          const membresia = await gruposService.obtenerMembresia(grupoId, usuario.uid);
          if (!membresia) throw new Error('No pertenecés a este grupo');
        }

        const acceso = await miEquipoService.obtenerAccesoEquipo(partidoId, grupoId, usuario.uid);
        if (!acceso) throw new Error('No tenés acceso al chat de este equipo');

        socket.join(`equipo:${partidoId}:${acceso.equipo}`);
      } catch (error) {
        socket.emit('error', { mensaje: error.message });
        socket.disconnect();
      }
    });
  });

  return io;
}

module.exports = configurarSocket;
