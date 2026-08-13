const POSICIONES = ['arquero', 'defensor', 'mediocampista', 'delantero'];

function sonPosicionesValidas(principal, secundaria) {
  return (
    POSICIONES.includes(principal) &&
    POSICIONES.includes(secundaria) &&
    principal !== secundaria
  );
}

module.exports = { POSICIONES, sonPosicionesValidas };
