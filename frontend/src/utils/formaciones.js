export const CODIGO_AUTOMATICO = 'automatico';
export const CODIGO_LIBRE = 'libre';

export const ETIQUETAS_LINEA = {
  arquero: 'POR',
  defensa: 'DEF',
  medio: 'MED',
  medioContencion: 'MCD',
  medioOfensivo: 'MOF',
  delantero: 'ATA',
};

export const ORDEN_LINEAS_CAMPO = ['defensa', 'medioContencion', 'medio', 'medioOfensivo', 'delantero'];

function l(pares) {
  return pares.map(([key, cantidad]) => ({ key, cantidad }));
}

// Espejo exacto del catálogo backend (backend/src/data/formaciones.js):
// formaciones reales de fútbol por cantidad de jugadores por equipo. La suma de
// las líneas + 1 (arquero) = cantidad de jugadores.
export const FORMACIONES_POR_CANTIDAD = {
  // Fútbol 5 (1 arquero + 4 de campo): los 5 esquemas clásicos del 5 vs 5.
  5: [
    { codigo: '2-2', nombre: 'Clásico en dos bloques', lineas: l([['defensa', 2], ['delantero', 2]]) },
    { codigo: '1-2-1', nombre: 'Rombo (diamond)', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-1-1', nombre: 'Defensivo con volante', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-1-2', nombre: 'Ofensivo', lineas: l([['defensa', 1], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1', nombre: 'Bloque bajo', lineas: l([['defensa', 3], ['delantero', 1]]) },
  ],
  // Fútbol 6 (1 arquero + 5 de campo).
  6: [
    { codigo: '2-2-1', nombre: 'Clásico', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 1]]) },
    { codigo: '3-1-1', nombre: 'Defensivo', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 1]]) },
    { codigo: '2-1-2', nombre: 'Ofensivo', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 2]]) },
    { codigo: '1-3-1', nombre: 'Rombo ampliado', lineas: l([['defensa', 1], ['medio', 3], ['delantero', 1]]) },
    { codigo: '1-2-2', nombre: 'Ataque por los costados', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 2]]) },
  ],
  // Fútbol 7 (1 arquero + 6 de campo): formaciones típicas del 7 vs 7.
  7: [
    { codigo: '2-3-1', nombre: 'Clásico del fútbol 7', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 1]]) },
    { codigo: '3-2-1', nombre: 'Defensivo compacto', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2-2', nombre: 'Tres bloques', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 2]]) },
    { codigo: '3-1-2', nombre: 'Defensivo con doble punta', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 2]]) },
    { codigo: '2-1-3', nombre: 'Ofensivo', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 3]]) },
    { codigo: '4-1-1', nombre: 'Bloque bajo', lineas: l([['defensa', 4], ['medio', 1], ['delantero', 1]]) },
    { codigo: '3-3', nombre: 'Presión sin punta', lineas: l([['defensa', 3], ['medio', 3]]) },
  ],
  // Fútbol 8 (1 arquero + 7 de campo).
  8: [
    { codigo: '3-3-1', nombre: 'Clásico del fútbol 8', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-3-2', nombre: 'Ofensivo', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-2-2', nombre: 'Equilibrado', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 2]]) },
    { codigo: '4-2-1', nombre: 'Defensivo', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-4-1', nombre: 'Dominio del mediocampo', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 1]]) },
    { codigo: '3-4', nombre: 'Bloques de cuatro', lineas: l([['defensa', 3], ['medio', 4]]) },
    { codigo: '4-3', nombre: 'Muro con tres volantes', lineas: l([['defensa', 4], ['medio', 3]]) },
  ],
  // Fútbol 9 (1 arquero + 8 de campo).
  9: [
    { codigo: '4-3-1', nombre: 'Clásico del fútbol 9', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 1]]) },
    { codigo: '3-3-2', nombre: 'Equilibrado ofensivo', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 2]]) },
    { codigo: '4-2-2', nombre: 'Defensivo', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 2]]) },
    { codigo: '3-4-1', nombre: 'Con bandas', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-4', nombre: 'Sin punta definido', lineas: l([['defensa', 4], ['medio', 4]]) },
    { codigo: '2-4-2', nombre: 'Ofensivo', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 2]]) },
    { codigo: '5-3', nombre: 'Bloque bajo', lineas: l([['defensa', 5], ['medio', 3]]) },
  ],
  // Fútbol 10 (1 arquero + 9 de campo): suelen aparecer por expulsión u horario reducido.
  10: [
    { codigo: '4-4-1', nombre: 'Defensivo de urgencia', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-2', nombre: 'Equilibrado', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-2', nombre: 'Ofensivo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-5-1', nombre: 'Dominio del mediocampo', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 1]]) },
    { codigo: '5-3-1', nombre: 'Muy defensivo', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 1]]) },
  ],
  // Fútbol 11 (1 arquero + 10 de campo): las formaciones canónicas del fútbol
  // moderno y sus variantes históricas.
  11: [
    { codigo: '4-4-2', nombre: 'Clásico', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    { codigo: '4-3-3', nombre: 'Ofensivo moderno', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 3]]) },
    { codigo: '4-5-1', nombre: 'Defensivo de contragolpe', lineas: l([['defensa', 4], ['medio', 5], ['delantero', 1]]) },
    {
      codigo: '4-2-3-1',
      nombre: 'Estándar moderno',
      lineas: l([['defensa', 4], ['medioContencion', 2], ['medioOfensivo', 3], ['delantero', 1]]),
    },
    {
      codigo: '4-1-4-1',
      nombre: 'Con ancla',
      lineas: l([['defensa', 4], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 1]]),
    },
    {
      codigo: '4-3-1-2',
      nombre: 'Con enganche',
      lineas: l([['defensa', 4], ['medioContencion', 3], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    { codigo: '4-4-2 rombo', nombre: 'Clásico en rombo', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-5-2', nombre: 'Con lateros altos', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 2]]) },
    { codigo: '3-4-3', nombre: 'Presión alta', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 3]]) },
    {
      codigo: '3-4-1-2',
      nombre: 'Con extremos',
      lineas: l([['defensa', 3], ['medioContencion', 4], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-1-4-2',
      nombre: 'Doble cinco',
      lineas: l([['defensa', 3], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 2]]),
    },
    { codigo: '5-3-2', nombre: 'Bloque bajo y contragolpe', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 2]]) },
    { codigo: '5-4-1', nombre: 'Muy defensivo', lineas: l([['defensa', 5], ['medio', 4], ['delantero', 1]]) },
    { codigo: '5-2-3', nombre: 'Salida rápida con extremos', lineas: l([['defensa', 5], ['medio', 2], ['delantero', 3]]) },
    { codigo: '4-2-4', nombre: 'Histórica (Brasil 1958)', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 4]]) },
  ],
};

export function listarFormaciones(cantidadJugadores) {
  return FORMACIONES_POR_CANTIDAD[cantidadJugadores] || [];
}

// Espejo exacto de generarLineas (backend/src/utils/formacion.js) sin la línea de arquero,
// combinado con normalizarAutomatico (backend/src/data/formaciones.js).
function generarLineasAutomatico(cantidadJugadores) {
  if (cantidadJugadores <= 0) return { defensa: 0, medio: 0, delantero: 0 };
  if (cantidadJugadores === 1) return { defensa: 0, medio: 0, delantero: 0 };
  const resto = cantidadJugadores - 1;
  const base = Math.floor(resto / 3);
  const extra = resto % 3;
  const lineas = { defensa: base, medio: base, delantero: base };
  const ordenReparto = ['medio', 'defensa', 'delantero'];
  for (let i = 0; i < extra; i++) lineas[ordenReparto[i]]++;
  return lineas;
}

export function normalizarAutomatico(cantidadJugadores) {
  const { defensa, medio, delantero } = generarLineasAutomatico(cantidadJugadores);
  return [
    { key: 'defensa', cantidad: defensa },
    { key: 'medio', cantidad: medio },
    { key: 'delantero', cantidad: delantero },
  ].filter((linea) => linea.cantidad > 0);
}
