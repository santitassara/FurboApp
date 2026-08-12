const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');

// Dummy hash for timing consistency in autenticarConPassword (prevents email enumeration)
const dummyPasswordHash = bcrypt.hashSync('dummy', 10);

const filaAUsuario = (fila) => {
  if (!fila) return null;
  const { passwordHash, ...resto } = fila;
  return { ...resto, estaSancionado: Boolean(fila.estaSancionado) };
};

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

async function registrarConPassword({ nombre, email, password }) {
  const emailNormalizado = String(email).trim().toLowerCase();

  // Hash password BEFORE transaction (async operation)
  const passwordHash = await bcrypt.hash(password, 10);

  // Wrap SELECT-decide-write in atomic transaction to prevent race condition
  const resultado = db.transaction(() => {
    const existente = db.prepare('SELECT * FROM Usuarios WHERE email = ?').get(emailNormalizado);

    if (existente && existente.passwordHash) {
      const error = new Error('El email ya está registrado');
      error.status = 409;
      throw error;
    }

    if (existente) {
      db.prepare('UPDATE Usuarios SET passwordHash = ? WHERE uid = ?').run(passwordHash, existente.uid);
      return { ...existente, passwordHash };
    }

    const nuevoUsuario = {
      uid: crypto.randomUUID(),
      nombre: String(nombre).trim(),
      email: emailNormalizado,
      rol: 'jugador',
      estaSancionado: false,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion, passwordHash)
       VALUES (@uid, @nombre, @email, @rol, @estaSancionado, @fechaCreacion, @passwordHash)`
    ).run({ ...nuevoUsuario, estaSancionado: 0, passwordHash });
    return { ...nuevoUsuario, passwordHash };
  })();

  return filaAUsuario(resultado);
}

async function autenticarConPassword({ email, password }) {
  const emailNormalizado = String(email).trim().toLowerCase();
  const usuario = db.prepare('SELECT * FROM Usuarios WHERE email = ?').get(emailNormalizado);

  // Always compare against SOMETHING to avoid timing side-channel (email enumeration)
  // Use dummy hash if user doesn't exist or has no password
  const hashToCompare = usuario?.passwordHash || dummyPasswordHash;
  const coincide = await bcrypt.compare(password, hashToCompare);

  // But only accept if user exists, has password, and password actually matches
  if (!usuario || !usuario.passwordHash || !coincide) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  return filaAUsuario(usuario);
}

module.exports = {
  sincronizarUsuario,
  obtenerUsuario,
  listarSancionados,
  perdonarSancion,
  sancionar,
  registrarConPassword,
  autenticarConPassword,
};
