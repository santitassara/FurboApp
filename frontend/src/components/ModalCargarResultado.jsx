import { useEffect, useState } from 'react';
import Boton from './Boton';
import { formatearFechaPartido } from '../utils/fecha';

function golVacio() {
  return { usuarioId: '', equipo: 'A', minuto: '', asistenciaUsuarioId: '' };
}

function sancionVacia() {
  return { usuarioId: '', motivo: '' };
}

export default function ModalCargarResultado({
  abierto,
  partido,
  elegibles,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  const [goles, setGoles] = useState([]);
  const [rendimientos, setRendimientos] = useState({});
  const [sanciones, setSanciones] = useState([]);
  const [jugadorDestacadoId, setJugadorDestacadoId] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setGoles([]);
    setSanciones([]);
    setJugadorDestacadoId('');
    setRendimientos(Object.fromEntries(elegibles.map((jugador) => [jugador.usuarioId, 5])));
  }, [abierto, elegibles]);

  if (!abierto) return null;

  function actualizarGol(indice, campo, valor) {
    setGoles((anterior) => anterior.map((gol, i) => (i === indice ? { ...gol, [campo]: valor } : gol)));
  }

  function actualizarSancion(indice, campo, valor) {
    setSanciones((anterior) => anterior.map((sancion, i) => (i === indice ? { ...sancion, [campo]: valor } : sancion)));
  }

  function confirmar() {
    const payload = {
      goles: goles
        .filter((gol) => gol.usuarioId && gol.minuto !== '')
        .map((gol) => ({
          usuarioId: gol.usuarioId,
          equipo: gol.equipo,
          minuto: Number(gol.minuto),
          asistenciaUsuarioId: gol.asistenciaUsuarioId || null,
        })),
      rendimientos: Object.entries(rendimientos).map(([usuarioId, puntaje]) => ({
        usuarioId,
        puntaje: Number(puntaje),
      })),
      sanciones: sanciones.filter((sancion) => sancion.usuarioId && sancion.motivo.trim()),
      jugadorDestacadoId: jugadorDestacadoId || null,
    };
    onConfirmar(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-cancha-800 p-6">
        <h2 className="mb-4 text-lg font-bold capitalize text-white">
          Cargar resultado — {formatearFechaPartido(partido.fecha)}
        </h2>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase text-white/70">Goles</h3>
            <Boton variante="ghost" className="px-3 py-1 text-xs" onClick={() => setGoles((a) => [...a, golVacio()])}>
              + Agregar gol
            </Boton>
          </div>
          {goles.map((gol, indice) => (
            <div key={indice} className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={gol.usuarioId}
                onChange={(e) => actualizarGol(indice, 'usuarioId', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={j.usuarioId} value={j.usuarioId}>
                    {j.nombre} ({j.equipo})
                  </option>
                ))}
              </select>
              <select
                value={gol.equipo}
                onChange={(e) => actualizarGol(indice, 'equipo', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="A">Equipo A</option>
                <option value="B">Equipo B</option>
              </select>
              <input
                type="number"
                min="0"
                placeholder="Minuto"
                value={gol.minuto}
                onChange={(e) => actualizarGol(indice, 'minuto', e.target.value)}
                className="w-20 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
              <select
                value={gol.asistenciaUsuarioId}
                onChange={(e) => actualizarGol(indice, 'asistenciaUsuarioId', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Sin asistencia</option>
                {elegibles
                  .filter((j) => j.usuarioId !== gol.usuarioId)
                  .map((j) => (
                    <option key={j.usuarioId} value={j.usuarioId}>
                      {j.nombre}
                    </option>
                  ))}
              </select>
              <Boton
                variante="ghost"
                className="px-2 py-1 text-xs text-sancion"
                onClick={() => setGoles((a) => a.filter((_, i) => i !== indice))}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Rendimiento (1-10)</h3>
          {elegibles.map((jugador) => (
            <div key={jugador.usuarioId} className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm text-white/90">
                {jugador.nombre} ({jugador.equipo})
              </span>
              <input
                type="number"
                min="1"
                max="10"
                value={rendimientos[jugador.usuarioId] ?? 5}
                onChange={(e) =>
                  setRendimientos((anterior) => ({ ...anterior, [jugador.usuarioId]: e.target.value }))
                }
                className="w-16 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
            </div>
          ))}
        </section>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase text-white/70">Sanciones en cancha</h3>
            <Boton
              variante="ghost"
              className="px-3 py-1 text-xs"
              onClick={() => setSanciones((a) => [...a, sancionVacia()])}
            >
              + Agregar sanción
            </Boton>
          </div>
          {sanciones.map((sancion, indice) => (
            <div key={indice} className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={sancion.usuarioId}
                onChange={(e) => actualizarSancion(indice, 'usuarioId', e.target.value)}
                className="rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={j.usuarioId} value={j.usuarioId}>
                    {j.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Motivo (ej: Tarjeta roja)"
                value={sancion.motivo}
                onChange={(e) => actualizarSancion(indice, 'motivo', e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
              />
              <Boton
                variante="ghost"
                className="px-2 py-1 text-xs text-sancion"
                onClick={() => setSanciones((a) => a.filter((_, i) => i !== indice))}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase text-white/70">Jugador destacado</h3>
          <select
            value={jugadorDestacadoId}
            onChange={(e) => setJugadorDestacadoId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-cancha-900 px-2 py-1 text-sm text-white"
          >
            <option value="">Sin destacado</option>
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
            {procesando ? 'Guardando…' : 'Guardar resultado'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
