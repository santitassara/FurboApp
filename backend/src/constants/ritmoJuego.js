const RITMO_JUEGO = ['juego_seguido', 'juego_poco', 'nunca_juego'];

function esRitmoJuegoValido(valor) {
  return valor === null || valor === undefined || RITMO_JUEGO.includes(valor);
}

module.exports = { RITMO_JUEGO, esRitmoJuegoValido };
