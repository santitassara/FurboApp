import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function MvpUltimaFecha({ grupoId }) {
  const [mvp, setMvp] = useState(null);

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
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 text-lg font-bold text-white">MVP de la última fecha</h3>
      <div className="flex items-center gap-3">
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
    </div>
  );
}
