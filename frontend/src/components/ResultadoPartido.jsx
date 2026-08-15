import { formatearFechaPartido } from '../utils/fecha';

export default function ResultadoPartido({ partido, resultado }) {
  if (!resultado) {
    return (
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        Cargando resultado…
      </div>
    );
  }

  const { marcador, goles, rendimientos, sanciones, jugadorDestacado } = resultado;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-1 text-lg font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</h3>
      <p className="mb-4 text-xs uppercase tracking-wide text-pasto-500">Resultado final</p>

      <div className="mb-5 flex items-center justify-center gap-4 text-4xl font-display font-bold text-white">
        <span>{marcador.A}</span>
        <span className="text-white/40">-</span>
        <span>{marcador.B}</span>
      </div>

      {jugadorDestacado && (
        <p className="mb-4 text-center text-sm">
          <span className="text-white/60">Destacado: </span>
          <span className="font-bold text-pasto-500">{jugadorDestacado.nombre}</span>
        </p>
      )}

      <div className="mb-4">
        <h4 className="mb-2 text-xs font-bold uppercase text-white/40">Goles</h4>
        {goles.length === 0 ? (
          <p className="text-sm text-white/50">Sin goles.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {goles.map((gol, indice) => (
              <li key={indice} className="text-sm text-white/90">
                <span className="font-bold text-white/60">{gol.minuto}&apos;</span>{' '}
                {gol.nombre} <span className="text-white/40">(Equipo {gol.equipo})</span>
                {gol.asistenciaNombre && <span className="text-white/50"> — asistencia de {gol.asistenciaNombre}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4">
        <h4 className="mb-2 text-xs font-bold uppercase text-white/40">Rendimiento</h4>
        {rendimientos.length === 0 ? (
          <p className="text-sm text-white/50">Sin cargar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rendimientos.map((rendimiento) => (
              <li key={rendimiento.usuarioId} className="flex justify-between text-sm text-white/90">
                <span>{rendimiento.nombre}</span>
                <span className="font-bold">{rendimiento.puntaje}/10</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sanciones.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase text-white/40">Sanciones en cancha</h4>
          <ul className="flex flex-col gap-1">
            {sanciones.map((sancion, indice) => (
              <li key={indice} className="text-sm text-sancion">
                {sancion.nombre} — {sancion.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
