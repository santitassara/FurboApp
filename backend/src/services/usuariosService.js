const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
const { sonPosicionesValidas } = require('../constants/posiciones');
const { esResistenciaValida } = require('../constants/resistencia');
const { esRitmoJuegoValido } = require('../constants/ritmoJuego');
const { TIPOS_PERMITIDOS } = require('../middlewares/subirFoto');

const DIRECTORIO_FOTOS = path.join(__dirname, '../../uploads/perfiles');

// Dummy hash for timing consistency in autenticarConPassword (prevents email enumeration)
const dummyPasswordHash = bcrypt.hashSync('dummy', 10);

const filaAUsuario = (fila) => {
  if (!fila) return null;
  const { passwordHash, ...resto } = fila;
  return { ...resto, esSuperAdmin: Boolean(fila.esSuperAdmin) };
};

function normalizarVacio(valor) {
  return valor === '' || valor === undefined ? null : valor;
}

function esPiernaHabilValida(valor) {
  if (valor === null || valor === '') return true;
  return ['diestro', 'zurdo'].includes(valor);
}

function esHabilidadValida(valor) {
  // Las habilidades son REAL: el motor de rating acumula progreso fraccionario
  // (ej: 70.20625), por lo que no se puede exigir que sean enteras.
  return valor === null || (Number.isFinite(valor) && valor >= 0 && valor <= 100);
}

function esFechaNacimientoValida(valor) {
  if (valor === null) return true;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(valor);
  return !Number.isNaN(fecha.getTime()) && fecha.getTime() <= Date.now();
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const noLlegoElCumpleanios =
    hoy.getUTCMonth() < nacimiento.getUTCMonth() ||
    (hoy.getUTCMonth() === nacimiento.getUTCMonth() && hoy.getUTCDate() < nacimiento.getUTCDate());
  if (noLlegoElCumpleanios) edad -= 1;
  return edad;
}

function obtenerAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function sincronizarUsuario({ uid, email, nombre, emailVerificado }) {
  const esSuperAdmin = Boolean(emailVerificado) && obtenerAdminEmails().includes((email || '').toLowerCase());
  const existente = db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);

  if (!existente) {
    const nuevoUsuario = {
      uid,
      nombre,
      email,
      esSuperAdmin,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (@uid, @nombre, @email, @esSuperAdmin, @fechaCreacion)`
    ).run({ ...nuevoUsuario, esSuperAdmin: esSuperAdmin ? 1 : 0 });
    return { ...nuevoUsuario };
  }

  const usuarioExistente = filaAUsuario(existente);
  if (esSuperAdmin && !usuarioExistente.esSuperAdmin) {
    db.prepare('UPDATE Usuarios SET esSuperAdmin = 1 WHERE uid = ?').run(uid);
    usuarioExistente.esSuperAdmin = true;
  }
  return usuarioExistente;
}

async function obtenerUsuario(uid) {
  return filaAUsuario(db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid));
}


async function actualizarPosiciones(uid, { posicionPrincipal, posicionSecundaria } = {}) {
  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    const error = new Error('Posiciones inválidas');
    error.status = 400;
    throw error;
  }
  db.prepare('UPDATE Usuarios SET posicionPrincipal = ?, posicionSecundaria = ? WHERE uid = ?').run(
    posicionPrincipal,
    posicionSecundaria,
    uid
  );
  return obtenerUsuario(uid);
}

async function actualizarPerfil(uid, datos = {}) {
  const nombreCompleto = normalizarVacio(datos.nombreCompleto);
  const fechaNacimiento = normalizarVacio(datos.fechaNacimiento);
  const { posicionPrincipal, posicionSecundaria } = datos;
  const resistencia = normalizarVacio(datos.resistencia);
  const ritmoJuego = normalizarVacio(datos.ritmoJuego);
  const piernaHabil = normalizarVacio(datos.piernaHabil);
  const habilidades = {
    velocidad: normalizarVacio(datos.velocidad),
    pegada: normalizarVacio(datos.pegada),
    tocaPase: normalizarVacio(datos.tocaPase),
    gambeta: normalizarVacio(datos.gambeta),
    marcaDefensa: normalizarVacio(datos.marcaDefensa),
    fisico: normalizarVacio(datos.fisico),
  };

  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    const error = new Error('Posiciones inválidas');
    error.status = 400;
    throw error;
  }
  if (!esResistenciaValida(resistencia)) {
    const error = new Error('Resistencia inválida');
    error.status = 400;
    throw error;
  }
  if (!esRitmoJuegoValido(ritmoJuego)) {
    const error = new Error('Ritmo de juego inválido');
    error.status = 400;
    throw error;
  }
  for (const [campo, valor] of Object.entries(habilidades)) {
    if (!esHabilidadValida(valor)) {
      const error = new Error(`La habilidad "${campo}" debe ser un número entre 0 y 100`);
      error.status = 400;
      throw error;
    }
  }
  if (!esFechaNacimientoValida(fechaNacimiento)) {
    const error = new Error('Fecha de nacimiento inválida');
    error.status = 400;
    throw error;
  }
  if (!esPiernaHabilValida(piernaHabil)) {
    const error = new Error('Pierna hábil inválida');
    error.status = 400;
    throw error;
  }

  db.prepare(
    `UPDATE Usuarios SET
      nombreCompleto = @nombreCompleto,
      fechaNacimiento = @fechaNacimiento,
      posicionPrincipal = @posicionPrincipal,
      posicionSecundaria = @posicionSecundaria,
      resistencia = @resistencia,
      ritmoJuego = @ritmoJuego,
      piernaHabil = @piernaHabil,
      velocidad = @velocidad,
      pegada = @pegada,
      tocaPase = @tocaPase,
      gambeta = @gambeta,
      marcaDefensa = @marcaDefensa,
      fisico = @fisico
     WHERE uid = @uid`
  ).run({
    uid,
    nombreCompleto,
    fechaNacimiento,
    posicionPrincipal,
    posicionSecundaria,
    resistencia,
    ritmoJuego,
    piernaHabil,
    ...habilidades,
  });
  return obtenerUsuario(uid);
}

async function obtenerPerfilPublico(uid) {
  const fila = db.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);
  if (!fila) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  return {
    uid: fila.uid,
    nombre: fila.nombre,
    nombreCompleto: fila.nombreCompleto,
    edad: calcularEdad(fila.fechaNacimiento),
    posicionPrincipal: fila.posicionPrincipal,
    posicionSecundaria: fila.posicionSecundaria,
    resistencia: fila.resistencia,
    ritmoJuego: fila.ritmoJuego,
    piernaHabil: fila.piernaHabil,
    velocidad: fila.velocidad,
    pegada: fila.pegada,
    tocaPase: fila.tocaPase,
    gambeta: fila.gambeta,
    marcaDefensa: fila.marcaDefensa,
    fisico: fila.fisico,
    fotoUrl: fila.fotoUrl,
  };
}

async function guardarFoto(uid, archivo) {
  const extension = TIPOS_PERMITIDOS[archivo.mimetype];
  if (!extension) {
    const error = new Error('Formato de imagen no soportado. Usá JPG, PNG o WEBP.');
    error.status = 400;
    throw error;
  }

  fs.mkdirSync(DIRECTORIO_FOTOS, { recursive: true });
  for (const ext of new Set(Object.values(TIPOS_PERMITIDOS))) {
    const rutaPrevia = path.join(DIRECTORIO_FOTOS, `${uid}.${ext}`);
    if (fs.existsSync(rutaPrevia)) fs.unlinkSync(rutaPrevia);
  }

  const nombreArchivo = `${uid}.${extension}`;
  fs.writeFileSync(path.join(DIRECTORIO_FOTOS, nombreArchivo), archivo.buffer);

  const fotoUrl = `/uploads/perfiles/${nombreArchivo}?v=${Date.now()}`;
  db.prepare('UPDATE Usuarios SET fotoUrl = ? WHERE uid = ?').run(fotoUrl, uid);
  return obtenerUsuario(uid);
}

const CAMPOS_HABILIDAD = ['velocidad', 'pegada', 'tocaPase', 'gambeta', 'marcaDefensa', 'fisico'];

function calcularPromedioHabilidades(fila) {
  const valores = CAMPOS_HABILIDAD.map((campo) => fila[campo]).filter((valor) => valor != null);
  if (valores.length === 0) return null;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

async function listarUsuarios(grupoId) {
  const filas = grupoId
    ? db
        .prepare(
          `SELECT u.* FROM Usuarios u
           JOIN UsuariosGrupos ug ON ug.usuarioId = u.uid
           WHERE ug.grupoId = ?
           ORDER BY u.nombre COLLATE NOCASE ASC`
        )
        .all(grupoId)
    : db.prepare('SELECT * FROM Usuarios ORDER BY nombre COLLATE NOCASE ASC').all();

  return filas.map((fila) => ({
    uid: fila.uid,
    nombre: fila.nombre,
    edad: calcularEdad(fila.fechaNacimiento),
    promedioHabilidades: calcularPromedioHabilidades(fila),
  }));
}

async function registrarConPassword({ nombre, email, password }) {
  const emailNormalizado = String(email).trim().toLowerCase();

  // Hash password BEFORE transaction (async operation)
  const passwordHash = await bcrypt.hash(password, 10);

  // Wrap SELECT-decide-write in atomic transaction to prevent race condition
  const resultado = db.transaction(() => {
    const existente = db.prepare('SELECT * FROM Usuarios WHERE email = ?').get(emailNormalizado);

    // Registro NUNCA se vincula a una cuenta existente (sea de Google o de un
    // registro previo por password): si el email ya existe en cualquier forma,
    // se rechaza. Esto evita que /auth/register sea usado para secuestrar
    // cuentas ya creadas (incluidas cuentas admin creadas vía Google).
    if (existente) {
      const error = new Error('El email ya está registrado');
      error.status = 409;
      throw error;
    }

    const nuevoUsuario = {
      uid: crypto.randomUUID(),
      nombre: String(nombre).trim(),
      email: emailNormalizado,
      fechaCreacion: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO Usuarios (uid, nombre, email, fechaCreacion, passwordHash)
       VALUES (@uid, @nombre, @email, @fechaCreacion, @passwordHash)`
    ).run({ ...nuevoUsuario, passwordHash });
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

async function guardarSuscripcionPush(uid, suscripcion) {
  db.prepare('UPDATE Usuarios SET suscripcionPush = ? WHERE uid = ?').run(
    JSON.stringify(suscripcion),
    uid
  );
}

async function guardarFcmToken(uid, fcmToken) {
  db.prepare('UPDATE Usuarios SET fcmToken = ? WHERE uid = ?').run(fcmToken, uid);
}

module.exports = {
  sincronizarUsuario,
  obtenerUsuario,
  actualizarPosiciones,
  actualizarPerfil,
  obtenerPerfilPublico,
  guardarFoto,
  listarUsuarios,
  registrarConPassword,
  autenticarConPassword,
  calcularPromedioHabilidades,
  guardarSuscripcionPush,
  guardarFcmToken,
  CAMPOS_HABILIDAD,
};
