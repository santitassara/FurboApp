const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const resultadosService = require('./resultadosService');
const inscripcionesService = require('./inscripcionesService');
const votosService = require('./votosService');
const { CUOTAS, obtenerCuota, obtenerOpcionesPartido } = require('../utils/cuotasApuestas');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// Tipos de apuesta válidos
const TIPOS_APUESTA_VALIDOS = [
  'winner', 'loser', 'total_goals_exact', 'total_goals_over', 'total_goals_under',
  'goal_scorer_anytime', 'goal_scorer_first', 'assist_provider', 'mvp', 'exact_score'
];

// Selecciones válidas por tipo
const SELECCIONES_VALIDAS = {
  winner: ['A', 'B', 'draw'],
  loser: ['A', 'B'],
  total_goals_exact: ['0', '1', '2', '3', '4', '5+'],
  total_goals_over: ['2.5', '3.5', '4.5'],
  total_goals_under: ['2.5', '1.5', '0.5'],
  exact_score: Object.keys(CUOTAS.exact_score)
};

async function obtenerSaldo(usuarioId) {
  const row = db.prepare('SELECT saldo FROM UsuarioPuntos WHERE usuarioId = ?').get(usuarioId);
  return row ? row.saldo : 0;
}

async function obtenerSaldoDisponible(usuarioId) {
  const saldo = await obtenerSaldo(usuarioId);
  // Restar apuestas pendientes
  const pendientes = db.prepare(
    'SELECT COALESCE(SUM(monto), 0) as total FROM Apuestas WHERE usuarioId = ? AND estado = ?'
  ).get(usuarioId, 'pendiente');
  return saldo - (pendientes?.total || 0);
}

async function obtenerPartidosApostables(grupoId) {
  const partidos = await partidosService.listarPartidosVisibles(grupoId);

  // Filtrar: estado=abierto, votacionEquiposCerrada=1, formaciones definidas
  const apostables = [];
  for (const partido of partidos) {
    if (partido.estado !== 'abierto') continue;
    if (!partido.votacionEquiposCerrada) continue;

    // Verificar que hay formaciones finales (inscripciones con equipo asignado)
    const formacionesDefinidas = db.prepare(`
      SELECT COUNT(*) as count FROM Inscripciones
      WHERE partidoId = ? AND estado = 'anotado' AND equipo IS NOT NULL
    `).get(partido.id);

    if (formacionesDefinidas.count === 0) continue;

    apostables.push(partido);
  }

  return apostables;
}

async function obtenerOpcionesPartidoCompleto(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  // Obtener jugadores que están en el partido (titulares y suplentes con equipo asignado)
  const inscripciones = db.prepare(`
    SELECT i.*, u.nombre, u.uid
    FROM Inscripciones i
    JOIN Usuarios u ON i.usuarioId = u.uid
    WHERE i.partidoId = ? AND i.estado = 'anotado' AND i.equipo IS NOT NULL
  `).all(partidoId);

  // Separar por equipo
  const equipoA = inscripciones.filter(i => i.equipo === 'A');
  const equipoB = inscripciones.filter(i => i.equipo === 'B');
  const todosJugadores = [...equipoA, ...equipoB];

  // Construir opciones
  const opciones = {
    winner: [
      { valor: 'A', etiqueta: 'Equipo A gana', cuota: obtenerCuota('winner', 'A') },
      { valor: 'B', etiqueta: 'Equipo B gana', cuota: obtenerCuota('winner', 'B') },
      { valor: 'draw', etiqueta: 'Empate', cuota: obtenerCuota('winner', 'draw') }
    ],
    loser: [
      { valor: 'A', etiqueta: 'Equipo A pierde', cuota: obtenerCuota('loser', 'A') },
      { valor: 'B', etiqueta: 'Equipo B pierde', cuota: obtenerCuota('loser', 'B') }
    ],
    total_goals_exact: [
      { valor: '0', etiqueta: '0 goles totales', cuota: obtenerCuota('total_goals_exact', '0') },
      { valor: '1', etiqueta: '1 gol total', cuota: obtenerCuota('total_goals_exact', '1') },
      { valor: '2', etiqueta: '2 goles totales', cuota: obtenerCuota('total_goals_exact', '2') },
      { valor: '3', etiqueta: '3 goles totales', cuota: obtenerCuota('total_goals_exact', '3') },
      { valor: '4', etiqueta: '4 goles totales', cuota: obtenerCuota('total_goals_exact', '4') },
      { valor: '5+', etiqueta: '5 o más goles totales', cuota: obtenerCuota('total_goals_exact', '5+') }
    ],
    total_goals_over: [
      { valor: '2.5', etiqueta: 'Más de 2.5 goles', cuota: obtenerCuota('total_goals_over', '2.5') },
      { valor: '3.5', etiqueta: 'Más de 3.5 goles', cuota: obtenerCuota('total_goals_over', '3.5') },
      { valor: '4.5', etiqueta: 'Más de 4.5 goles', cuota: obtenerCuota('total_goals_over', '4.5') }
    ],
    total_goals_under: [
      { valor: '2.5', etiqueta: 'Menos de 2.5 goles', cuota: obtenerCuota('total_goals_under', '2.5') },
      { valor: '1.5', etiqueta: 'Menos de 1.5 goles', cuota: obtenerCuota('total_goals_under', '1.5') },
      { valor: '0.5', etiqueta: 'Menos de 0.5 goles', cuota: obtenerCuota('total_goals_under', '0.5') }
    ],
    goal_scorer_anytime: todosJugadores.map(j => ({
      valor: j.uid,
      etiqueta: `${j.nombre} (Equipo ${j.equipo})`,
      cuota: obtenerCuota('goal_scorer_anytime'),
      jugador: { uid: j.uid, nombre: j.nombre, equipo: j.equipo }
    })),
    goal_scorer_first: todosJugadores.map(j => ({
      valor: j.uid,
      etiqueta: `${j.nombre} (Equipo ${j.equipo})`,
      cuota: obtenerCuota('goal_scorer_first'),
      jugador: { uid: j.uid, nombre: j.nombre, equipo: j.equipo }
    })),
    assist_provider: todosJugadores.map(j => ({
      valor: j.uid,
      etiqueta: `${j.nombre} (Equipo ${j.equipo})`,
      cuota: obtenerCuota('assist_provider'),
      jugador: { uid: j.uid, nombre: j.nombre, equipo: j.equipo }
    })),
    mvp: todosJugadores.map(j => ({
      valor: j.uid,
      etiqueta: `${j.nombre} (Equipo ${j.equipo})`,
      cuota: obtenerCuota('mvp'),
      jugador: { uid: j.uid, nombre: j.nombre, equipo: j.equipo }
    })),
    exact_score: Object.entries(CUOTAS.exact_score).map(([marcador, cuota]) => ({
      valor: marcador,
      etiqueta: `Marcador ${marcador}`,
      cuota
    }))
  };

  return opciones;
}

function validarApuesta(tipo, seleccion, monto) {
  if (!TIPOS_APUESTA_VALIDOS.includes(tipo)) {
    throw crearError('Tipo de apuesta inválido', 400);
  }

  if (!Number.isInteger(monto) || monto <= 0) {
    throw crearError('Monto inválido', 400);
  }

  const validas = SELECCIONES_VALIDAS[tipo];
  if (validas && !validas.includes(seleccion)) {
    throw crearError('Selección inválida', 400);
  }

  // Para tipos con jugadores dinámicos, la validación se hace en crearApuestas
  if (['goal_scorer_anytime', 'goal_scorer_first', 'assist_provider', 'mvp'].includes(tipo)) {
    // Se valida contra jugadores del partido en crearApuestas
    return;
  }
}

async function crearApuestas(partidoId, grupoId, usuarioId, apuestasInput) {
  // Validar partido apostable
  const partidosApostables = await obtenerPartidosApostables(grupoId);
  const partido = partidosApostables.find(p => p.id === partidoId);
  if (!partido) {
    throw crearError('Partido no disponible para apostar', 400);
  }

  // Validar cada apuesta y calcular total
  let totalMonto = 0;
  const apuestasValidadas = [];

  // Obtener opciones del partido para validar selecciones de jugadores
  const opciones = await obtenerOpcionesPartidoCompleto(partidoId, grupoId);
  const jugadoresValidos = new Set();
  for (const tipo of ['goal_scorer_anytime', 'goal_scorer_first', 'assist_provider', 'mvp']) {
    for (const opt of opciones[tipo]) {
      jugadoresValidos.add(opt.valor);
    }
  }

  for (const apuesta of apuestasInput) {
    const { tipo, seleccion, monto } = apuesta;
    validarApuesta(tipo, seleccion, monto);

    // Validación extra para apuestas de jugadores
    if (['goal_scorer_anytime', 'goal_scorer_first', 'assist_provider', 'mvp'].includes(tipo)) {
      if (!jugadoresValidos.has(seleccion)) {
        throw crearError('Selección inválida: jugador no participa en el partido', 400);
      }
    }

    const cuota = obtenerCuota(tipo, seleccion);
    const gananciaPotencial = Math.round(monto * cuota);

    apuestasValidadas.push({
      tipo,
      seleccion,
      monto,
      cuota,
      gananciaPotencial
    });
    totalMonto += monto;
  }

  // Verificar saldo disponible
  const saldoDisponible = await obtenerSaldoDisponible(usuarioId);
  if (totalMonto > saldoDisponible) {
    throw crearError('Saldo insuficiente', 400);
  }

  // Crear apuestas en transacción (reserva saldo + insert apuestas)
  const now = new Date().toISOString();
  const ids = [];

  const tx = db.transaction(() => {
    for (const apuesta of apuestasValidadas) {
      const id = crypto.randomUUID();
      ids.push(id);
      db.prepare(`
        INSERT INTO Apuestas (id, partidoId, usuarioId, tipo, seleccion, cuota, monto, estado, gananciaPotencial, gananciaReal, fechaCreacion, fechaResolucion)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, 0, ?, NULL)
      `).run(id, partidoId, usuarioId, apuesta.tipo, apuesta.seleccion, apuesta.cuota, apuesta.monto, apuesta.gananciaPotencial, now);
    }
  });
  tx();

  const nuevoSaldo = await obtenerSaldoDisponible(usuarioId);
  const apuestasCreadas = db.prepare('SELECT * FROM Apuestas WHERE id IN (' + ids.map(() => '?').join(',') + ')').all(...ids);

  return { apuestas: apuestasCreadas, nuevoSaldo };
}

async function obtenerMisApuestas(usuarioId, grupoId) {
  let query = `
    SELECT a.*, p.fecha as partidoFecha, p.rival, p.estadio, p.estado as partidoEstado
    FROM Apuestas a
    JOIN Partidos p ON a.partidoId = p.id
    WHERE a.usuarioId = ?
  `;
  const params = [usuarioId];

  if (grupoId) {
    query += ' AND p.grupoId = ?';
    params.push(grupoId);
  }

  query += ' ORDER BY a.fechaCreacion DESC';

  return db.prepare(query).all(...params);
}

async function resolverPartido(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') throw crearError('El partido no ha finalizado', 400);
  if (!partido.votacionCerrada) throw crearError('La votación de performance no está cerrada', 400);

  // Obtener resultado real
  const resultado = await resultadosService.obtenerResultado(partidoId, grupoId);
  if (!resultado) throw crearError('Resultado no cargado', 400);

  // Obtener goles
  const goles = db.prepare(`
    SELECT g.*, u.nombre as jugadorNombre, u.uid as jugadorUid
    FROM Goles g
    LEFT JOIN Usuarios u ON g.usuarioId = u.uid
    WHERE g.partidoId = ?
    ORDER BY g.minuto ASC, g.segundo ASC
  `).all(partidoId);

  // Obtener MVP (jugador con más votos)
  const mvpVotos = db.prepare(`
    SELECT jugadorId, COUNT(*) as votos
    FROM VotosMvp
    WHERE partidoId = ? AND jugadorId IS NOT NULL
    GROUP BY jugadorId
    ORDER BY votos DESC
  `).all(partidoId);
  const mvpGanador = mvpVotos.length > 0 ? mvpVotos[0].jugadorId : null;

  // Obtener jugadores que jugaron (titulares + suplentes que entraron en formación)
  const jugadoresQueJugaron = db.prepare(`
    SELECT usuarioId FROM Inscripciones
    WHERE partidoId = ? AND estado = 'anotado' AND equipo IS NOT NULL
  `).all(partidoId);
  const uidsJugaron = new Set(jugadoresQueJugaron.map(j => j.usuarioId));

  // Goles por equipo
  const golesEquipoA = goles.filter(g => g.equipo === 'A').length;
  const golesEquipoB = goles.filter(g => g.equipo === 'B').length;
  const totalGoles = golesEquipoA + golesEquipoB;

  // Determinar ganador
  let ganador = null;
  if (golesEquipoA > golesEquipoB) ganador = 'A';
  else if (golesEquipoB > golesEquipoA) ganador = 'B';
  else ganador = 'draw';
  const perdedor = ganador === 'draw' ? null : (ganador === 'A' ? 'B' : 'A');

  // Goleadores y asistidores
  const goleadores = new Set(goles.filter(g => !g.enContra).map(g => g.usuarioId).filter(Boolean));
  const primerGol = goles.find(g => !g.enContra);
  const primerGoleador = primerGol ? primerGol.usuarioId : null;
  const asistidores = new Set(goles.filter(g => g.asistenciaUsuarioId).map(g => g.asistenciaUsuarioId));

  // Obtener apuestas pendientes del partido
  const apuestasPendientes = db.prepare(`
    SELECT * FROM Apuestas WHERE partidoId = ? AND estado = 'pendiente'
  `).all(partidoId);

  let totalApostado = 0;
  let totalPagado = 0;
  const porTipo = {};

  const tx = db.transaction(() => {
    for (const apuesta of apuestasPendientes) {
      totalApostado += apuesta.monto;
      let gana = false;
      let gananciaReal = 0;

      switch (apuesta.tipo) {
        case 'winner':
          gana = (apuesta.seleccion === ganador);
          break;
        case 'loser':
          gana = (apuesta.seleccion === perdedor);
          break;
        case 'total_goals_exact':
          gana = (apuesta.seleccion === String(totalGoles) || (totalGoles >= 5 && apuesta.seleccion === '5+'));
          break;
        case 'total_goals_over':
          const overThreshold = parseFloat(apuesta.seleccion);
          gana = (totalGoles > overThreshold);
          break;
        case 'total_goals_under':
          const underThreshold = parseFloat(apuesta.seleccion);
          gana = (totalGoles < underThreshold);
          break;
        case 'goal_scorer_anytime':
          // Si el jugador no jugó, pierde automáticamente
          if (!uidsJugaron.has(apuesta.seleccion)) {
            gana = false;
          } else {
            gana = goleadores.has(apuesta.seleccion);
          }
          break;
        case 'goal_scorer_first':
          if (!uidsJugaron.has(apuesta.seleccion)) {
            gana = false;
          } else {
            gana = (apuesta.seleccion === primerGoleador);
          }
          break;
        case 'assist_provider':
          if (!uidsJugaron.has(apuesta.seleccion)) {
            gana = false;
          } else {
            gana = asistidores.has(apuesta.seleccion);
          }
          break;
        case 'mvp':
          if (!uidsJugaron.has(apuesta.seleccion)) {
            gana = false;
          } else {
            gana = (apuesta.seleccion === mvpGanador);
          }
          break;
        case 'exact_score':
          const marcadorReal = `${golesEquipoA}-${golesEquipoB}`;
          gana = (apuesta.seleccion === marcadorReal);
          break;
      }

      if (gana) {
        gananciaReal = Math.round(apuesta.monto * apuesta.cuota);
        totalPagado += gananciaReal;

        // Actualizar saldo del usuario
        db.prepare('UPDATE UsuarioPuntos SET saldo = saldo + ?, actualizadoEn = ? WHERE usuarioId = ?')
          .run(gananciaReal, new Date().toISOString(), apuesta.usuarioId);
      }

      // Actualizar apuesta
      db.prepare(`
        UPDATE Apuestas SET estado = ?, gananciaReal = ?, fechaResolucion = ? WHERE id = ?
      `).run(gana ? 'ganada' : 'perdida', gananciaReal, new Date().toISOString(), apuesta.id);

      // Estadísticas por tipo
      if (!porTipo[apuesta.tipo]) porTipo[apuesta.tipo] = { total: 0, ganadas: 0, pagado: 0 };
      porTipo[apuesta.tipo].total++;
      if (gana) {
        porTipo[apuesta.tipo].ganadas++;
        porTipo[apuesta.tipo].pagado += gananciaReal;
      }
    }
  });
  tx();

  const excedenteCasa = totalApostado - totalPagado;

  return {
    totalApostado,
    totalPagado,
    excedenteCasa,
    porTipo
  };
}

async function reembolsarPartido(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const apuestasPendientes = db.prepare(`
    SELECT * FROM Apuestas WHERE partidoId = ? AND estado = 'pendiente'
  `).all(partidoId);

  if (apuestasPendientes.length === 0) return { reembolsadas: 0 };

  const tx = db.transaction(() => {
    for (const apuesta of apuestasPendientes) {
      // Devolver monto al saldo
      db.prepare('UPDATE UsuarioPuntos SET saldo = saldo + ?, actualizadoEn = ? WHERE usuarioId = ?')
        .run(apuesta.monto, new Date().toISOString(), apuesta.usuarioId);

      // Actualizar apuesta
      db.prepare(`
        UPDATE Apuestas SET estado = 'reembolsada', fechaResolucion = ? WHERE id = ?
      `).run(new Date().toISOString(), apuesta.id);
    }
  });
  tx();

  return { reembolsadas: apuestasPendientes.length };
}

module.exports = {
  obtenerSaldo,
  obtenerSaldoDisponible,
  obtenerPartidosApostables,
  obtenerOpcionesPartido: obtenerOpcionesPartidoCompleto,
  crearApuestas,
  obtenerMisApuestas,
  resolverPartido,
  reembolsarPartido
};