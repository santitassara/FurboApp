import styles from './PartidoConEstado.module.css';

export default function PartidoConEstado({ partido, children }) {
  if (partido.estado === 'jugado') {
    return null;
  }

  if (partido.estado === 'cerrado') {
    return (
      <div className={styles.contenedor}>
        <div className={styles.contenidoBloqueado}>{children}</div>
        <div className={styles.overlay}>
          <p className={styles.mensaje}>
            Esperando resultados
          </p>
        </div>
      </div>
    );
  }

  return children;
}
