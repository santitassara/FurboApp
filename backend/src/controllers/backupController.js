const backupTelegramService = require('../services/backupTelegramService');

async function enviarBackupTelegram(req, res) {
  await backupTelegramService.crearBackup();
  res.json({ ok: true });
}

module.exports = { enviarBackupTelegram };
