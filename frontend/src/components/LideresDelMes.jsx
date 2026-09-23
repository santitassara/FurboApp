import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './LideresDelMes.module.css';

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
    <div className={styles.card}>
      <h3 className={styles.titulo}>
        <span aria-hidden="true">📊</span> Líderes históricos
      </h3>
      {lideres.goleadores.length > 0 && (
        <ol className={styles.listaGoleadores}>
          {lideres.goleadores.map((jugador, indice) => (
            <li key={jugador.usuarioId} className={styles.itemGoleador}>
              <span>{indice + 1}. {jugador.nombre}</span>
              <span className={styles.valorGoles}>{jugador.goles} Goles</span>
            </li>
          ))}
        </ol>
      )}
      {lideres.asistidor && (
        <p className={styles.filaAsistidor}>
          <span>★ {lideres.asistidor.nombre}</span>
          <span className={styles.valorAsistencias}>{lideres.asistidor.asistencias} Asistencias</span>
        </p>
      )}
    </div>
  );
}
