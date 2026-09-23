import { useEffect } from 'react';
import styles from './Toast.module.css';

export default function Toast({ mensaje, onClick, onCerrar }) {
  useEffect(() => {
    const temporizador = setTimeout(onCerrar, 6000);
    return () => clearTimeout(temporizador);
  }, [onCerrar]);

  return (
    <div className={styles.contenedor}>
      <button
        type="button"
        onClick={onClick}
        className={styles.boton}
      >
        {mensaje}
      </button>
    </div>
  );
}
