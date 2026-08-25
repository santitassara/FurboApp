const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerAccesoEquipo(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido || !partido.votacionEquiposCerrada) return null;

  const inscripcion = db
    .prepare(
      `SELECT equipo FROM Inscripciones
       WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado' AND tipo = 'titular'`
    )
    .get(partidoId, usuarioId);
  if (!inscripcion || !inscripcion.equipo) return null;

  return { equipo: inscripcion.equipo };
}

async function obtenerMiEquipo(partidoId, grupoId, usuarioId) {
  const acceso = await obtenerAccesoEquipo(partidoId, grupoId, usuarioId);
  if (!acceso) throw crearError('No tenés acceso al chat de este equipo', 403);

  const companerosFilas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo = ?`
    )
    .all(partidoId, acceso.equipo);
  const companeros = await Promise.all(
    companerosFilas.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { uid: fila.usuarioId, nombre: usuario?.nombre || 'Jugador' };
    })
  );

  const mensajesFilas = db
    .prepare(
      `SELECT * FROM (
         SELECT id, usuarioId, texto, fechaEnvio FROM MensajesEquipo
         WHERE partidoId = ? AND equipo = ?
         ORDER BY fechaEnvio DESC, id DESC
         LIMIT 50
       ) ORDER BY fechaEnvio ASC, id ASC`
    )
    .all(partidoId, acceso.equipo);
  const mensajes = await Promise.all(
    mensajesFilas.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { ...fila, nombre: usuario?.nombre || 'Jugador' };
    })
  );

  return { equipo: acceso.equipo, companeros, mensajes };
}

async function enviarMensaje(partidoId, grupoId, usuarioId, texto) {
  const acceso = await obtenerAccesoEquipo(partidoId, grupoId, usuarioId);
  if (!acceso) throw crearError('No tenés acceso al chat de este equipo', 403);

  const textoLimpio = typeof texto === 'string' ? texto.trim() : '';
  if (!textoLimpio) throw crearError('El mensaje no puede estar vacío', 400);
  if (textoLimpio.length > 500) throw crearError('El mensaje es demasiado largo (máximo 500 caracteres)', 400);

  const usuario = await usuariosService.obtenerUsuario(usuarioId);
  const mensaje = {
    id: crypto.randomUUID(),
    partidoId,
    equipo: acceso.equipo,
    usuarioId,
    texto: textoLimpio,
    fechaEnvio: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO MensajesEquipo (id, partidoId, equipo, usuarioId, texto, fechaEnvio)
     VALUES (@id, @partidoId, @equipo, @usuarioId, @texto, @fechaEnvio)`
  ).run(mensaje);

  return { ...mensaje, nombre: usuario?.nombre || 'Jugador' };
}

function eliminarPorPartido(partidoId) {
  db.prepare('DELETE FROM MensajesEquipo WHERE partidoId = ?').run(partidoId);
}

module.exports = { obtenerAccesoEquipo, obtenerMiEquipo, enviarMensaje, eliminarPorPartido };
