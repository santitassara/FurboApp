import { useEffect, useState } from 'react';
import Boton from './Boton';
import { formatearFechaPartido } from '../utils/fecha';

export default function ModalVotarValoraciones({
  abierto,
  partido,
  elegibles,
  votosPropios,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  const [puntajes, setPuntajes] = useState({});
  const [mvpId, setMvpId] = useState('');

  useEffect(() => {
    if (!abierto) return;
    const previos = Object.fromEntries((votosPropios.valoraciones || []).map((v) => [v.jugadorId, v.puntaje]));
    setPuntajes(Object.fromEntries(elegibles.map((j) => [j.usuarioId, previos[j.usuarioId] ?? ''])));
    setMvpId(votosPropios.mvpId || '');
  }, [abierto, elegibles, votosPropios]);

  if (!abierto) return null;

  function confirmar() {
    const payload = {
      valoraciones: Object.entries(puntajes)
        .filter(([, puntaje]) => puntaje !== '' && puntaje !== null && puntaje !== undefined)
        .map(([jugadorId, puntaje]) => ({
          jugadorId,
          puntaje: Number(puntaje),
        })),
      mvpId: mvpId || null,
    };
    onConfirmar(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-cancha-800 p-6">
        <h2 className="mb-4 text-lg font-bold capitalize text-white">
          Calificar jugadores — {formatearFechaPartido(partido.fecha)}
        </h2>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Puntaje (1-10)</h3>
          {elegibles.map((jugador) => (
            <div key={jugador.usuarioId} className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm text-white/90">
                {jugador.nombre} ({jugador.equipo})
              </span>
              <input
                type="number"
                min="1"
                max="10"
                placeholder="Sin calificar"
                value={puntajes[jugador.usuarioId] ?? ''}
                onChange={(e) => setPuntajes((anterior) => ({ ...anterior, [jugador.usuarioId]: e.target.value }))}
                className="w-28 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white placeholder:text-white/40"
              />
            </div>
          ))}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Tu MVP del partido</h3>
          <select
            value={mvpId}
            onChange={(e) => setMvpId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
          >
            <option value="">Sin elegir</option>
            {elegibles.map((j) => (
              <option key={j.usuarioId} value={j.usuarioId}>
                {j.nombre} ({j.equipo})
              </option>
            ))}
          </select>
        </section>

        {error && <p className="mb-4 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

        <div className="flex justify-end gap-3">
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={confirmar} disabled={procesando}>
            {procesando ? 'Guardando…' : 'Guardar mi voto'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
