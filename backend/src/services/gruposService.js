const crypto = require('node:crypto');
const { db } = require('../config/db');
const { generarCodigoInvitacion } = require('../utils/codigoInvitacion');
const notificacionesService = require('./notificacionesService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function agregarMiembro(grupoId, usuarioId, rol) {
  db.prepare(
    `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
     VALUES (@id, @grupoId, @usuarioId, @rol, 0, @fechaIngreso)`
  ).run({ id: crypto.randomUUID(), grupoId, usuarioId, rol, fechaIngreso: new Date().toISOString() });
}

function obtenerMembresiaSync(grupoId, usuarioId) {
  const fila = db
    .prepare('SELECT * FROM UsuariosGrupos WHERE grupoId = ? AND usuarioId = ?')
    .get(grupoId, usuarioId);
  if (!fila) return null;
  return {
    grupoId: fila.grupoId,
    usuarioId: fila.usuarioId,
    rol: fila.rol,
    estaSancionado: Boolean(fila.estaSancionado),
  };
}

async function crearGrupo({ nombre, creadoPor }) {
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) throw crearError('El nombre del grupo es obligatorio', 400);

  const crear = db.transaction(() => {
    let codigoInvitacion;
    let intentos = 0;
    while (intentos < 5) {
      codigoInvitacion = generarCodigoInvitacion(nombreLimpio);
      const existente = db.prepare('SELECT id FROM Grupos WHERE codigoInvitacion = ?').get(codigoInvitacion);
      if (!existente) break;
      intentos += 1;
    }
    if (intentos === 5) throw crearError('No se pudo generar un código de invitación único', 500);

    const grupo = {
      id: crypto.randomUUID(),
      nombre: nombreLimpio,
      codigoInvitacion,
      creadoPor,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (@id, @nombre, @codigoInvitacion, @creadoPor, @fechaCreacion)`
    ).run(grupo);

    agregarMiembro(grupo.id, creadoPor, 'admin');

    return grupo;
  });

  return crear();
}

async function unirseAGrupo({ codigoInvitacion, usuarioId }) {
  const codigo = String(codigoInvitacion || '').trim().toUpperCase();
  const grupo = db.prepare('SELECT * FROM Grupos WHERE codigoInvitacion = ?').get(codigo);
  if (!grupo) throw crearError('Código de invitación inválido', 404);

  if (obtenerMembresiaSync(grupo.id, usuarioId)) {
    throw crearError('Ya sos miembro de este grupo', 409);
  }

  agregarMiembro(grupo.id, usuarioId, 'jugador');
  return { id: grupo.id, nombre: grupo.nombre };
}

async function listarMisGrupos(usuarioId) {
  const filas = db
    .prepare(
      `SELECT g.id, g.nombre, g.codigoInvitacion, g.creadoPor, ug.rol, ug.estaSancionado
       FROM UsuariosGrupos ug JOIN Grupos g ON g.id = ug.grupoId
       WHERE ug.usuarioId = ? ORDER BY g.nombre COLLATE NOCASE ASC`
    )
    .all(usuarioId);

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    rol: fila.rol,
    estaSancionado: Boolean(fila.estaSancionado),
    creadoPor: fila.creadoPor,
    ...(fila.rol === 'admin' ? { codigoInvitacion: fila.codigoInvitacion } : {}),
  }));
}

async function obtenerMembresia(grupoId, usuarioId) {
  return obtenerMembresiaSync(grupoId, usuarioId);
}

async function sancionar(grupoId, usuarioId) {
  db.prepare('UPDATE UsuariosGrupos SET estaSancionado = 1 WHERE grupoId = ? AND usuarioId = ?').run(
    grupoId,
    usuarioId
  );
}

async function perdonarSancion(grupoId, usuarioId) {
  if (!obtenerMembresiaSync(grupoId, usuarioId)) {
    throw crearError('El usuario no pertenece a este grupo', 404);
  }
  db.prepare('UPDATE UsuariosGrupos SET estaSancionado = 0 WHERE grupoId = ? AND usuarioId = ?').run(
    grupoId,
    usuarioId
  );

  notificacionesService.enviarNotificacionPerdonSancion(usuarioId).catch((error) => {
    console.error('Error enviando notificación de perdón de sanción:', error.message);
  });
}

async function listarSancionados(grupoId) {
  return db
    .prepare(
      `SELECT u.uid, u.nombre FROM UsuariosGrupos ug
       JOIN Usuarios u ON u.uid = ug.usuarioId
       WHERE ug.grupoId = ? AND ug.estaSancionado = 1`
    )
    .all(grupoId);
}

async function abandonarGrupo(grupoId, usuarioId) {
  const miembro = obtenerMembresiaSync(grupoId, usuarioId);
  if (!miembro) throw crearError('El usuario no pertenece a este grupo', 404);

  const abandonar = db.transaction(() => {
    db.prepare('DELETE FROM UsuariosGrupos WHERE grupoId = ? AND usuarioId = ?').run(grupoId, usuarioId);

    const miembrosRestantes = db.prepare('SELECT COUNT(*) as count FROM UsuariosGrupos WHERE grupoId = ?').get(grupoId);

    if (miembrosRestantes.count === 0) {
      db.prepare('DELETE FROM Inscripciones WHERE partidoId IN (SELECT id FROM Partidos WHERE grupoId = ?)').run(grupoId);
      db.prepare('DELETE FROM Partidos WHERE grupoId = ?').run(grupoId);
      db.prepare('DELETE FROM Grupos WHERE id = ?').run(grupoId);
    }
  });

  abandonar();
}

async function listarMiembros(grupoId) {
  return db
    .prepare(
      `SELECT u.uid, u.nombre, ug.rol FROM UsuariosGrupos ug
       JOIN Usuarios u ON u.uid = ug.usuarioId
       WHERE ug.grupoId = ?
       ORDER BY u.nombre COLLATE NOCASE ASC`
    )
    .all(grupoId);
}

async function promoverAAdmin(grupoId, usuarioId) {
  const miembro = obtenerMembresiaSync(grupoId, usuarioId);
  if (!miembro) throw crearError('El usuario no pertenece a este grupo', 404);

  db.prepare('UPDATE UsuariosGrupos SET rol = ? WHERE grupoId = ? AND usuarioId = ?').run(
    'admin',
    grupoId,
    usuarioId
  );
}

async function desporomoverDeAdmin(grupoId, usuarioId) {
  const miembro = obtenerMembresiaSync(grupoId, usuarioId);
  if (!miembro) throw crearError('El usuario no pertenece a este grupo', 404);

  db.prepare('UPDATE UsuariosGrupos SET rol = ? WHERE grupoId = ? AND usuarioId = ?').run(
    'jugador',
    grupoId,
    usuarioId
  );
}

module.exports = {
  crearGrupo,
  unirseAGrupo,
  listarMisGrupos,
  obtenerMembresia,
  sancionar,
  perdonarSancion,
  listarSancionados,
  abandonarGrupo,
  listarMiembros,
  promoverAAdmin,
  desporomoverDeAdmin,
};
