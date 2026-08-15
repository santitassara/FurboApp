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

async function crearPartido({ fecha, cupoTitulares, cupoSuplentes, creadoPor }) {
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
    cupoTitulares,
    cupoSuplentes,
  };
  db.prepare(
    `INSERT INTO Partidos (id, fecha, estado, creadoPor, cupoTitulares, cupoSuplentes)
     VALUES (@id, @fecha, @estado, @creadoPor, @cupoTitulares, @cupoSuplentes)`
  ).run(nuevoPartido);
  return nuevoPartido;
}

async function obtenerPartido(partidoId) {
  return db.prepare('SELECT * FROM Partidos WHERE id = ?').get(partidoId) || null;
}

function listarPartidosVisibles() {
  const abiertos = db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto'").all();
  const ultimoNoAbierto = db
    .prepare("SELECT * FROM Partidos WHERE estado IN ('cerrado','jugado') ORDER BY fecha DESC LIMIT 1")
    .get();
  return ultimoNoAbierto ? [...abiertos, ultimoNoAbierto] : abiertos;
}

async function eliminarPartido(partidoId, uid) {
  const partido = await obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.creadoPor !== uid) {
    throw crearError('Solo el admin que creó el partido puede eliminarlo', 403);
  }

  const inscripcionesService = require('./inscripcionesService');
  const eliminar = db.transaction(() => {
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

module.exports = { crearPartido, obtenerPartido, listarPartidosVisibles, eliminarPartido, cerrarPartidosVencidos };
