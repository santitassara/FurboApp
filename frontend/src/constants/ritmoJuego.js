export const RITMO_JUEGO = [
  { valor: 'juego_seguido', etiqueta: 'Juego seguido' },
  { valor: 'juego_poco', etiqueta: 'Juego poco' },
  { valor: 'nunca_juego', etiqueta: 'Nunca juego' },
];

export function etiquetaRitmoJuego(valor) {
  return RITMO_JUEGO.find((r) => r.valor === valor)?.etiqueta || 'Sin dato';
}
