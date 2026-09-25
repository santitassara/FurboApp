const crypto = require('node:crypto');
const { db } = require('../config/db');
const { POSICIONES } = require('../constants/posiciones');
const { esResistenciaValida } = require('../constants/resistencia');
const { K_INVITADO } = require('../constants/invitados');
const { PESOS_POSICION } = require('../constants/pesosPosicion');
const { CAMPOS_HABILIDAD } = require('./usuariosService');
const notificacionesService = require('./notificacionesService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// Reparte el promedio cargado entre las 6 habilidades según el peso de cada
// atributo en la posición del invitado. Los pesos siempre suman 1 entre 6 campos,
// así que 1/6 es el "peso neutro": por encima reparte de más, por debajo de menos.
function calcularHabilidades(habilidadPromedio, posicionPrincipal, posicionSecundaria) {
  const pesosPrincipal = PESOS_POSICION[posicionPrincipal];
  const pesosSecundaria = posicionSecundaria ? PESOS_POSICION[posicionSecundaria] : null;

  const resultado = {};
  for (const campo of CAMPOS_HABILIDAD) {
    const peso = pesosSecundaria
      ? (pesosPrincipal[campo] + pesosSecundaria[campo]) / 2
      : pesosPrincipal[campo];
    const valor = habilidadPromedio + K_INVITADO * (peso - 1 / 6) * 100;
    resultado[campo] = Math.round(Math.min(100, Math.max(0, valor)));
  }
  return resultado;
}

async function proponer(grupoId, propuestoPor, datos = {}) {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw crearError('El nombre es obligatorio', 400);

  let edad = null;
  if (datos.edad !== null && datos.edad !== undefined && datos.edad !== '') {
    edad = Number(datos.edad);
    if (!Number.isInteger(edad) || edad < 5 || edad > 70) {
      throw crearError('La edad debe ser un entero entre 5 y 70', 400);
    }
  }

  const { posicionPrincipal } = datos;
  const posicionSecundaria = datos.posicionSecundaria || null;
  if (!POSICIONES.includes(posicionPrincipal)) {
    throw crearError('Posición principal inválida', 400);
  }
  if (posicionSecundaria && (!POSICIONES.includes(posicionSecundaria) || posicionSecundaria === posicionPrincipal)) {
    throw crearError('Posición secundaria inválida', 400);
  }

  const resistencia = datos.resistencia || null;
  if (!esResistenciaValida(resistencia)) {
    throw crearError('Resistencia inválida', 400);
  }

  const habilidadPromedio = Number(datos.habilidadPromedio);
  if (!Number.isFinite(habilidadPromedio) || habilidadPromedio < 0 || habilidadPromedio > 100) {
    throw crearError('habilidadPromedio debe ser un número entre 0 y 100', 400);
  }

  const stats = calcularHabilidades(habilidadPromedio, posicionPrincipal, posicionSecundaria);

  const invitado = {
    id: crypto.randomUUID(),
    grupoId,
    propuestoPor,
    nombre,
    edad,
    posicionPrincipal,
    posicionSecundaria,
    resistencia,
    habilidadPromedio,
    ...stats,
    estado: 'pendiente',
    fechaCreacion: new Date().toISOString(),
    fechaResolucion: null,
    resueltoPor: null,
  };

  db.prepare(
    `INSERT INTO Invitados
      (id, grupoId, propuestoPor, nombre, edad, posicionPrincipal, posicionSecundaria, resistencia,
       habilidadPromedio, velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico,
       estado, fechaCreacion, fechaResolucion, resueltoPor)
     VALUES
      (@id, @grupoId, @propuestoPor, @nombre, @edad, @posicionPrincipal, @posicionSecundaria, @resistencia,
       @habilidadPromedio, @velocidad, @pegada, @tocaPase, @gambeta, @marcaDefensa, @fisico,
       @estado, @fechaCreacion, @fechaResolucion, @resueltoPor)`
  ).run(invitado);

  return invitado;
}

async function listar(grupoId, solicitanteUid, esAdmin) {
  if (esAdmin) {
    return db.prepare('SELECT * FROM Invitados WHERE grupoId = ? ORDER BY fechaCreacion DESC').all(grupoId);
  }
  return db
    .prepare(
      `SELECT * FROM Invitados WHERE grupoId = ? AND (estado = 'aprobado' OR propuestoPor = ?)
       ORDER BY fechaCreacion DESC`
    )
    .all(grupoId, solicitanteUid);
}

function obtenerInvitado(grupoId, invitadoId) {
  return db.prepare('SELECT * FROM Invitados WHERE id = ? AND grupoId = ?').get(invitadoId, grupoId) || null;
}

async function aprobar(grupoId, invitadoId, adminUid) {
  const invitado = obtenerInvitado(grupoId, invitadoId);
  if (!invitado) throw crearError('Invitado no encontrado', 404);
  if (invitado.estado !== 'pendiente') throw crearError('El invitado ya fue resuelto', 409);

  db.prepare('UPDATE Invitados SET estado = ?, fechaResolucion = ?, resueltoPor = ? WHERE id = ?').run(
    'aprobado',
    new Date().toISOString(),
    adminUid,
    invitadoId
  );

  notificacionesService.enviarNotificacionResolucionInvitado(invitado.propuestoPor, invitado.nombre, true).catch((error) => {
    console.error('Error enviando notificación de invitado aprobado:', error.message);
  });

  return obtenerInvitado(grupoId, invitadoId);
}

async function rechazar(grupoId, invitadoId, adminUid) {
  const invitado = obtenerInvitado(grupoId, invitadoId);
  if (!invitado) throw crearError('Invitado no encontrado', 404);
  if (invitado.estado !== 'pendiente') throw crearError('El invitado ya fue resuelto', 409);

  db.prepare('UPDATE Invitados SET estado = ?, fechaResolucion = ?, resueltoPor = ? WHERE id = ?').run(
    'rechazado',
    new Date().toISOString(),
    adminUid,
    invitadoId
  );

  notificacionesService.enviarNotificacionResolucionInvitado(invitado.propuestoPor, invitado.nombre, false).catch((error) => {
    console.error('Error enviando notificación de invitado rechazado:', error.message);
  });

  return obtenerInvitado(grupoId, invitadoId);
}

module.exports = {
  calcularHabilidades,
  proponer,
  listar,
  obtenerInvitado,
  aprobar,
  rechazar,
};
