import { createContext, useContext, useState } from 'react';

// Estado compartido entre el mapa de cancha (circulos de jugadores) y el
// listado de jugadores anotados al partido. Permite:
// 1. Mostrar un tooltip con el nombre del jugador al hacer hover sobre su
//    circulo en la cancha (renderizado fuera del contenedor .cancha que tiene
//    overflow-hidden para que no se recorte).
// 2. Resaltar en el listado al jugador sobre el que se hace hover / click / tap.
const JugadorDestacadoContext = createContext(null);

export function JugadorDestacadoProvider({ children }) {
  const [jugadorDestacadoId, setJugadorDestacadoId] = useState(null);
  const [jugadorTooltip, setJugadorTooltip] = useState(null); // { id, nombre, x, y }

  const mostrarJugadorTooltip = (id, nombre, x, y) => {
    setJugadorDestacado(id);
    setJugadorTooltip({ id, nombre, x, y });
  };

  const actualizarJugadorTooltip = (x, y) => {
    setJugadorTooltip((anterior) => (anterior ? { ...anterior, x, y } : null));
  };

  const ocultarJugadorTooltip = () => {
    setJugadorDestacado(null);
    setJugadorTooltip(null);
  };

  return (
    <JugadorDestacadoContext.Provider value={{
      jugadorDestacadoId,
      setJugadorDestacado: setJugadorDestacadoId,
      jugadorTooltip,
      mostrarJugadorTooltip,
      actualizarJugadorTooltip,
      ocultarJugadorTooltip,
    }}>
      {children}
    </JugadorDestacadoContext.Provider>
  );
}

export function useJugadorDestacado() {
  const ctx = useContext(JugadorDestacadoContext);
  if (ctx === null) {
    return {
      jugadorDestacadoId: null,
      setJugadorDestacado: () => {},
      jugadorTooltip: null,
      mostrarJugadorTooltip: () => {},
      actualizarJugadorTooltip: () => {},
      ocultarJugadorTooltip: () => {},
    };
  }
  return ctx;
}

export default JugadorDestacadoProvider;
