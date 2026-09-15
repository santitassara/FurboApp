const partidosService = require('../services/partidosService');
const inscripcionesService = require('../services/inscripcionesService');
const climaService = require('../services/climaService');
const estadisticasService = require('../services/estadisticasService');

async function listar(req, res) {
  const partidos = await partidosService.listarPartidosVisibles(req.params.grupoId);
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
      clima:
        partido.lat != null && partido.lon != null
          ? await climaService.obtenerPronostico(partido.lat, partido.lon, partido.fecha)
          : null,
    }))
  );
  res.json(partidosConCupos);
}

async function historial(req, res) {
  const partidos = await partidosService.listarPartidosJugados(req.params.grupoId);
  const partidosConCupos = await Promise.all(
    partidos.map(async (partido) => ({
      ...partido,
      ocupados: await inscripcionesService.contarOcupados(partido.id),
    }))
  );
  res.json(partidosConCupos);
}

async function crear(req, res) {
  const { fecha, cupoTitulares, cupoSuplentes, estadio, tipoSuelo, direccion, valorCuota } = req.body;
  const partido = await partidosService.crearPartido({
    fecha,
    cupoTitulares,
    cupoSuplentes,
    estadio,
    tipoSuelo,
    direccion,
    valorCuota: valorCuota !== undefined && valorCuota !== null ? Number(valorCuota) : null,
    creadoPor: req.usuario.uid,
    grupoId: req.params.grupoId,
  });
  res.status(201).json(partido);
}

async function eliminar(req, res) {
  const { partidoId, grupoId } = req.params;
  await partidosService.eliminarPartido(partidoId, grupoId, req.usuario.uid);
  res.status(204).send();
}

async function lideresMes(req, res) {
  const lideres = await estadisticasService.obtenerLideresDelMes(req.params.grupoId);
  res.json(lideres);
}

module.exports = { listar, historial, crear, eliminar, lideresMes };
