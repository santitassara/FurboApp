import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './InfoGeneralGrupo.module.css';

export default function InfoGeneralGrupo({ grupoActivo, proximoPartido }) {
  const [cantidadMiembros, setCantidadMiembros] = useState(null);

  useEffect(() => {
    let cancelado = false;
    api
      .get(rutaGrupo(grupoActivo.id, '/miembros'))
      .then(({ data }) => {
        if (!cancelado) setCantidadMiembros(data.length);
      })
      .catch((err) => console.error('Error cargando miembros del grupo:', err.message));
    return () => {
      cancelado = true;
    };
  }, [grupoActivo.id]);

  const ocupados = proximoPartido?.ocupados || { titulares: 0, suplentes: 0 };
  const titularesOcupados = ocupados.titulares;
  const cupoTitulares = proximoPartido?.cupoTitulares || 0;

  return (
    <div className={styles.card}>
      <h3 className={styles.titulo}>
        <span aria-hidden="true">👥</span> {grupoActivo.nombre}
      </h3>
      <div className={styles.lista}>
        <p className={styles.fila}>
          <span>Miembros</span>
          <span className={styles.valorDestacado}>{cantidadMiembros ?? '—'}</span>
        </p>
        {proximoPartido ? (
          <p className={styles.fila}>
            <span>Próximo partido</span>
            <span className={styles.valorPasto}>
              {titularesOcupados}/{cupoTitulares} titulares
            </span>
          </p>
        ) : (
          <p className={styles.sinPartido}>No hay próximo partido programado.</p>
        )}
      </div>
    </div>
  );
}
