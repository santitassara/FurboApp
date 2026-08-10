const { db } = require('../config/firebase');
const usuariosService = require('./usuariosService');
const partidosService = require('./partidosService');

const COLECCION = 'Inscripciones';

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function consultaAnotadosBase(partidoId) {
  return db.collection(COLECCION).where('partidoId', '==', partidoId).where('estado', '==', 'anotado');
}

async function obtenerInscripcionActiva(partidoId, usuarioId) {
  const snapshot = await consultaAnotadosBase(partidoId).where('usuarioId', '==', usuarioId).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function contarOcupados(partidoId) {
  const snapshot = await consultaAnotadosBase(partidoId).get();
  const inscripciones = snapshot.docs.map((doc) => doc.data());
  return {
    titulares: inscripciones.filter((i) => i.tipo === 'titular').length,
    suplentes: inscripciones.filter((i) => i.tipo === 'suplente').length,
  };
}

async function anotarse(partidoId, usuarioId) {
  const usuario = await usuariosService.obtenerUsuario(usuarioId);
  if (!usuario) throw crearError('Usuario no encontrado', 404);
  if (usuario.estaSancionado) throw crearError('Estás sancionado y no podés anotarte', 403);

  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido no está abierto', 400);

  const inscripcionActiva = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (inscripcionActiva) throw crearError('Ya estás anotado en este partido', 400);

  const ocupados = await contarOcupados(partidoId);
  let tipo;
  if (ocupados.titulares < partido.cupoTitulares) {
    tipo = 'titular';
  } else if (ocupados.suplentes < partido.cupoSuplentes) {
    tipo = 'suplente';
  } else {
    throw crearError('Partido completo', 400);
  }

  const nuevaInscripcion = {
    partidoId,
    usuarioId,
    estado: 'anotado',
    tipo,
    orden: ocupados.titulares + ocupados.suplentes,
    fechaInscripcion: new Date().toISOString(),
  };
  const ref = await db.collection(COLECCION).add(nuevaInscripcion);
  return { id: ref.id, ...nuevaInscripcion };
}

async function bajarse(partidoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('No estás anotado en este partido', 400);

  await db.collection(COLECCION).doc(inscripcion.id).update({ estado: 'dado_de_baja' });

  if (inscripcion.tipo === 'titular') {
    await usuariosService.sancionar(usuarioId);
  }

  return { ...inscripcion, estado: 'dado_de_baja' };
}

async function sancionarManualmente(partidoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'titular') throw crearError('Solo se puede sancionar a jugadores titulares', 400);

  await db.collection(COLECCION).doc(inscripcion.id).update({ estado: 'dado_de_baja' });
  await usuariosService.sancionar(usuarioId);

  return { ...inscripcion, estado: 'dado_de_baja' };
}

async function promover(partidoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'suplente') throw crearError('El jugador ya es titular', 400);

  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares >= partido.cupoTitulares) {
    throw crearError('No hay lugares de titular disponibles', 400);
  }

  await db.collection(COLECCION).doc(inscripcion.id).update({ tipo: 'titular' });
  return { ...inscripcion, tipo: 'titular' };
}

async function listarActivas(partidoId) {
  const snapshot = await consultaAnotadosBase(partidoId).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = { anotarse, bajarse, sancionarManualmente, promover, contarOcupados, obtenerInscripcionActiva, listarActivas };
