const K_RATING = 5;

const PESOS_POSICION = {
  delantero: {
    velocidad: 0.225,
    gambeta: 0.25,
    pegada: 0.275,
    marcaDefensa: 0.05,
    tocaPase: 0.125,
    fisico: 0.075,
  },
  mediocampista: {
    velocidad: 0.1,
    gambeta: 0.15,
    pegada: 0.1,
    marcaDefensa: 0.15,
    tocaPase: 0.35,
    fisico: 0.15,
  },
  defensor: {
    velocidad: 0.175,
    gambeta: 0.075,
    pegada: 0.05,
    marcaDefensa: 0.375,
    tocaPase: 0.125,
    fisico: 0.2,
  },
  arquero: {
    velocidad: 0.1,
    gambeta: 0,
    pegada: 0,
    marcaDefensa: 0.5,
    tocaPase: 0.15,
    fisico: 0.25,
  },
};

module.exports = { K_RATING, PESOS_POSICION };
