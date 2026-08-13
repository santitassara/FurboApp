const LINEAS = ['arquero', 'defensa', 'medio', 'delantero'];

function generarLineas(cantidadJugadores) {
  if (cantidadJugadores <= 0) return { arquero: 0, defensa: 0, medio: 0, delantero: 0 };
  if (cantidadJugadores === 1) return { arquero: 1, defensa: 0, medio: 0, delantero: 0 };

  const resto = cantidadJugadores - 1;
  const base = Math.floor(resto / 3);
  const extra = resto % 3;
  const lineas = { arquero: 1, defensa: base, medio: base, delantero: base };

  const ordenReparto = ['medio', 'defensa', 'delantero'];
  for (let i = 0; i < extra; i++) lineas[ordenReparto[i]]++;

  return lineas;
}

function splitEquipos(cupoTitulares) {
  return {
    A: Math.ceil(cupoTitulares / 2),
    B: Math.floor(cupoTitulares / 2),
  };
}

module.exports = { LINEAS, generarLineas, splitEquipos };
