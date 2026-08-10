const { db } = require('../config/firebase');

const COLECCION = 'Partidos';

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
    fecha: fechaPartido.toISOString(),
    estado: 'abierto',
    creadoPor,
    cupoTitulares,
    cupoSuplentes,
  };
  const ref = await db.collection(COLECCION).add(nuevoPartido);
  return { id: ref.id, ...nuevoPartido };
}

async function obtenerPartido(partidoId) {
  const snapshot = await db.collection(COLECCION).doc(partidoId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function listarPartidosAbiertos() {
  const snapshot = await db.collection(COLECCION).where('estado', '==', 'abierto').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = { crearPartido, obtenerPartido, listarPartidosAbiertos };
