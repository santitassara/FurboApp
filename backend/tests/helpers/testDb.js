const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function crearDbDeTest() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  // Create unique indexes for voting (required for ON CONFLICT in votosService)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico ON RendimientosJugador (partidoId, jugadorId, votanteId)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_mvp_unico ON VotosMvp (partidoId, votanteId)');
  return db;
}

module.exports = { crearDbDeTest };
