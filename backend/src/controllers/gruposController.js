const gruposService = require('../services/gruposService');

async function crear(req, res) {
  const grupo = await gruposService.crearGrupo({ nombre: req.body.nombre, creadoPor: req.usuario.uid });
  res.status(201).json(grupo);
}

async function unirse(req, res) {
  const grupo = await gruposService.unirseAGrupo({
    codigoInvitacion: req.body.codigoInvitacion,
    usuarioId: req.usuario.uid,
  });
  res.status(201).json(grupo);
}

async function listarMios(req, res) {
  const grupos = await gruposService.listarMisGrupos(req.usuario.uid);
  res.json(grupos);
}

module.exports = { crear, unirse, listarMios };
