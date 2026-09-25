const invitadosService = require('../services/invitadosService');

async function proponer(req, res) {
  const invitado = await invitadosService.proponer(req.params.grupoId, req.usuario.uid, req.body);
  res.status(201).json(invitado);
}

async function listar(req, res) {
  const esAdmin = req.miembro?.rol === 'admin';
  const invitados = await invitadosService.listar(req.params.grupoId, req.usuario.uid, esAdmin);
  res.json(invitados);
}

async function aprobar(req, res) {
  const invitado = await invitadosService.aprobar(req.params.grupoId, req.params.invitadoId, req.usuario.uid);
  res.json(invitado);
}

async function rechazar(req, res) {
  const invitado = await invitadosService.rechazar(req.params.grupoId, req.params.invitadoId, req.usuario.uid);
  res.json(invitado);
}

module.exports = {
  proponer,
  listar,
  aprobar,
  rechazar,
};
