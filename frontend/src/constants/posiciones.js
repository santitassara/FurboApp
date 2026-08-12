export const POSICIONES = [
  { valor: 'arquero', etiqueta: 'Arquero' },
  { valor: 'defensor', etiqueta: 'Defensor' },
  { valor: 'mediocampista', etiqueta: 'Mediocampista' },
  { valor: 'delantero', etiqueta: 'Delantero' },
];

export function etiquetaPosicion(valor) {
  return POSICIONES.find((posicion) => posicion.valor === valor)?.etiqueta || 'Sin posición';
}
