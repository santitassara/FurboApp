const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../data/furboapp.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

module.exports = { db };
