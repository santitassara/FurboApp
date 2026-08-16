require('dotenv').config();
const app = require('./src/app');
const partidosService = require('./src/services/partidosService');
const recordatoriosService = require('./src/services/recordatoriosService');

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

async function enviarRecordatoriosSeguro() {
  try {
    await recordatoriosService.enviarRecordatoriosPendientes();
  } catch (error) {
    console.error('Error enviando recordatorios de partido:', error);
  }
}

cerrarPartidosVencidosSeguro();
setInterval(cerrarPartidosVencidosSeguro, INTERVALO_CIERRE_MS);

enviarRecordatoriosSeguro();
setInterval(enviarRecordatoriosSeguro, INTERVALO_RECORDATORIOS_MS);

app.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
