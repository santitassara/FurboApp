const whatsappConfig = require('../config/whatsapp');

async function listarGruposDisponibles(req, res) {
  const grupos = await whatsappConfig.listarGruposDisponibles();
  res.json(grupos);
}

module.exports = { listarGruposDisponibles };
