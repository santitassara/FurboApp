const crypto = require('node:crypto');
const { db } = require('../config/db');
const {
  calcularProximoDisparo,
  calcularUltimoDisparo,
  calcularFechaPartido,
} = require('../utils/programacionFechas');

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

function normalizarTexto(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function normalizarEntero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : NaN;
}

function normalizarHora(valor) {
  if (typeof valor !== 'string') return null;
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!coincidencia) return null;
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

// Toma los campos crudos del request y devuelve la programación completa ya
// validada, mezclando sobre `base` (la fila existente, en el caso de edición).
function normalizarYValidar(datos, base = {}) {
  const tomar = (clave) => (datos[clave] !== undefined ? datos[clave] : base[clave]);

  const diaSemanaDisparo = normalizarEntero(tomar('diaSemanaDisparo'));
  const diaSemanaPartido = normalizarEntero(tomar('diaSemanaPartido'));
  for (const [nombreCampo, valor] of [
    ['diaSemanaDisparo', diaSemanaDisparo],
    ['diaSemanaPartido', diaSemanaPartido],
  ]) {
    if (!Number.isInteger(valor) || valor < 0 || valor > 6) {
      throw crearErrorValidacion(`${nombreCampo} debe ser un entero entre 0 (domingo) y 6 (sábado)`);
    }
  }

  const horaDisparo = normalizarHora(tomar('horaDisparo'));
  if (!horaDisparo) throw crearErrorValidacion('horaDisparo debe tener formato HH:MM');
  const horaPartido = normalizarHora(tomar('horaPartido'));
  if (!horaPartido) throw crearErrorValidacion('horaPartido debe tener formato HH:MM');

  const cupoTitulares = normalizarEntero(tomar('cupoTitulares'));
  if (!Number.isInteger(cupoTitulares) || cupoTitulares <= 0) {
    throw crearErrorValidacion('cupoTitulares debe ser un entero mayor a 0');
  }
  const cupoSuplentes = normalizarEntero(tomar('cupoSuplentes'));
  if (!Number.isInteger(cupoSuplentes) || cupoSuplentes < 0) {
    throw crearErrorValidacion('cupoSuplentes debe ser un entero mayor o igual a 0');
  }

  const valorCuota = normalizarEntero(tomar('valorCuota'));
  if (valorCuota !== null && (!Number.isInteger(valorCuota) || valorCuota < 0)) {
    throw crearErrorValidacion('valorCuota debe ser un entero mayor o igual a 0');
  }

  const activaCruda = tomar('activa');
  const activa = activaCruda === undefined || activaCruda === null ? 1 : Number(Boolean(Number(activaCruda)));

  return {
    nombre: normalizarTexto(tomar('nombre')),
    activa,
    diaSemanaDisparo,
    horaDisparo,
    diaSemanaPartido,
    horaPartido,
    cupoTitulares,
    cupoSuplentes,
    estadio: normalizarTexto(tomar('estadio')),
    tipoSuelo: normalizarTexto(tomar('tipoSuelo')),
    direccion: normalizarTexto(tomar('direccion')),
    valorCuota,
  };
}

function listarProgramaciones(grupoId) {
  return db
    .prepare('SELECT * FROM ProgramacionesPartido WHERE grupoId = ? ORDER BY proximoDisparo ASC')
    .all(grupoId);
}

function obtenerProgramacion(programacionId, grupoId) {
  const fila = db.prepare('SELECT * FROM ProgramacionesPartido WHERE id = ?').get(programacionId);
  if (!fila || fila.grupoId !== grupoId) return null;
  return fila;
}

function crearProgramacion(datos, grupoId, creadoPor) {
  const validada = normalizarYValidar(datos);
  const nueva = {
    ...validada,
    id: crypto.randomUUID(),
    grupoId,
    proximoDisparo: calcularProximoDisparo(validada, new Date()).toISOString(),
    ultimoDisparo: null,
    ultimoPartidoId: null,
    creadoPor,
    fechaCreacion: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO ProgramacionesPartido
       (id, grupoId, nombre, activa, diaSemanaDisparo, horaDisparo, diaSemanaPartido, horaPartido,
        cupoTitulares, cupoSuplentes, estadio, tipoSuelo, direccion, valorCuota,
        proximoDisparo, ultimoDisparo, ultimoPartidoId, creadoPor, fechaCreacion)
     VALUES
       (@id, @grupoId, @nombre, @activa, @diaSemanaDisparo, @horaDisparo, @diaSemanaPartido, @horaPartido,
        @cupoTitulares, @cupoSuplentes, @estadio, @tipoSuelo, @direccion, @valorCuota,
        @proximoDisparo, @ultimoDisparo, @ultimoPartidoId, @creadoPor, @fechaCreacion)`
  ).run(nueva);

  return nueva;
}

function actualizarProgramacion(programacionId, grupoId, cambios) {
  const existente = obtenerProgramacion(programacionId, grupoId);
  if (!existente) throw crearError('Programación no encontrada', 404);

  const validada = normalizarYValidar(cambios, existente);

  const cambioElDisparo =
    validada.diaSemanaDisparo !== existente.diaSemanaDisparo || validada.horaDisparo !== existente.horaDisparo;
  // Al reactivar una programación pausada, el proximoDisparo guardado puede
  // estar vencido hace semanas: se recalcula para que no dispare de inmediato.
  const seReactivo = validada.activa === 1 && existente.activa === 0;

  const proximoDisparo =
    cambioElDisparo || seReactivo
      ? calcularProximoDisparo(validada, new Date()).toISOString()
      : existente.proximoDisparo;

  db.prepare(
    `UPDATE ProgramacionesPartido SET
       nombre = @nombre, activa = @activa,
       diaSemanaDisparo = @diaSemanaDisparo, horaDisparo = @horaDisparo,
       diaSemanaPartido = @diaSemanaPartido, horaPartido = @horaPartido,
       cupoTitulares = @cupoTitulares, cupoSuplentes = @cupoSuplentes,
       estadio = @estadio, tipoSuelo = @tipoSuelo, direccion = @direccion,
       valorCuota = @valorCuota, proximoDisparo = @proximoDisparo
     WHERE id = @id`
  ).run({ ...validada, proximoDisparo, id: programacionId });

  return obtenerProgramacion(programacionId, grupoId);
}

function eliminarProgramacion(programacionId, grupoId) {
  const existente = obtenerProgramacion(programacionId, grupoId);
  if (!existente) throw crearError('Programación no encontrada', 404);
  db.prepare('DELETE FROM ProgramacionesPartido WHERE id = ?').run(programacionId);
}

function existePartidoEnFecha(grupoId, fechaIso) {
  const fila = db.prepare('SELECT id FROM Partidos WHERE grupoId = ? AND fecha = ?').get(grupoId, fechaIso);
  return Boolean(fila);
}

async function ejecutarProgramacion(programacion, ahora) {
  const partidosService = require('./partidosService');

  // Se parte del disparo vencido más reciente, no del guardado en la fila: si
  // el backend estuvo caído tres semanas, igual corresponde crear el partido
  // de esta semana y no intentar uno cuya fecha ya pasó.
  const momentoDisparo = calcularUltimoDisparo(programacion, ahora);
  const fechaPartido = calcularFechaPartido(programacion, momentoDisparo);
  const fechaPartidoIso = fechaPartido.toISOString();

  let partidoCreadoId = programacion.ultimoPartidoId;
  let huboDisparo = false;

  if (fechaPartido <= ahora) {
    console.warn(
      `Programación ${programacion.id}: la fecha calculada ${fechaPartidoIso} ya pasó, se saltea la ocurrencia`
    );
  } else if (existePartidoEnFecha(programacion.grupoId, fechaPartidoIso)) {
    console.warn(
      `Programación ${programacion.id}: ya existe un partido del grupo para ${fechaPartidoIso}, no se duplica`
    );
  } else {
    const partido = await partidosService.crearPartido({
      fecha: fechaPartidoIso,
      cupoTitulares: programacion.cupoTitulares,
      cupoSuplentes: programacion.cupoSuplentes,
      estadio: programacion.estadio,
      tipoSuelo: programacion.tipoSuelo,
      direccion: programacion.direccion,
      valorCuota: programacion.valorCuota,
      creadoPor: programacion.creadoPor,
      grupoId: programacion.grupoId,
    });
    partidoCreadoId = partido.id;
    huboDisparo = true;
    console.log(`Programación ${programacion.id}: partido ${partido.id} creado para ${fechaPartidoIso}`);
  }

  db.prepare(
    `UPDATE ProgramacionesPartido
       SET proximoDisparo = @proximoDisparo, ultimoDisparo = @ultimoDisparo, ultimoPartidoId = @ultimoPartidoId
     WHERE id = @id`
  ).run({
    id: programacion.id,
    proximoDisparo: calcularProximoDisparo(programacion, ahora).toISOString(),
    ultimoDisparo: huboDisparo ? ahora.toISOString() : programacion.ultimoDisparo,
    ultimoPartidoId: partidoCreadoId,
  });
}

async function ejecutarProgramacionesVencidas() {
  const ahora = new Date();
  const vencidas = db
    .prepare(
      'SELECT * FROM ProgramacionesPartido WHERE activa = 1 AND proximoDisparo <= ? ORDER BY proximoDisparo ASC'
    )
    .all(ahora.toISOString());

  for (const programacion of vencidas) {
    try {
      await ejecutarProgramacion(programacion, ahora);
    } catch (error) {
      // Una programación con datos malos no puede frenar a las demás.
      console.error(`Error ejecutando programación ${programacion.id}:`, error.message);
    }
  }
}

module.exports = {
  listarProgramaciones,
  obtenerProgramacion,
  crearProgramacion,
  actualizarProgramacion,
  eliminarProgramacion,
  ejecutarProgramacionesVencidas,
};
