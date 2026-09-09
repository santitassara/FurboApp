const path = require('node:path');
const qrcode = require('qrcode-terminal');

let socket = null;
let conectado = false;

function resolverAuthDir() {
  const configurado = process.env.WHATSAPP_AUTH_DIR;
  if (!configurado) return path.join(__dirname, '../../data/whatsapp_auth');
  return path.resolve(__dirname, '../..', configurado);
}

async function iniciarWhatsapp() {
  // @whiskeysockets/baileys es un paquete ESM-only ("type": "module"): Node 22 lo
  // puede resolver con require() en runtime normal, pero el runtime de Jest no
  // soporta esa interop y revienta al cargar el módulo. Se requiere acá adentro,
  // en vez de al tope del archivo, para que ningún test (que nunca llama a esta
  // función) dispare esa carga.
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
  } = require('@whiskeysockets/baileys');

  const { state, saveCreds } = await useMultiFileAuthState(resolverAuthDir());

  socket = makeWASocket({ auth: state });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (actualizacion) => {
    const { connection, lastDisconnect, qr } = actualizacion;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      conectado = true;
      console.log('WhatsApp conectado');
    }

    if (connection === 'close') {
      conectado = false;
      const motivo = lastDisconnect?.error?.output?.statusCode;
      console.warn('WhatsApp desconectado, código:', motivo);
      if (motivo !== DisconnectReason.loggedOut) {
        iniciarWhatsapp().catch((error) => console.error('Error reconectando WhatsApp:', error.message));
      } else {
        console.error('WhatsApp deslogueado. Borrá backend/data/whatsapp_auth y volvé a escanear el QR.');
      }
    }
  });
}

function obtenerEstadoConexion() {
  return conectado ? 'conectado' : 'desconectado';
}

async function enviarMensajeGrupo(jid, texto) {
  if (!socket || !conectado) {
    console.warn(`WhatsApp desconectado, no se pudo enviar mensaje a ${jid}`);
    return;
  }
  try {
    const metadata = await socket.groupMetadata(jid);
    const mentions = metadata.participants.map((participante) => participante.id);
    await socket.sendMessage(jid, { text: texto, mentions });
  } catch (error) {
    console.error(`Error enviando mensaje de WhatsApp a ${jid}:`, error.message);
  }
}

async function listarGruposDisponibles() {
  if (!socket || !conectado) return [];
  const grupos = await socket.groupFetchAllParticipating();
  return Object.values(grupos).map((grupo) => ({ jid: grupo.id, nombre: grupo.subject }));
}

module.exports = { iniciarWhatsapp, obtenerEstadoConexion, enviarMensajeGrupo, listarGruposDisponibles };
