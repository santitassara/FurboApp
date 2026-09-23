import Boton from './Boton';
import styles from './ModalConfirmacionSancion.module.css';

export default function ModalConfirmacionSancion({ abierto, procesando, onConfirmar, onCancelar }) {
  if (!abierto) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.titulo}>¿Seguro que te querés bajar?</h2>
        <p className={styles.texto}>
          Sos titular en este partido. Si te das de baja ahora vas a quedar sancionado y no vas a poder anotarte
          al próximo partido hasta que un admin te perdone.
        </p>
        <div className={styles.acciones}>
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Sí, darme de baja'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
