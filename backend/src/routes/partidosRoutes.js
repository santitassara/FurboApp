const express = require('express');
const verificarToken = require('../middlewares/verificarToken');
const verificarMiembroGrupo = require('../middlewares/verificarMiembroGrupo');
const envolverAsync = require('../utils/envolverAsync');
const partidosController = require('../controllers/partidosController');
const inscripcionesController = require('../controllers/inscripcionesController');
const resultadosController = require('../controllers/resultadosController');
const votosController = require('../controllers/votosController');
const formacionesPropuestasController = require('../controllers/formacionesPropuestasController');
const miEquipoController = require('../controllers/miEquipoController');

const router = express.Router({ mergeParams: true });

router.get('/', verificarToken, verificarMiembroGrupo(), envolverAsync(partidosController.listar));
router.get('/historial', verificarToken, verificarMiembroGrupo(), envolverAsync(partidosController.historial));
router.post('/', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(partidosController.crear));
router.delete('/:partidoId', verificarToken, verificarMiembroGrupo('admin'), envolverAsync(partidosController.eliminar));
router.post('/:partidoId/anotarse', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.anotarse));
router.post('/:partidoId/bajarse', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.bajarse));
router.get('/:partidoId/inscripciones', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.listarPorPartido));
router.get('/:partidoId/formacion', verificarToken, verificarMiembroGrupo(), envolverAsync(inscripcionesController.verFormacion));
router.put(
  '/:partidoId/formacion',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.guardarFormacion)
);
router.post(
  '/:partidoId/formacion/auto',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.generarFormacionAutomatica)
);
router.post(
  '/:partidoId/promover/:usuarioId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.promover)
);
router.post(
  '/:partidoId/sancionar/:usuarioId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(inscripcionesController.sancionarManualmente)
);

router.get('/:partidoId/resultado', verificarToken, verificarMiembroGrupo(), envolverAsync(resultadosController.obtener));
router.put(
  '/:partidoId/resultado',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(resultadosController.guardar)
);

router.get('/:partidoId/votos/mios', verificarToken, verificarMiembroGrupo(), envolverAsync(votosController.obtenerMios));
router.post('/:partidoId/votos', verificarToken, verificarMiembroGrupo(), envolverAsync(votosController.guardar));
router.post(
  '/:partidoId/cerrar-votacion',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(votosController.cerrarVotacion)
);

router.post(
  '/:partidoId/formaciones-propuestas',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(formacionesPropuestasController.crear)
);
router.get(
  '/:partidoId/formaciones-propuestas',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(formacionesPropuestasController.listar)
);
router.delete(
  '/:partidoId/formaciones-propuestas/:propuestaId',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(formacionesPropuestasController.eliminar)
);
router.post(
  '/:partidoId/formaciones-propuestas/:propuestaId/votar',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(formacionesPropuestasController.votar)
);
router.post(
  '/:partidoId/formaciones-propuestas/cerrar',
  verificarToken,
  verificarMiembroGrupo('admin'),
  envolverAsync(formacionesPropuestasController.cerrar)
);

router.get(
  '/:partidoId/mi-equipo',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(miEquipoController.obtener)
);
router.post(
  '/:partidoId/mi-equipo/mensajes',
  verificarToken,
  verificarMiembroGrupo(),
  envolverAsync(miEquipoController.enviarMensaje)
);

module.exports = router;
