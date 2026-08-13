import { Link } from 'react-router-dom';
import Boton from './Boton';
import { etiquetaPosicion } from '../constants/posiciones';

export default function ListaJugadores({ jugadores, onPromover, onSancionar, deshabilitado }) {
  const titulares = jugadores.filter((jugador) => jugador.tipo === 'titular');
  const suplentes = jugadores.filter((jugador) => jugador.tipo === 'suplente');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-pasto-500">Titulares</h4>
        {titulares.length === 0 ? (
          <p className="text-sm text-white/50">Todavía no hay titulares.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {titulares.map((jugador) => (
              <li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
                <span>
                  <Link to={`/jugadores/${jugador.usuarioId}`} className="hover:underline">
                    {jugador.nombre}
                  </Link>
                  <span className="ml-2 text-xs text-white/50">
                    {etiquetaPosicion(jugador.posicionPrincipal)}
                    {jugador.posicionSecundaria && ` / ${etiquetaPosicion(jugador.posicionSecundaria)}`}
                  </span>
                </span>
                {onSancionar && (
                  <Boton
                    variante="peligro"
                    className="px-3 py-1 text-xs"
                    onClick={() => onSancionar(jugador.usuarioId)}
                    disabled={deshabilitado}
                  >
                    Sancionar
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-albiceleste">Suplentes</h4>
        {suplentes.length === 0 ? (
          <p className="text-sm text-white/50">No hay suplentes anotados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {suplentes.map((jugador) => (
              <li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
                <span>
                  <Link to={`/jugadores/${jugador.usuarioId}`} className="hover:underline">
                    {jugador.nombre}
                  </Link>
                  <span className="ml-2 text-xs text-white/50">
                    {etiquetaPosicion(jugador.posicionPrincipal)}
                    {jugador.posicionSecundaria && ` / ${etiquetaPosicion(jugador.posicionSecundaria)}`}
                  </span>
                </span>
                {onPromover && (
                  <Boton
                    variante="ghost"
                    className="px-3 py-1 text-xs"
                    onClick={() => onPromover(jugador.usuarioId)}
                    disabled={deshabilitado}
                  >
                    Promover
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
