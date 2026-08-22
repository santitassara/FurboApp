const crypto = require('node:crypto');
const { db } = require('../config/db');

function crearErrorValidacion(mensaje) {
  const error = new Error(mensaje);
  error.status = 400;
  return error;
}

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor, grupoId }) {
  const fechaPartido = new Date(fecha);
  if (Number.isNaN(fechaPartido.getTime()) || fechaPartido <= new Date()) {
    throw crearErrorValidacion('La fecha del partido debe ser válida y futura');
  }
  if (!Number.isInteger(cupoTitulares) || cupoTitulares <= 0) {
    throw crearErrorValidacion('cupoTitulares debe ser un entero mayor a 0');
  }
  if (!Number.isInteger(cupoSuplentes) || cupoSuplentes < 0) {
    throw crearErrorValidacion('cupoSuplentes debe ser un entero mayor o igual a 0');
  }

  const nuevoPartido = {
    id: crypto.randomUUID(),
    fecha: fechaPartido.toISOString(),
    estado: 'abierto',
    creadoPor,
    grupoId,
    cupoTitulares,
    cupoSuplentes,
    recordatorioEnviado: 0,
  };
  db.prepare(
    `INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes)
     VALUES (@id, @fecha, @estado, @creadoPor, @grupoId, @cupoTitulares, @cupoSuplentes)`
  ).run(nuevoPartido);
  return nuevoPartido;
}

async function obtenerPartido(partidoId, grupoId) {
  const partido = db.prepare('SELECT * FROM Partidos WHERE id = ?').get(partidoId);
  if (!partido || partido.grupoId !== grupoId) return null;
  return partido;
}

function listarPartidosVisibles(grupoId) {
  const abiertos = db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto' AND grupoId = ?").all(grupoId);
  const ultimoNoAbierto = db
    .prepare("SELECT * FROM Partidos WHERE estado IN ('cerrado','jugado') AND grupoId = ? ORDER BY fecha DESC LIMIT 1")
    .get(grupoId);
  return ultimoNoAbierto ? [...abiertos, ultimoNoAbierto] : abiertos;
}

async function eliminarPartido(partidoId, grupoId, uid) {
  const partido = await obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') {
    throw crearError('Solo se pueden eliminar partidos que ya fueron jugados', 400);
  }

  const resultadosService = require('./resultadosService');
  const inscripcionesService = require('./inscripcionesService');
  const eliminar = db.transaction(() => {
    resultadosService.eliminarPorPartido(partidoId);
    inscripcionesService.eliminarPorPartido(partidoId);
    db.prepare('DELETE FROM Partidos WHERE id = ?').run(partidoId);
  });
  eliminar();
}

function cerrarPartidosVencidos() {
  db.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE estado = 'abierto' AND fecha <= ?").run(
    new Date().toISOString()
  );
}

function listarPartidosJugados(grupoId) {
  return db.prepare("SELECT * FROM Partidos WHERE estado = 'jugado' AND grupoId = ? ORDER BY fecha DESC").all(grupoId);
}

module.exports = {
  crearPartido,
  obtenerPartido,
  listarPartidosVisibles,
  eliminarPartido,
  cerrarPartidosVencidos,
  listarPartidosJugados,
};
