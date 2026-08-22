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

export const FORMACIONES_POR_CANTIDAD = {
  5: [
    { codigo: '1-2-1', nombre: 'El Rombo', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2', nombre: 'El Cuadrado', lineas: l([['defensa', 2], ['delantero', 2]]) },
    { codigo: '2-1-1', nombre: 'La Y invertida', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-1-2', nombre: 'La Y', lineas: l([['defensa', 1], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1', nombre: 'El Muro', lineas: l([['defensa', 3], ['delantero', 1]]) },
  ],
  6: [
    { codigo: '2-2-1', nombre: 'El clásico', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-1-2', nombre: 'Variante ofensiva', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 2]]) },
    { codigo: '3-1-1', nombre: 'Contención pura', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 1]]) },
    { codigo: '1-3-1', nombre: 'El rombo ampliado', lineas: l([['defensa', 1], ['medio', 3], ['delantero', 1]]) },
    { codigo: '1-2-2', nombre: 'Posesión con dos puntas', lineas: l([['defensa', 1], ['medio', 2], ['delantero', 2]]) },
  ],
  7: [
    { codigo: '2-3-1', nombre: 'La más usada', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 1]]) },
    { codigo: '3-2-1', nombre: 'Árbol de Navidad', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 1]]) },
    { codigo: '2-2-2', nombre: 'En bloques', lineas: l([['defensa', 2], ['medio', 2], ['delantero', 2]]) },
    { codigo: '3-1-2', nombre: 'Defensiva con peso ofensivo', lineas: l([['defensa', 3], ['medio', 1], ['delantero', 2]]) },
    { codigo: '2-1-3', nombre: 'Ultraofensiva', lineas: l([['defensa', 2], ['medio', 1], ['delantero', 3]]) },
  ],
  8: [
    { codigo: '3-3-1', nombre: 'El estándar', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-3-2', nombre: 'Ofensiva con repliegue', lineas: l([['defensa', 2], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-2-2', nombre: 'Sólida', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 2]]) },
    { codigo: '2-4-1', nombre: 'Dominio del mediocampo', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-2-1', nombre: 'Catenaccio', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 1]]) },
  ],
  9: [
    { codigo: '3-3-2', nombre: 'El clásico escalado', lineas: l([['defensa', 3], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-1', nombre: 'Prioriza las bandas', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-1', nombre: 'Para aguantar un resultado', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 1]]) },
    { codigo: '2-4-2', nombre: 'Presión alta', lineas: l([['defensa', 2], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-2-3', nombre: 'Doble 5 con tres atacantes', lineas: l([['defensa', 3], ['medio', 2], ['delantero', 3]]) },
  ],
  10: [
    { codigo: '4-4-1', nombre: 'La típica de expulsión', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 1]]) },
    { codigo: '4-3-2', nombre: 'A buscar el partido', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 2]]) },
    { codigo: '3-4-2', nombre: 'Sin perder volumen ofensivo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 2]]) },
    { codigo: '3-5-1', nombre: 'Dominar la posesión con 10', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 1]]) },
    { codigo: '5-3-1', nombre: 'Cerrar el partido', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 1]]) },
  ],
  11: [
    { codigo: '4-4-2', nombre: 'Clásico o en Rombo', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    { codigo: '4-3-3', nombre: 'Fútbol ofensivo puro', lineas: l([['defensa', 4], ['medio', 3], ['delantero', 3]]) },
    { codigo: '4-5-1', nombre: 'Defensiva y de contragolpe', lineas: l([['defensa', 4], ['medio', 5], ['delantero', 1]]) },
    { codigo: '4-2-4', nombre: 'Muy antigua (Brasil 58)', lineas: l([['defensa', 4], ['medio', 2], ['delantero', 4]]) },
    { codigo: '3-5-2', nombre: 'Mucho peso en el medio', lineas: l([['defensa', 3], ['medio', 5], ['delantero', 2]]) },
    { codigo: '3-4-3', nombre: 'Presión alta y vértigo', lineas: l([['defensa', 3], ['medio', 4], ['delantero', 3]]) },
    { codigo: '5-3-2', nombre: 'Contragolpe directo', lineas: l([['defensa', 5], ['medio', 3], ['delantero', 2]]) },
    { codigo: '5-4-1', nombre: 'El autobús', lineas: l([['defensa', 5], ['medio', 4], ['delantero', 1]]) },
    { codigo: '5-2-3', nombre: 'Salida rápida con extremos', lineas: l([['defensa', 5], ['medio', 2], ['delantero', 3]]) },
    {
      codigo: '4-2-3-1',
      nombre: 'Estándar moderno',
      lineas: l([['defensa', 4], ['medioContencion', 2], ['medioOfensivo', 3], ['delantero', 1]]),
    },
    {
      codigo: '4-1-4-1',
      nombre: 'Estabilidad con tapón',
      lineas: l([['defensa', 4], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 1]]),
    },
    { codigo: '4-4-1-1', nombre: 'Con mediapunta libre', lineas: l([['defensa', 4], ['medio', 4], ['delantero', 2]]) },
    {
      codigo: '4-3-1-2',
      nombre: 'Enganche sudamericano',
      lineas: l([['defensa', 4], ['medioContencion', 3], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-4-1-2 / 3-4-2-1',
      nombre: 'Variante del 3-5-2 con enganche',
      lineas: l([['defensa', 3], ['medioContencion', 4], ['medioOfensivo', 1], ['delantero', 2]]),
    },
    {
      codigo: '3-1-4-2',
      nombre: 'Mediocentro posicional',
      lineas: l([['defensa', 3], ['medioContencion', 1], ['medioOfensivo', 4], ['delantero', 2]]),
    },
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
