import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function MvpUltimaFecha({ grupoId }) {
  const [mvp, setMvp] = useState(null);
  const [votacionCerrada, setVotacionCerrada] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const { data: historial } = await api.get(rutaGrupo(grupoId, '/partidos/historial'));
        const ultimo = historial[0];
        if (!ultimo) return;

        const { data: resultado } = await api.get(rutaGrupo(grupoId, `/partidos/${ultimo.id}/resultado`));
        if (!resultado?.jugadorDestacado?.jugadores?.length) return;

        const destacado = resultado.jugadorDestacado.jugadores[0];
        const goles = resultado.goles.filter((g) => g.usuarioId === destacado.usuarioId && !g.enContra).length;
        const asistencias = resultado.goles.filter((g) => g.asistenciaUsuarioId === destacado.usuarioId).length;
        const rendimiento = resultado.rendimientos.find((r) => r.usuarioId === destacado.usuarioId);
        const porcentajeVotos =
          resultado.jugadorDestacado.totalElegibles > 0
            ? Math.round((resultado.jugadorDestacado.votos / resultado.jugadorDestacado.totalElegibles) * 100)
            : 0;

        if (!cancelado) {
          setVotacionCerrada(Boolean(resultado.votacionCerrada));
          setMvp({
            nombre: destacado.nombre,
            goles,
            asistencias,
            valoracion: rendimiento?.promedio ?? null,
            porcentajeVotos,
          });
        }
      } catch (err) {
        console.error('Error cargando MVP de la última fecha:', err.message);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [grupoId]);

  if (!mvp) return null;

  return (
    <div className="relative rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
        <span aria-hidden="true">🏆</span> MVP de la última fecha
      </h3>
      <div className={`flex items-center gap-3 ${votacionCerrada ? '' : 'pointer-events-none blur-sm'}`}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cancha-700 text-lg font-bold text-white">
          {mvp.nombre?.trim()?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{mvp.nombre}</p>
          <p className="text-sm text-white/60">
            {mvp.goles} Goles • {mvp.asistencias} Asistencias
            {mvp.valoracion !== null && ` • Calificación ${mvp.valoracion}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-pasto-600/20 px-3 py-1 text-xs font-bold text-pasto-500">
          {mvp.porcentajeVotos}% votos
        </span>
      </div>
      {!votacionCerrada && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-cancha-900/60">
          <p className="rounded-lg bg-black/70 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">
            Disponible cuando cierre la votación
          </p>
        </div>
      )}
    </div>
  );
}
