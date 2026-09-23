import clsx from 'clsx';
import styles from './BarraCupos.module.css';

export default function BarraCupos({ etiqueta, ocupados, cupo }) {
  const porcentaje = cupo > 0 ? Math.min(100, Math.round((ocupados / cupo) * 100)) : 0;
  const lleno = ocupados >= cupo;

  return (
    <div className={styles.contenedor}>
      <div className={styles.encabezado}>
        <span>{etiqueta}</span>
        <span>{ocupados}/{cupo}</span>
      </div>
      <div className={styles.track}>
        <div
          className={clsx(styles.barra, lleno ? styles.lleno : styles.disponible)}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
