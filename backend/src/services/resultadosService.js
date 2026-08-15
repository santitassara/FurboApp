const { db } = require('../config/db');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerElegibles(partidoId) {
  const filas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL`
    )
    .all(partidoId);
  return filas.map((fila) => fila.usuarioId);
}

module.exports = { obtenerElegibles };
