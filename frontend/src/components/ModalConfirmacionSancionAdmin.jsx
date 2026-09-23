import Boton from './Boton';
import styles from './ModalConfirmacionSancionAdmin.module.css';

export default function ModalConfirmacionSancionAdmin({ abierto, nombre, procesando, error, onConfirmar, onCancelar }) {
  if (!abierto) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.titulo}>¿Seguro que querés sancionar a {nombre}?</h2>
        <p className={styles.texto}>
          Va a quedar dado de baja de este partido y sancionado: no va a poder anotarse al próximo partido hasta que
          lo perdones.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.acciones}>
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Sí, sancionar'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
