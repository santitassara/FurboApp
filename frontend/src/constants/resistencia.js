export const RESISTENCIA = [
  { valor: 'partido_completo', etiqueta: 'Todo el partido' },
  { valor: 'medio_partido', etiqueta: 'Medio partido' },
  { valor: 'un_rato', etiqueta: 'Un rato y me canso' },
  { valor: 'no_corro', etiqueta: 'No sé si puedo correr siquiera' },
];

export function etiquetaResistencia(valor) {
  return RESISTENCIA.find((r) => r.valor === valor)?.etiqueta || 'Sin dato';
}
