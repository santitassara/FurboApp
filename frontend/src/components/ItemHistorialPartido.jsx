import { useState } from 'react';
import api from '../services/api';
import { formatearFechaPartido } from '../utils/fecha';
import ResultadoPartido from './ResultadoPartido';

export default function ItemHistorialPartido({ partido }) {
  const [expandido, setExpandido] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cantidadJugadores = (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0);

  async function alternar() {
    const nuevoExpandido = !expandido;
    setExpandido(nuevoExpandido);
    if (nuevoExpandido && !resultado) {
      setCargando(true);
      setError('');
      try {
        const { data } = await api.get(`/partidos/${partido.id}/resultado`);
        setResultado(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 shadow-lg">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</p>
          <p className="text-xs text-white/50">{cantidadJugadores} jugadores</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${expandido ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expandido && (
        <div className="border-t border-white/10 p-4">
          {cargando ? (
            <p className="text-sm text-white/50">Cargando resultado…</p>
          ) : error ? (
            <p className="text-sm text-sancion">{error}</p>
          ) : (
            <ResultadoPartido partido={partido} resultado={resultado} />
          )}
        </div>
      )}
    </div>
  );
}
