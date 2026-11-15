// Cuotas fijas por tipo de apuesta
const CUOTAS = {
  winner: { A: 1.80, B: 1.80, draw: 3.20 },
  loser: { A: 2.50, B: 2.50 },
  total_goals_exact: { 0: 4.0, 1: 5.0, 2: 6.0, 3: 8.0, 4: 12.0, '5+': 20.0 },
  total_goals_over: { '2.5': 1.90, '3.5': 2.80, '4.5': 4.50 },
  total_goals_under: { '2.5': 1.90, '1.5': 3.50, '0.5': 8.00 },
  goal_scorer_anytime: 6.0,
  goal_scorer_first: 10.0,
  assist_provider: 8.0,
  mvp: 10.0,
  exact_score: {
    '0-0': 12.0, '1-0': 7.0, '0-1': 7.0, '2-0': 9.0, '0-2': 9.0, '1-1': 6.0,
    '2-1': 9.0, '1-2': 9.0, '3-0': 15.0, '0-3': 15.0, '3-1': 18.0, '1-3': 18.0,
    '2-2': 12.0, '3-2': 20.0, '2-3': 20.0, '4-0': 25.0, '0-4': 25.0
  }
};

/**
 * Calcula la cuota dinámica para marcador exacto
 * Si el marcador está en la tabla predefinida, usa ese valor.
 * Si no, calcula basado en total de goles y diferencia de goles.
 */
function calcularCuotaExactScore(golesA, golesB) {
  const marcador = `${golesA}-${golesB}`;

  // Si está en la tabla predefinida, usar ese valor
  if (CUOTAS.exact_score[marcador]) {
    return CUOTAS.exact_score[marcador];
  }

  const totalGoles = golesA + golesB;
  const diffGoles = Math.abs(golesA - golesB);

  // Fórmula para cuotas dinámicas:
  // - Más goles totales = más difícil = cuota más alta
  // - Mayor diferencia = más difícil = cuota más alta
  // - Empates (diff = 0) son más probables que goleadas

  let cuotaBase = 6.0; // Base para 1-1

  // Ajustar por total de goles
  if (totalGoles === 0) cuotaBase = 12.0; // 0-0
  else if (totalGoles === 1) cuotaBase = 7.0; // 1-0, 0-1
  else if (totalGoles === 2) {
    if (diffGoles === 0) cuotaBase = 6.0; // 1-1
    else cuotaBase = 9.0; // 2-0, 0-2
  }
  else if (totalGoles === 3) {
    if (diffGoles === 1) cuotaBase = 9.0; // 2-1, 1-2
    else cuotaBase = 15.0; // 3-0, 0-3
  }
  else if (totalGoles === 4) {
    if (diffGoles === 0) cuotaBase = 12.0; // 2-2
    else if (diffGoles === 2) cuotaBase = 18.0; // 3-1, 1-3
    else cuotaBase = 25.0; // 4-0, 0-4
  }
  else {
    // 5+ goles: fórmula exponencial
    cuotaBase = 20.0 * Math.pow(1.5, totalGoles - 5) * (1 + diffGoles * 0.3);
  }

  // Redondear a 1 decimal
  return Math.round(cuotaBase * 10) / 10;
}

function obtenerCuota(tipo, seleccion) {
  if (tipo === 'exact_score') {
    // seleccion viene en formato "X-Y"
    const [golesA, golesB] = seleccion.split('-').map(Number);
    if (!isNaN(golesA) && !isNaN(golesB)) {
      return calcularCuotaExactScore(golesA, golesB);
    }
    return 25.0;
  }
  if (tipo === 'total_goals_exact') return CUOTAS.total_goals_exact[seleccion] || CUOTAS.total_goals_exact['5+'];
  if (tipo === 'total_goals_over') return CUOTAS.total_goals_over[seleccion] || 1.90;
  if (tipo === 'total_goals_under') return CUOTAS.total_goals_under[seleccion] || 1.90;
  if (tipo === 'goal_scorer_anytime' || tipo === 'assist_provider') return CUOTAS[tipo];
  if (tipo === 'goal_scorer_first') return CUOTAS.goal_scorer_first;
  if (tipo === 'mvp') return CUOTAS.mvp;
  if (tipo === 'winner') return CUOTAS.winner[seleccion] || 1.80;
  if (tipo === 'loser') return CUOTAS.loser[seleccion] || 2.50;
  return 1.0;
}

function obtenerOpcionesPartido(partido, formaciones, jugadores) {
  // Build dynamic options based on actual teams/players in match
  // Returns { winner: [...], loser: [...], total_goals_exact: [...], ... }
}

module.exports = { CUOTAS, obtenerCuota, obtenerOpcionesPartido, calcularCuotaExactScore };