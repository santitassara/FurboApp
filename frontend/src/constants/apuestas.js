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

// Descripciones de cada tipo de apuesta
export const TIPOS_APUESTA_DESCRIPCIONES = {
  winner: 'Apuesta a qué equipo ganará el partido (o si habrá empate).',
  loser: 'Apuesta a qué equipo perderá el partido. No incluye empate.',
  total_goals_exact: 'Apuesta al número exacto de goles totales en el partido.',
  total_goals_over: 'Apuesta a que habrá más goles totales que el umbral indicado (ej: más de 2.5 = 3 o más goles).',
  total_goals_under: 'Apuesta a que habrá menos goles totales que el umbral indicado (ej: menos de 2.5 = 2 o menos goles).',
  goal_scorer_anytime: 'Apuesta a que un jugador específico marcará al menos un gol en cualquier momento del partido.',
  goal_scorer_first: 'Apuesta a que un jugador específico marcará el primer gol del partido.',
  assist_provider: 'Apuesta a que un jugador específico dará al menos una asistencia de gol.',
  mvp: 'Apuesta a qué jugador será elegido MVP (mejor valorado) en la votación post-partido.',
  exact_score: 'Apuesta al marcador exacto final (ej: 2-1, 1-1, 3-0). Paga cuotas altas por su dificultad.',
};

// Ejemplos de uso para cada tipo de apuesta
export const TIPOS_APUESTA_EJEMPLOS = {
  winner: 'Ej: Apostás a "Equipo A gana" (cuota 1.80). Si el Equipo A gana, cobras 1.80x tu apuesta.',
  loser: 'Ej: Apostás a "Equipo B pierde" (cuota 2.50). Si el Equipo B pierde, cobras 2.50x tu apuesta.',
  total_goals_exact: 'Ej: Apostás a "2 goles totales" (cuota 6.0). Si el partido termina 1-1, 2-0 o 0-2, cobras 6.0x.',
  total_goals_over: 'Ej: Apostás a "Más de 2.5 goles" (cuota 1.90). Si hay 3 o más goles totales, cobras 1.90x.',
  total_goals_under: 'Ej: Apostás a "Menos de 1.5 goles" (cuota 3.50). Si hay 0 o 1 gol total, cobras 3.50x.',
  goal_scorer_anytime: 'Ej: Apostás a "Juan Pérez" (cuota 6.0). Si Juan marca al menos un gol, cobras 6.0x.',
  goal_scorer_first: 'Ej: Apostás a "Carlos López" (cuota 10.0). Si Carlos marca el primer gol del partido, cobras 10.0x.',
  assist_provider: 'Ej: Apostás a "Martín Gómez" (cuota 8.0). Si Martín da una asistencia, cobras 8.0x.',
  mvp: 'Ej: Apostás a "Lucas Fernández" (cuota 10.0). Si Lucas es votado MVP, cobras 10.0x.',
  exact_score: 'Ej: Apostás a "2-1" (cuota 9.0). Si el partido termina exactamente 2-1, cobras 9.0x.',
};

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