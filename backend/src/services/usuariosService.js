const { db } = require('../config/db');

const filaAUsuario = (fila) => (fila ? { ...fila, estaSancionado: Boolean(fila.estaSancionado) } : null);

function obtenerAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function sincronizarUsuario({ uid, email, nombre, emailVerificado }) {
  const esAdmin = Boolean(emailVerificado) && obtenerAdminEmails().includes((email || '').toLowerCase());
  const existente = db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);

  if (!existente) {
    const nuevoUsuario = {
      uid,
      nombre,
      email,
      rol: esAdmin ? 'admin' : 'jugador',
      estaSancionado: false,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES (@uid, @nombre, @email, @rol, @estaSancionado, @fechaCreacion)`
    ).run({ ...nuevoUsuario, estaSancionado: 0 });
    return nuevoUsuario;
  }

  const usuarioExistente = filaAUsuario(existente);
  if (esAdmin && usuarioExistente.rol !== 'admin') {
    db.prepare('UPDATE Usuarios SET rol = ? WHERE uid = ?').run('admin', uid);
    usuarioExistente.rol = 'admin';
  }
  return usuarioExistente;
}

async function obtenerUsuario(uid) {
  return filaAUsuario(db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid));
}

async function listarSancionados() {
  return db.prepare('SELECT * FROM Usuarios WHERE estaSancionado = 1').all().map(filaAUsuario);
}

async function perdonarSancion(uid) {
  const existente = db.prepare('SELECT uid FROM Usuarios WHERE uid = ?').get(uid);
  if (!existente) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  db.prepare('UPDATE Usuarios SET estaSancionado = 0 WHERE uid = ?').run(uid);
}

async function sancionar(uid) {
  db.prepare('UPDATE Usuarios SET estaSancionado = 1 WHERE uid = ?').run(uid);
}

module.exports = { sincronizarUsuario, obtenerUsuario, listarSancionados, perdonarSancion, sancionar };
