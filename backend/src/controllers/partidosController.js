const partidosService = require('../services/partidosService');
const inscripcionesService = require('../services/inscripcionesService');

async function listar(req, res) {
  const partidos = await partidosService.listarPartidosAbiertos();
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
    }))
  );
  res.json(partidosConCupos);
}

async function crear(req, res) {
  const { fecha, cupoTitulares, cupoSuplentes } = req.body;
  const partido = await partidosService.crearPartido({
    fecha,
    cupoTitulares,
    cupoSuplentes,
    creadoPor: req.usuario.uid,
  });
  res.status(201).json(partido);
}

async function eliminar(req, res) {
  const { partidoId } = req.params;
  await partidosService.eliminarPartido(partidoId, req.usuario.uid);
  res.status(204).send();
}

module.exports = { listar, crear, eliminar };
