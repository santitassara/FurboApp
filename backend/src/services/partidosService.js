const crypto = require('node:crypto');
const { db } = require('../config/db');
const notificacionesService = require('./notificacionesService');
const whatsappNotificacionesService = require('./whatsappNotificacionesService');
const climaService = require('./climaService');

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

async function crearPartido({
  fecha,
  cupoTitulares,
  cupoSuplentes,
  creadoPor,
  grupoId,
  estadio,
  tipoSuelo,
  direccion,
  valorCuota,
}) {
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
  if (valorCuota !== undefined && valorCuota !== null && (!Number.isInteger(valorCuota) || valorCuota < 0)) {
    throw crearErrorValidacion('valorCuota debe ser un entero mayor o igual a 0');
  }

  const direccionLimpia = typeof direccion === 'string' ? direccion.trim() : '';
  let lat = null;
  let lon = null;
  if (direccionLimpia) {
    const coordenadas = await climaService.geocodificar(direccionLimpia);
    if (coordenadas) {
      lat = coordenadas.lat;
      lon = coordenadas.lon;
    }
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
    estadio: typeof estadio === 'string' && estadio.trim() ? estadio.trim() : null,
    tipoSuelo: typeof tipoSuelo === 'string' && tipoSuelo.trim() ? tipoSuelo.trim() : null,
    direccion: direccionLimpia || null,
    lat,
    lon,
    valorCuota: valorCuota ?? null,
  };
  db.prepare(
    `INSERT INTO Partidos
       (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes, numero, estadio, tipoSuelo, direccion, lat, lon, valorCuota)
     VALUES
       (@id, @fecha, @estado, @creadoPor, @grupoId, @cupoTitulares, @cupoSuplentes,
         (SELECT COALESCE(MAX(numero), 0) + 1 FROM Partidos WHERE grupoId = @grupoId),
         @estadio, @tipoSuelo, @direccion, @lat, @lon, @valorCuota)`
  ).run(nuevoPartido);

  const filaNumero = db.prepare('SELECT numero FROM Partidos WHERE id = ?').get(nuevoPartido.id);
  nuevoPartido.numero = filaNumero.numero;

  notificacionesService.enviarNotificacionNuevoPartido(nuevoPartido.id).catch((error) => {
    console.error('Error enviando notificación de nuevo partido:', error.message);
  });

  whatsappNotificacionesService.enviarWhatsappNuevoPartido(nuevoPartido.id).catch((error) => {
    console.error('Error enviando WhatsApp de nuevo partido:', error.message);
  });

  return nuevoPartido;
}

async function obtenerPartido(partidoId, grupoId) {
  const partido = db.prepare('SELECT * FROM Partidos WHERE id = ?').get(partidoId);
  if (!partido || partido.grupoId !== grupoId) return null;
  return partido;
}

function listarPartidosVisibles(grupoId) {
  const abiertos = db
    .prepare("SELECT * FROM Partidos WHERE estado = 'abierto' AND grupoId = ? ORDER BY fecha ASC")
    .all(grupoId);
  const ultimoNoAbierto = db
    .prepare("SELECT * FROM Partidos WHERE estado IN ('cerrado','jugado') AND grupoId = ? ORDER BY fecha DESC LIMIT 1")
    .get(grupoId);
  return ultimoNoAbierto ? [...abiertos, ultimoNoAbierto] : abiertos;
}

async function eliminarPartido(partidoId, grupoId, uid) {
  const partido = await obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const resultadosService = require('./resultadosService');
  const inscripcionesService = require('./inscripcionesService');
  const formacionesPropuestasService = require('./formacionesPropuestasService');
  const miEquipoService = require('./miEquipoService');
  const eliminar = db.transaction(() => {
    resultadosService.eliminarPorPartido(partidoId);
    inscripcionesService.eliminarPorPartido(partidoId);
    formacionesPropuestasService.eliminarPorPartido(partidoId);
    miEquipoService.eliminarPorPartido(partidoId);
    db.prepare('DELETE FROM Partidos WHERE id = ?').run(partidoId);
  });
  eliminar();
}

function cerrarPartidosVencidos() {
  const vencidos = db
    .prepare("SELECT DISTINCT grupoId FROM Partidos WHERE estado = 'abierto' AND fecha <= ?")
    .all(new Date().toISOString());
  db.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE estado = 'abierto' AND fecha <= ?").run(
    new Date().toISOString()
  );
  return vencidos.map((fila) => fila.grupoId);
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
