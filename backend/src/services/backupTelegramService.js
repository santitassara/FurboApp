const fs = require('node:fs');
const path = require('node:path');
const { db, DB_PATH } = require('../config/db');

const DIR_BACKUPS_TMP = path.join(__dirname, '../../data/backups');

function nombreArchivo() {
  const ahora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
  const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;
  return `furboapp-backup-${fecha}-${hora}.db`;
}

async function generarArchivoBackup() {
  fs.mkdirSync(DIR_BACKUPS_TMP, { recursive: true });
  const rutaTemporal = path.join(DIR_BACKUPS_TMP, `tmp-${Date.now()}.db`);
  await db.backup(rutaTemporal);
  return rutaTemporal;
}

async function enviarArchivoATelegram(rutaArchivo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_BACKUP_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_BACKUP_CHAT_ID en el entorno');
  }

  const buffer = fs.readFileSync(rutaArchivo);
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', `Backup de ${path.basename(DB_PATH)} - ${new Date().toISOString()}`);
  formData.append('document', new Blob([buffer]), nombreArchivo());

  const respuesta = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData,
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Telegram respondió ${respuesta.status}: ${detalle}`);
  }
}

async function crearBackup() {
  const rutaTemporal = await generarArchivoBackup();
  try {
    await enviarArchivoATelegram(rutaTemporal);
  } finally {
    fs.rmSync(rutaTemporal, { force: true });
  }
}

async function enviarBackupDiario() {
  try {
    await crearBackup();
    console.log('Backup de base de datos enviado a Telegram');
  } catch (error) {
    console.error('Error enviando backup a Telegram:', error.message);
  }
}

module.exports = { crearBackup, enviarBackupDiario };
