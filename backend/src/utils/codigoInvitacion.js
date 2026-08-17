const crypto = require('node:crypto');

function slugificar(nombre) {
  const limpio = String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10);
  return limpio || 'GRUPO';
}

function generarCodigoInvitacion(nombre) {
  const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `${slugificar(nombre)}-${sufijo}`;
}

module.exports = { generarCodigoInvitacion };
