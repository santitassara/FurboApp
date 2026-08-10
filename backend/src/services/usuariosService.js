const { db } = require('../config/firebase');

const COLECCION = 'Usuarios';

function obtenerAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function sincronizarUsuario({ uid, email, nombre, emailVerificado }) {
  const ref = db.collection(COLECCION).doc(uid);
  const snapshot = await ref.get();
  const esAdmin = Boolean(emailVerificado) && obtenerAdminEmails().includes((email || '').toLowerCase());

  if (!snapshot.exists) {
    const nuevoUsuario = {
      uid,
      nombre,
      email,
      rol: esAdmin ? 'admin' : 'jugador',
      estaSancionado: false,
      fechaCreacion: new Date().toISOString(),
    };
    await ref.set(nuevoUsuario);
    return nuevoUsuario;
  }

  const usuarioExistente = snapshot.data();
  if (esAdmin && usuarioExistente.rol !== 'admin') {
    await ref.set({ rol: 'admin' }, { merge: true });
    usuarioExistente.rol = 'admin';
  }
  return usuarioExistente;
}

async function obtenerUsuario(uid) {
  const snapshot = await db.collection(COLECCION).doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function listarSancionados() {
  const snapshot = await db.collection(COLECCION).where('estaSancionado', '==', true).get();
  return snapshot.docs.map((doc) => doc.data());
}

async function perdonarSancion(uid) {
  const ref = db.collection(COLECCION).doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  await ref.set({ estaSancionado: false }, { merge: true });
}

async function sancionar(uid) {
  await db.collection(COLECCION).doc(uid).set({ estaSancionado: true }, { merge: true });
}

module.exports = { sincronizarUsuario, obtenerUsuario, listarSancionados, perdonarSancion, sancionar };
