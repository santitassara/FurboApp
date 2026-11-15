// Tipos de apuesta válidos
export const TIPOS_APUESTA_VALIDOS = [
  'winner',
  'loser',
  'total_goals_exact',
  'total_goals_over',
  'total_goals_under',
  'goal_scorer_anytime',
  'goal_scorer_first',
  'assist_provider',
  'mvp',
  'exact_score',
];

// Etiquetas amigables para los tipos de apuesta
export const TIPOS_APUESTA_ETIQUETAS = {
  winner: 'Ganador del partido',
  loser: 'Perdedor del partido',
  total_goals_exact: 'Goles totales exactos',
  total_goals_over: 'Más de X goles',
  total_goals_under: 'Menos de X goles',
  goal_scorer_anytime: 'Goleador (en cualquier momento)',
  goal_scorer_first: 'Primer goleador',
  assist_provider: 'Asistidor',
  mvp: 'MVP del partido',
  exact_score: 'Marcador exacto',
};

// Iconos para cada tipo de apuesta (para uso en UI)
export const TIPOS_APUESTA_ICONOS = {
  winner: '🏆',
  loser: '📉',
  total_goals_exact: '🎯',
  total_goals_over: '📈',
  total_goals_under: '📉',
  goal_scorer_anytime: '⚽',
  goal_scorer_first: '🥇',
  assist_provider: '🎯',
  mvp: '⭐',
  exact_score: '📊',
};

// Estado de las apuestas
export const ESTADOS_APUESTA = {
  PENDIENTE: 'pendiente',
  GANADA: 'ganada',
  PERDIDA: 'perdida',
  REEMBOLSADA: 'reembolsada',
};

export const ESTADOS_APUESTA_ETIQUETAS = {
  pendiente: 'Pendiente',
  ganada: 'Ganada',
  perdida: 'Perdida',
  reembolsada: 'Reembolsada',
};

export const ESTADOS_APUESTA_COLORES = {
  pendiente: '#f59e0b', // amber
  ganada: '#10b981', // emerald
  perdida: '#ef4444', // red
  reembolsada: '#6b7280', // gray
};

// Tipos de selección para apuestas estáticas (no de jugadores)
export const SELECCIONES_ESTATICAS = {
  winner: [
    { valor: 'A', etiqueta: 'Equipo A gana' },
    { valor: 'B', etiqueta: 'Equipo B gana' },
    { valor: 'draw', etiqueta: 'Empate' },
  ],
  loser: [
    { valor: 'A', etiqueta: 'Equipo A pierde' },
    { valor: 'B', etiqueta: 'Equipo B pierde' },
  ],
  total_goals_exact: [
    { valor: '0', etiqueta: '0 goles totales' },
    { valor: '1', etiqueta: '1 gol total' },
    { valor: '2', etiqueta: '2 goles totales' },
    { valor: '3', etiqueta: '3 goles totales' },
    { valor: '4', etiqueta: '4 goles totales' },
    { valor: '5+', etiqueta: '5 o más goles totales' },
  ],
  total_goals_over: [
    { valor: '2.5', etiqueta: 'Más de 2.5 goles' },
    { valor: '3.5', etiqueta: 'Más de 3.5 goles' },
    { valor: '4.5', etiqueta: 'Más de 4.5 goles' },
  ],
  total_goals_under: [
    { valor: '2.5', etiqueta: 'Menos de 2.5 goles' },
    { valor: '1.5', etiqueta: 'Menos de 1.5 goles' },
    { valor: '0.5', etiqueta: 'Menos de 0.5 goles' },
  ],
};

// Tipos que requieren selección de jugador
export const TIPOS_JUGADOR = [
  'goal_scorer_anytime',
  'goal_scorer_first',
  'assist_provider',
  'mvp',
];

// Helper: verificar si un tipo requiere selección de jugador
export function esTipoJugador(tipo) {
  return TIPOS_JUGADOR.includes(tipo);
}

// Helper: obtener etiqueta de tipo
export function obtenerEtiquetaTipo(tipo) {
  return TIPOS_APUESTA_ETIQUETAS[tipo] || tipo;
}

// Helper: obtener icono de tipo
export function obtenerIconoTipo(tipo) {
  return TIPOS_APUESTA_ICONOS[tipo] || '❓';
}

// Helper: obtener color según estado
export function obtenerColorEstado(estado) {
  return ESTADOS_APUESTA_COLORES[estado] || '#6b7280';
}

// Helper: obtener etiqueta de estado
export function obtenerEtiquetaEstado(estado) {
  return ESTADOS_APUESTA_ETIQUETAS[estado] || estado;
}

// Formatear ganancia potencial
export function formatearGanancia(ganancia) {
  return `${ganancia.toLocaleString()} pts`;
}

// Formatear monto
export function formatearMonto(monto) {
  return `${monto.toLocaleString()} pts`;
}

// Formatear cuota
export function formatearCuota(cuota) {
  return `${cuota.toFixed(2)}x`;
}