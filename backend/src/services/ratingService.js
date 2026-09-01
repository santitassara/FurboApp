const { db } = require('../config/db');
const partidosService = require('./partidosService');
const resultadosService = require('./resultadosService');
const usuariosService = require('./usuariosService');
const notificacionesInternasService = require('./notificacionesInternasService');
const { CAMPOS_HABILIDAD } = usuariosService;
const { K_RATING, PESOS_POSICION } = require('../constants/pesosPosicion');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function calcularMediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return (ordenados[medio - 1] + ordenados[medio]) / 2;
  }
  return ordenados[medio];
}

function clamp(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function procesarPartido(partidoId, elegibles) {
  const procesados = [];
  const saltados = [];

  const votantes = new Set(
    db
      .prepare('SELECT DISTINCT votanteId FROM RendimientosJugador WHERE partidoId = ?')
      .all(partidoId)
      .map((fila) => fila.votanteId)
  );

  for (const jugadorId of elegibles) {
    const puntajes = db
      .prepare('SELECT puntaje FROM RendimientosJugador WHERE partidoId = ? AND jugadorId = ?')
      .all(partidoId, jugadorId)
      .map((fila) => fila.puntaje);

    if (puntajes.length === 0) {
      saltados.push({ usuarioId: jugadorId, motivo: 'sin_votos' });
      continue;
    }

    const usuario = db
      .prepare(
        `SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico
         FROM Usuarios WHERE uid = ?`
      )
      .get(jugadorId);

    if (CAMPOS_HABILIDAD.some((campo) => usuario[campo] == null)) {
      saltados.push({ usuarioId: jugadorId, motivo: 'perfil_incompleto' });
      continue;
    }

    const inscripcion = db
      .prepare(
        `SELECT posicionPrincipal FROM Inscripciones
         WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado' AND tipo = 'titular'`
      )
      .get(partidoId, jugadorId);
    // Hay inscripciones legadas (previas a la validación de posición en anotarse)
    // con posicionPrincipal NULL: se saltean en vez de romper todo el cierre.
    const pesos = PESOS_POSICION[inscripcion?.posicionPrincipal];
    if (!pesos) {
      saltados.push({ usuarioId: jugadorId, motivo: 'sin_posicion' });
      continue;
    }

    const mediana = calcularMediana(puntajes);
    // Jugador no votó a nadie en este partido: recibe la mitad de los puntos de valoración.
    const medianaAjustada = votantes.has(jugadorId) ? mediana : mediana / 2;
    const puntajeEscalado = medianaAjustada * 10;
    const ovrPrevio =
      CAMPOS_HABILIDAD.reduce((suma, campo) => suma + usuario[campo], 0) / CAMPOS_HABILIDAD.length;

    const nuevosValores = {};
    const cambios = {};
    for (const campo of CAMPOS_HABILIDAD) {
      const delta = (K_RATING * pesos[campo] * (puntajeEscalado - ovrPrevio)) / 100;
      const nuevo = clamp(usuario[campo] + delta, 0, 100);
      nuevosValores[campo] = nuevo;
      cambios[campo] = Math.round((nuevo - usuario[campo]) * 1000) / 1000;
    }

    db.prepare(
      `UPDATE Usuarios SET
         velocidad = @velocidad, pegada = @pegada, tocaPase = @tocaPase,
         gambeta = @gambeta, marcaDefensa = @marcaDefensa, fisico = @fisico
       WHERE uid = @uid`
    ).run({ ...nuevosValores, uid: jugadorId });

    procesados.push({
      usuarioId: jugadorId,
      mediana,
      ovrPrevio: Math.round(ovrPrevio * 10) / 10,
      cambios,
    });
  }

  return { procesados, saltados };
}

async function cerrarVotacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') {
    throw crearError('El partido todavía no tiene resultado cargado', 400);
  }
  if (partido.votacionCerrada) {
    throw crearError('La votación de este partido ya está cerrada', 400);
  }

  const elegibles = await resultadosService.obtenerElegibles(partidoId);

  let resultadoCrudo;
  const ejecutar = db.transaction(() => {
    // El flip del flag es la fuente de verdad: si otra request concurrente ya lo
    // cerró, este UPDATE no afecta filas y se aborta antes de aplicar el rating
    // dos veces. El chequeo de arriba queda solo como fast path.
    const resultadoUpdate = db
      .prepare('UPDATE Partidos SET votacionCerrada = 1 WHERE id = ? AND votacionCerrada = 0')
      .run(partidoId);
    if (resultadoUpdate.changes === 0) {
      throw crearError('La votación de este partido ya está cerrada', 400);
    }
    resultadoCrudo = procesarPartido(partidoId, elegibles);
  });
  ejecutar();
  notificacionesInternasService.crearPorVotacionCerrada(partidoId, grupoId);

  const conNombre = async (item) => {
    const usuario = await usuariosService.obtenerUsuario(item.usuarioId);
    return { ...item, nombre: usuario?.nombre || 'Jugador' };
  };

  const procesados = await Promise.all(resultadoCrudo.procesados.map(conNombre));
  const saltados = await Promise.all(resultadoCrudo.saltados.map(conNombre));

  return { procesados, saltados };
}

const VENTANA_VOTACION_MS = 72 * 60 * 60 * 1000;

async function cerrarVotacionesVencidas() {
  const pendientes = db
    .prepare(
      `SELECT p.id as partidoId, p.grupoId, r.fechaCarga
       FROM Partidos p JOIN Resultados r ON r.partidoId = p.id
       WHERE p.estado = 'jugado' AND p.votacionCerrada = 0`
    )
    .all();

  const ahora = Date.now();
  for (const fila of pendientes) {
    const vencidoPorTiempo = ahora - new Date(fila.fechaCarga).getTime() >= VENTANA_VOTACION_MS;

    const elegibles = await resultadosService.obtenerElegibles(fila.partidoId);
    const votantes = new Set(
      db
        .prepare('SELECT DISTINCT votanteId FROM RendimientosJugador WHERE partidoId = ?')
        .all(fila.partidoId)
        .map((v) => v.votanteId)
    );
    const votaronTodos = elegibles.length > 0 && elegibles.every((id) => votantes.has(id));

    if (!vencidoPorTiempo && !votaronTodos) continue;

    try {
      await cerrarVotacion(fila.partidoId, fila.grupoId);
    } catch (error) {
      console.error(`Error cerrando votación vencida del partido ${fila.partidoId}:`, error.message);
    }
  }
}

module.exports = { calcularMediana, cerrarVotacion, cerrarVotacionesVencidas };
