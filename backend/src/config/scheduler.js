const cron = require('node-cron');
const notificacionesService = require('../services/notificacionesService');
const ratingService = require('../services/ratingService');
const whatsappNotificacionesService = require('../services/whatsappNotificacionesService');

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

  console.log('Scheduler de notificaciones iniciado');
}

module.exports = { iniciarScheduler };
