const cron = require('node-cron');
const notificacionesService = require('../services/notificacionesService');
const ratingService = require('../services/ratingService');

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

  console.log('Scheduler de notificaciones iniciado');
}

module.exports = { iniciarScheduler };
