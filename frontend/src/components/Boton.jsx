import clsx from 'clsx';
import styles from './Boton.module.css';

const VARIANTES = {
  primario: styles.primario,
  peligro: styles.peligro,
  ghost: styles.ghost,
};

export default function Boton({ variante = 'primario', className = '', children, ...props }) {
  return (
    <button
      className={clsx(styles.boton, VARIANTES[variante], className)}
      {...props}
    >
      {children}
    </button>
  );
}
