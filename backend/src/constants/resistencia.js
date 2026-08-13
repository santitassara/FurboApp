const RESISTENCIA = ['partido_completo', 'medio_partido', 'un_rato', 'no_corro'];

function esResistenciaValida(valor) {
  return valor === null || valor === undefined || RESISTENCIA.includes(valor);
}

module.exports = { RESISTENCIA, esResistenciaValida };
