const cron = require('node-cron');
const notificacionesService = require('../services/notificacionesService');
const ratingService = require('../services/ratingService');
const whatsappNotificacionesService = require('../services/whatsappNotificacionesService');
const backupTelegramService = require('../services/backupTelegramService');
const programacionesService = require('../services/programacionesService');

function iniciarScheduler() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await notificacionesService.enviarNotificacionesPrePartido();
      await notificacionesService.enviarNotificacionesPostPartido();
      await notificacionesService.enviarRecordatoriosVotacion();
    } catch (error) {
      console.error('Error en scheduler de notificaciones:', error.message);
    }

    try {
      await ratingService.cerrarVotacionesVencidas();
    } catch (error) {
      console.error('Error en scheduler de cierre de votación:', error.message);
    }

    try {
      await programacionesService.ejecutarProgramacionesVencidas();
    } catch (error) {
      console.error('Error en scheduler de programaciones de partido:', error.message);
    }
  });

  cron.schedule(
    '0 13 * * *',
    async () => {
      try {
        await whatsappNotificacionesService.enviarWhatsappRecordatoriosDiariosAnotate();
      } catch (error) {
        console.error('Error en cron WhatsApp diario (anotate):', error.message);
      }
    },
    { timezone: 'America/Argentina/Buenos_Aires' }
  );

  cron.schedule(
    '0 15 * * *',
    async () => {
      try {
        await whatsappNotificacionesService.enviarWhatsappRecordatoriosDiariosPostPartido();
      } catch (error) {
        console.error('Error en cron WhatsApp diario (post-partido):', error.message);
      }
    },
    { timezone: 'America/Argentina/Buenos_Aires' }
  );

  cron.schedule(
    '0 4 * * *',
    async () => {
      await backupTelegramService.enviarBackupDiario();
    },
    { timezone: 'America/Argentina/Buenos_Aires' }
  );

  // Corrida de arranque: recupera disparos perdidos mientras el backend
  // estuvo caído, sin esperar al próximo minuto.
  programacionesService.ejecutarProgramacionesVencidas().catch((error) => {
    console.error('Error en la corrida inicial de programaciones:', error.message);
  });

  console.log('Scheduler de notificaciones iniciado');
}

module.exports = { iniciarScheduler };
