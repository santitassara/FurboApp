const inscripcionesService = require('../services/inscripcionesService');
const usuariosService = require('../services/usuariosService');

async function anotarse(req, res) {
  const inscripcion = await inscripcionesService.anotarse(req.params.partidoId, req.usuario.uid, req.body);
  res.status(201).json(inscripcion);
}

async function bajarse(req, res) {
  const inscripcion = await inscripcionesService.bajarse(req.params.partidoId, req.usuario.uid);
  res.json(inscripcion);
}

async function promover(req, res) {
  const inscripcion = await inscripcionesService.promover(req.params.partidoId, req.params.usuarioId);
  res.json(inscripcion);
}

async function sancionarManualmente(req, res) {
  const inscripcion = await inscripcionesService.sancionarManualmente(req.params.partidoId, req.params.usuarioId);
  res.json(inscripcion);
}

async function listarPorPartido(req, res) {
  const inscripciones = await inscripcionesService.listarActivas(req.params.partidoId);
  const conNombre = await Promise.all(
    inscripciones.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        tipo: inscripcion.tipo,
        posicionPrincipal: inscripcion.posicionPrincipal,
        posicionSecundaria: inscripcion.posicionSecundaria,
      };
    })
  );
  res.json(conNombre);
}

async function verFormacion(req, res) {
  const formacion = await inscripcionesService.obtenerFormacion(req.params.partidoId);
  res.json(formacion);
}

async function guardarFormacion(req, res) {
  const formacion = await inscripcionesService.guardarFormacion(req.params.partidoId, req.body.asignaciones);
  res.json(formacion);
}

async function generarFormacionAutomatica(req, res) {
  const formacion = await inscripcionesService.generarFormacionAutomatica(req.params.partidoId);
  res.json(formacion);
}

module.exports = {
  anotarse,
  bajarse,
  promover,
  sancionarManualmente,
  listarPorPartido,
  verFormacion,
  guardarFormacion,
  generarFormacionAutomatica,
};
