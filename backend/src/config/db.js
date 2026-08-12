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

module.exports = { db };
