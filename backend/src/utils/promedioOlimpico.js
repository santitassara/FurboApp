// Sistema olímpico: descarta el voto más alto y el más bajo antes de promediar,
// para que un solo votante (mal intencionado o distraído) no distorsione la nota.
// Con 1 o 2 votos no hay margen para descartar extremos sin quedarse sin datos,
// así que en esos casos se promedia todo tal cual.
function calcularPromedioOlimpico(numeros) {
  if (numeros.length <= 2) {
    return numeros.reduce((suma, n) => suma + n, 0) / numeros.length;
  }
  const ordenados = [...numeros].sort((a, b) => a - b);
  const recortados = ordenados.slice(1, -1);
  return recortados.reduce((suma, n) => suma + n, 0) / recortados.length;
}

module.exports = { calcularPromedioOlimpico };
