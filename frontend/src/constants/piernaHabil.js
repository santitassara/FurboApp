export const PIERNA_HABIL = [
  { valor: 'diestro', etiqueta: 'Diestro' },
  { valor: 'zurdo', etiqueta: 'Zurdo' },
];

export function etiquetaPiernaHabil(valor) {
  return PIERNA_HABIL.find((p) => p.valor === valor)?.etiqueta || 'Sin dato';
}
