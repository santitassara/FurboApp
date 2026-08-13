import { LINEAS } from '../utils/formacion';

const ETIQUETAS_LINEA = {
  arquero: 'Arquero',
  defensa: 'Defensa',
  medio: 'Medio',
  delantero: 'Delantero',
};

function jugadorEnSlot(jugadores, equipo, linea, ordenLinea) {
  return jugadores.find((j) => j.equipo === equipo && j.linea === linea && j.ordenLinea === ordenLinea) || null;
}

function MitadCancha({ equipo, lineasEsperadas, jugadores }) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg bg-pasto-600/10 p-3">
      <h5 className="text-center text-xs font-bold uppercase tracking-wide text-white/70">Equipo {equipo}</h5>
      {LINEAS.map((linea) => {
        const cantidad = lineasEsperadas[linea];
        if (cantidad === 0) return null;
        return (
          <div key={linea} className="flex flex-col gap-1">
            <p className="text-[10px] uppercase text-white/40">{ETIQUETAS_LINEA[linea]}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: cantidad }, (_, ordenLinea) => {
                const jugador = jugadorEnSlot(jugadores, equipo, linea, ordenLinea);
                return (
                  <div
                    key={ordenLinea}
                    className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-cancha-700 p-1 text-center text-[11px] text-white/90"
                  >
                    {jugador ? jugador.nombre : '—'}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MapaCancha({ formacion }) {
  if (!formacion || !formacion.habilitado) {
    return (
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-pasto-500">Formación</h4>
      <div className="flex gap-3">
        <MitadCancha equipo="A" lineasEsperadas={formacion.lineasEsperadas.A} jugadores={formacion.jugadores} />
        <MitadCancha equipo="B" lineasEsperadas={formacion.lineasEsperadas.B} jugadores={formacion.jugadores} />
      </div>
    </div>
  );
}
