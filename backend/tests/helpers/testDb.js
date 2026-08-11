const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function crearDbDeTest() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  return db;
}

module.exports = { crearDbDeTest };
