import { useState } from 'react';
import api from '../services/api';
import Boton from './Boton';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function EquiposPosibles({ grupoId, partidoId, datos, esAdmin, soyTitular, onActualizado, onVerEnCancha }) {
  const [procesando, setProcesando] = useState(null);
  const [expandidoId, setExpandidoId] = useState(null);
  const [error, setError] = useState('');

  if (!datos || datos.propuestas.length === 0) return null;

  const { votacionEquiposCerrada, propuestaGanadoraId, miVoto, propuestas } = datos;

  async function votar(propuestaId) {
    setError('');
    setProcesando(propuestaId);
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}/votar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function eliminar(propuestaId) {
    setError('');
    setProcesando(propuestaId);
    try {
      await api.delete(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function cerrarVotacion() {
    setError('');
    setProcesando('cerrar');
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/cerrar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-pasto-500">Equipos posibles</h4>
        {esAdmin && !votacionEquiposCerrada && (
          <Boton variante="ghost" onClick={cerrarVotacion} disabled={procesando === 'cerrar'}>
            {procesando === 'cerrar' ? 'Cerrando…' : 'Cerrar votación'}
          </Boton>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      <div className="flex flex-col gap-2">
        {propuestas.map((propuesta) => {
          const expandido = expandidoId === propuesta.id;
          const esGanadora = propuestaGanadoraId === propuesta.id;
          const esMiVoto = miVoto === propuesta.id;

          return (
            <div key={propuesta.id} className="rounded-lg border border-white/10 bg-cancha-700">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-white"
                onClick={() => setExpandidoId(expandido ? null : propuesta.id)}
              >
                <span className="font-semibold">
                  Equipos posibles {propuesta.numero}
                  {esGanadora && <span className="ml-2 rounded bg-pasto-600 px-2 py-0.5 text-xs">Ganadora</span>}
                  {esMiVoto && !esGanadora && <span className="ml-2 text-xs text-pasto-500">Tu voto</span>}
                </span>
                <span className="text-white/60">
                  {propuesta.votos} voto{propuesta.votos === 1 ? '' : 's'}
                </span>
              </button>

              {expandido && (
                <div className="border-t border-white/10 px-4 py-3 text-sm text-white/80">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs uppercase text-white/40">Equipo A</p>
                      {propuesta.equipoA.map((jugador) => (
                        <p key={jugador.usuarioId}>{jugador.nombre}</p>
                      ))}
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase text-white/40">Equipo B</p>
                      {propuesta.equipoB.map((jugador) => (
                        <p key={jugador.usuarioId}>{jugador.nombre}</p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Boton variante="ghost" onClick={() => onVerEnCancha(propuesta)}>
                      Ver en cancha
                    </Boton>
                    {soyTitular && !votacionEquiposCerrada && (
                      <Boton variante="primario" onClick={() => votar(propuesta.id)} disabled={procesando === propuesta.id}>
                        {esMiVoto ? 'Votaste esta' : procesando === propuesta.id ? 'Votando…' : 'Votar esta'}
                      </Boton>
                    )}
                    {esAdmin && !votacionEquiposCerrada && (
                      <Boton variante="peligro" onClick={() => eliminar(propuesta.id)} disabled={procesando === propuesta.id}>
                        Eliminar
                      </Boton>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
