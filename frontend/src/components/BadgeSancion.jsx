import styles from './BadgeSancion.module.css';

export default function BadgeSancion({ sancionado }) {
  if (!sancionado) return null;

  return (
    <span className={styles.badge}>
      Sancionado
    </span>
  );
}
