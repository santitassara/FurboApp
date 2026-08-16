import { FaFutbol } from 'react-icons/fa';
import { formatearFechaPartido } from '../utils/fecha';

function IconoEscudo({ variante }) {
  if (variante === 'B') {
    return (
      <svg viewBox="0 0 24 24" className="h-9 w-9">
        <path
          d="M12 2 4 5v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V5l-8-3Z"
          fill="#0d1f16"
          stroke="white"
          strokeWidth="1.4"
        />
        <path d="M12 2v18" stroke="white" strokeWidth="1" opacity="0.5" />
        <path d="M4.5 8h15M4 12h16M5 16h14" stroke="white" strokeWidth="1" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9">
      <path
        d="M12 2 4 5v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V5l-8-3Z"
        fill="white"
        fillOpacity="0.92"
        stroke="white"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function IconoTrofeo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-pasto-500">
      <path
        d="M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M7 5H4v1a4 4 0 0 0 3.4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 5h3v1a4 4 0 0 1-3.4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12v3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 19h6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 19c0-1.7 1-2.6 2.5-2.6s2.5.9 2.5 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconoTarjeta() {
  return <span className="h-4 w-3 shrink-0 rounded-[2px] bg-tarjeta shadow-sm" />;
}

function BarraRendimiento({ puntaje }) {
  return (
    <div className="flex shrink-0 gap-[3px]">
      {Array.from({ length: 10 }, (_, indice) => (
        <span
          key={indice}
          className={`h-3 w-1.5 rounded-[1px] ${indice < puntaje ? 'bg-pasto-500' : 'bg-white/10'}`}
        />
      ))}
    </div>
  );
}

function Panel({ titulo, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      {titulo && <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-pasto-500">{titulo}</h4>}
      {children}
    </div>
  );
}

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
      <div className="mb-4 text-center">
        <h3 className="text-lg font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</h3>
        <p className="mt-0.5 text-xs font-bold uppercase tracking-widest text-pasto-500">Resultado final</p>
      </div>

      <Panel className="mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col items-center gap-1">
            <IconoEscudo variante="A" />
            <span className="text-xs font-bold uppercase tracking-wide text-pasto-500">Equipo A</span>
          </div>
          <div className="flex items-center gap-3 font-display text-5xl font-bold leading-none text-white">
            <span>{marcador.A}</span>
            <span className="text-white/30">-</span>
            <span>{marcador.B}</span>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            <IconoEscudo variante="B" />
            <span className="text-xs font-bold uppercase tracking-wide text-pasto-500">Equipo B</span>
          </div>
        </div>

        {goles.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            {['A', 'B'].map((equipo) => {
              const golesDelEquipo = goles.filter((gol) => gol.equipo === equipo);
              return (
                <ul key={equipo} className="mx-auto flex w-fit flex-col gap-2.5">
                  {golesDelEquipo.map((gol, indice) => (
                    <li key={indice} className="flex items-start gap-2 text-sm">
                      <FaFutbol className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                      <p className="text-white/90">
                        <span className="font-bold text-white">{gol.minuto}&apos;</span>{' '}
                        <span className="font-bold text-white">{gol.nombre}</span>
                        {gol.asistenciaNombre && (
                          <span className="block text-xs text-white/50">asistencia de {gol.asistenciaNombre}</span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              );
            })}
          </div>
        )}
      </Panel>

      {jugadorDestacado && (
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5">
          <IconoTrofeo />
          <span className="text-sm text-white">
            MVP: <span className="font-bold text-pasto-500">{jugadorDestacado.nombre}</span>
          </span>
        </div>
      )}

      <Panel titulo="Rendimiento de jugadores" className="mb-4">
        {rendimientos.length === 0 ? (
          <p className="text-sm text-white/50">Sin cargar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rendimientos.map((rendimiento) => (
              <li key={rendimiento.usuarioId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-white/90">{rendimiento.nombre}</span>
                <span className="flex items-center gap-2">
                  <BarraRendimiento puntaje={rendimiento.puntaje} />
                  <span className="w-8 shrink-0 text-right text-xs font-bold text-white/60">
                    {rendimiento.puntaje}/10
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {sanciones.length > 0 && (
        <Panel titulo="Sanciones en cancha">
          <ul className="flex flex-col gap-2">
            {sanciones.map((sancion, indice) => (
              <li key={indice} className="flex items-center gap-2 text-sm">
                <IconoTarjeta />
                <span className="font-bold text-white">{sancion.nombre}</span>
                <span className="text-sancion">— {sancion.motivo}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
