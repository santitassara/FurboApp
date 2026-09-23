import { useEffect, useState } from 'react';
import clsx from 'clsx';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './MvpUltimaFecha.module.css';

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
    <div className={styles.card}>
      <h3 className={styles.titulo}>
        <span aria-hidden="true">🏆</span> MVP de la última fecha
      </h3>
      <div className={clsx(styles.contenido, !votacionCerrada && styles.bloqueado)}>
        <div className={styles.avatar}>
          {mvp.nombre?.trim()?.[0]?.toUpperCase() || '?'}
        </div>
        <div className={styles.infoWrapper}>
          <p className={styles.nombre}>{mvp.nombre}</p>
          <p className={styles.detalle}>
            {mvp.goles} Goles • {mvp.asistencias} Asistencias
            {mvp.valoracion !== null && ` • Calificación ${mvp.valoracion}`}
          </p>
        </div>
        <span className={styles.badgeVotos}>
          {mvp.porcentajeVotos}% votos
        </span>
      </div>
      {!votacionCerrada && (
        <div className={styles.overlay}>
          <p className={styles.overlayTexto}>
            Disponible cuando cierre la votación
          </p>
        </div>
      )}
    </div>
  );
}
