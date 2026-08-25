require('dotenv').config();
const http = require('node:http');
const app = require('./src/app');
const configurarSocket = require('./src/config/socket');
const partidosService = require('./src/services/partidosService');
const recordatoriosService = require('./src/services/recordatoriosService');
const mailer = require('./src/utils/mailer');
const { iniciarScheduler } = require('./src/config/scheduler');

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const PORT = process.env.PORT || 4000;
const INTERVALO_CIERRE_MS = 60_000;
const INTERVALO_RECORDATORIOS_MS = 5 * 60_000;

function cerrarPartidosVencidosSeguro() {
  try {
    partidosService.cerrarPartidosVencidos();
  } catch (error) {
    console.error('Error cerrando partidos vencidos:', error);
  }
}

let recordatoriosEnCurso = false;

async function enviarRecordatoriosSeguro() {
  if (recordatoriosEnCurso) return;
  recordatoriosEnCurso = true;
  try {
    await recordatoriosService.enviarRecordatoriosPendientes();
  } catch (error) {
    console.error('Error enviando recordatorios de partido:', error);
  } finally {
    recordatoriosEnCurso = false;
  }
}

mailer.verificarConfigSmtp();

cerrarPartidosVencidosSeguro();
setInterval(cerrarPartidosVencidosSeguro, INTERVALO_CIERRE_MS);

enviarRecordatoriosSeguro();
setInterval(enviarRecordatoriosSeguro, INTERVALO_RECORDATORIOS_MS);

iniciarScheduler();

const servidorHttp = http.createServer(app);
const io = configurarSocket(servidorHttp);
app.set('io', io);

servidorHttp.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
