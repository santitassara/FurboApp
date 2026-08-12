const crypto = require('node:crypto');
const { db } = require('../config/db');

function crearErrorValidacion(mensaje) {
  const error = new Error(mensaje);
  error.status = 400;
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

async function listarPartidosAbiertos() {
  return db.prepare("SELECT * FROM Partidos WHERE estado = 'abierto'").all();
}

module.exports = { crearPartido, obtenerPartido, listarPartidosAbiertos };
