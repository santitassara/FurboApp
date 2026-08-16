const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function resolverRutaDb() {
  const configurada = process.env.SQLITE_DB_PATH;
  if (!configurada) return path.join(__dirname, '../../data/furboapp.db');
  if (configurada === ':memory:') return configurada;
  return path.resolve(__dirname, '../..', configurada);
}

const DB_PATH = resolverRutaDb();

console.log(`SQLite DB: ${DB_PATH}`);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const columnasUsuarios = db.prepare('PRAGMA table_info(Usuarios)').all();
const tienePasswordHash = columnasUsuarios.some((columna) => columna.name === 'passwordHash');
if (!tienePasswordHash) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordHash TEXT');
}
const tienePosicionPrincipalUsuario = columnasUsuarios.some((columna) => columna.name === 'posicionPrincipal');
if (!tienePosicionPrincipalUsuario) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN posicionPrincipal TEXT');
}
const tienePosicionSecundariaUsuario = columnasUsuarios.some((columna) => columna.name === 'posicionSecundaria');
if (!tienePosicionSecundariaUsuario) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN posicionSecundaria TEXT');
}

const columnasPerfilJugador = {
  nombreCompleto: 'TEXT',
  fechaNacimiento: 'TEXT',
  resistencia: 'TEXT',
  ritmoJuego: 'TEXT',
  velocidad: 'INTEGER',
  pegada: 'INTEGER',
  tocaPase: 'INTEGER',
  gambeta: 'INTEGER',
  marcaDefensa: 'INTEGER',
  fisico: 'INTEGER',
  fotoUrl: 'TEXT',
};
for (const [columna, tipo] of Object.entries(columnasPerfilJugador)) {
  const yaExiste = columnasUsuarios.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Usuarios ADD COLUMN ${columna} ${tipo}`);
  }
}

const columnasInscripciones = db.prepare('PRAGMA table_info(Inscripciones)').all();
const tienePosicionPrincipalInscripcion = columnasInscripciones.some(
  (columna) => columna.name === 'posicionPrincipal'
);
if (!tienePosicionPrincipalInscripcion) {
  db.exec('ALTER TABLE Inscripciones ADD COLUMN posicionPrincipal TEXT');
}
const tienePosicionSecundariaInscripcion = columnasInscripciones.some(
  (columna) => columna.name === 'posicionSecundaria'
);
if (!tienePosicionSecundariaInscripcion) {
  db.exec('ALTER TABLE Inscripciones ADD COLUMN posicionSecundaria TEXT');
}

const columnasFormacion = {
  equipo: 'TEXT',
  linea: 'TEXT',
  ordenLinea: 'INTEGER',
};
for (const [columna, tipo] of Object.entries(columnasFormacion)) {
  const yaExiste = columnasInscripciones.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Inscripciones ADD COLUMN ${columna} ${tipo}`);
  }
}

const columnasRendimientos = db.prepare('PRAGMA table_info(RendimientosJugador)').all();
const tieneColumnaLegadaUsuarioId = columnasRendimientos.some((columna) => columna.name === 'usuarioId');
if (tieneColumnaLegadaUsuarioId) {
  // El modelo anterior guardaba un puntaje único puesto por el admin, sin dueño de voto:
  // no hay forma de atribuirle un votanteId real, así que se descartan al migrar.
  db.exec('DELETE FROM RendimientosJugador');
  db.exec('ALTER TABLE RendimientosJugador RENAME COLUMN usuarioId TO jugadorId');
}
const columnasRendimientosActualizadas = db.prepare('PRAGMA table_info(RendimientosJugador)').all();
const tieneVotanteId = columnasRendimientosActualizadas.some((columna) => columna.name === 'votanteId');
if (!tieneVotanteId) {
  db.exec('ALTER TABLE RendimientosJugador ADD COLUMN votanteId TEXT REFERENCES Usuarios(uid)');
}
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico ON RendimientosJugador (partidoId, jugadorId, votanteId)'
);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_mvp_unico ON VotosMvp (partidoId, votanteId)');

module.exports = { db };
