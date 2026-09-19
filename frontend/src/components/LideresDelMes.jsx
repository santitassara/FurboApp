import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function LideresDelMes({ grupoId }) {
  const [lideres, setLideres] = useState(null);

  useEffect(() => {
    let cancelado = false;
    api
      .get(rutaGrupo(grupoId, '/partidos/lideres-mes'))
      .then(({ data }) => {
        if (!cancelado) setLideres(data);
      })
      .catch((err) => console.error('Error cargando líderes del mes:', err.message));
    return () => {
      cancelado = true;
    };
  }, [grupoId]);

  if (!lideres || (lideres.goleadores.length === 0 && !lideres.asistidor)) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
        <span aria-hidden="true">📊</span> Líderes históricos
      </h3>
      {lideres.goleadores.length > 0 && (
        <ol className="mb-3 flex flex-col gap-1">
          {lideres.goleadores.map((jugador, indice) => (
            <li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/80">
              <span>{indice + 1}. {jugador.nombre}</span>
              <span className="font-bold text-pasto-500">{jugador.goles} Goles</span>
            </li>
          ))}
        </ol>
      )}
      {lideres.asistidor && (
        <p className="flex items-center justify-between text-sm text-albiceleste">
          <span>★ {lideres.asistidor.nombre}</span>
          <span className="font-bold">{lideres.asistidor.asistencias} Asistencias</span>
        </p>
      )}
    </div>
  );
}
