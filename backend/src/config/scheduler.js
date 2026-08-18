const cron = require('node-cron');
const notificacionesService = require('../services/notificacionesService');

function iniciarScheduler() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await notificacionesService.enviarNotificacionesPrePartido();
      await notificacionesService.enviarNotificacionesPostPartido();
    } catch (error) {
      console.error('Error en scheduler de notificaciones:', error.message);
    }
  });

  console.log('Scheduler de notificaciones iniciado');
}

module.exports = { iniciarScheduler };
