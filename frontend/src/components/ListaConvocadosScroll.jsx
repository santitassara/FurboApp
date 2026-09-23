import ListaJugadores from './ListaJugadores';
import styles from './ListaConvocadosScroll.module.css';

export default function ListaConvocadosScroll(props) {
  return (
    <div className={styles.contenedor}>
      <h3 className={styles.titulo}>
        <span aria-hidden="true">👥</span> Convocados
      </h3>
      <div className={styles.scroll}>
        <ListaJugadores {...props} />
      </div>
    </div>
  );
}
