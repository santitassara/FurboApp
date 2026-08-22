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

async function abandonar(req, res) {
  const { grupoId } = req.params;
  await gruposService.abandonarGrupo(grupoId, req.usuario.uid);
  res.status(204).send();
}

async function listarMiembros(req, res) {
  const { grupoId } = req.params;
  const miembros = await gruposService.listarMiembros(grupoId);
  res.json(miembros);
}

async function promoverAAdmin(req, res) {
  const { grupoId, uid } = req.params;
  await gruposService.promoverAAdmin(grupoId, uid);
  res.json({ mensaje: 'Usuario promovido a admin' });
}

async function desporomoverDeAdmin(req, res) {
  const { grupoId, uid } = req.params;
  await gruposService.desporomoverDeAdmin(grupoId, uid);
  res.json({ mensaje: 'Admin revocado' });
}

module.exports = { crear, unirse, listarMios, abandonar, listarMiembros, promoverAAdmin, desporomoverDeAdmin };
