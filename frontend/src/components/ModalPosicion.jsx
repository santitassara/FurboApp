import { useEffect, useState } from 'react';
import Boton from './Boton';
import { POSICIONES } from '../constants/posiciones';
import styles from './ModalPosicion.module.css';

export default function ModalPosicion({
  abierto,
  procesando,
  permitirCancelar,
  posicionPrincipalInicial,
  posicionSecundariaInicial,
  error,
  onConfirmar,
  onCancelar,
}) {
  const [posicionPrincipal, setPosicionPrincipal] = useState(posicionPrincipalInicial || '');
  const [posicionSecundaria, setPosicionSecundaria] = useState(posicionSecundariaInicial || '');

  useEffect(() => {
    if (abierto) {
      setPosicionPrincipal(posicionPrincipalInicial || '');
      setPosicionSecundaria(posicionSecundariaInicial || '');
    }
  }, [abierto, posicionPrincipalInicial, posicionSecundariaInicial]);

  if (!abierto) return null;

  const posicionesIguales = posicionPrincipal && posicionSecundaria && posicionPrincipal === posicionSecundaria;
  const puedeConfirmar = posicionPrincipal && posicionSecundaria && !posicionesIguales && !procesando;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.titulo}>¿En qué posición jugás?</h2>
        <p className={styles.descripcion}>
          Elegí tu posición principal y una secundaria, por si en algún momento hace falta rotar.
        </p>

        <div className={styles.campoPrincipal}>
          <label className={styles.etiquetaCampo}>Posición principal</label>
          <select
            value={posicionPrincipal}
            onChange={(evento) => setPosicionPrincipal(evento.target.value)}
            className={styles.select}
          >
            <option value="" disabled className={styles.opcion}>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor} className={styles.opcion}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.campoSecundario}>
          <label className={styles.etiquetaCampo}>Posición secundaria</label>
          <select
            value={posicionSecundaria}
            onChange={(evento) => setPosicionSecundaria(evento.target.value)}
            className={styles.select}
          >
            <option value="" disabled className={styles.opcion}>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor} className={styles.opcion}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {posicionesIguales && (
          <p className={styles.mensajeError}>La secundaria tiene que ser distinta de la principal.</p>
        )}

        {error && <p className={styles.mensajeError}>{error}</p>}

        <div className={styles.acciones}>
          {permitirCancelar && (
            <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
              Cancelar
            </Boton>
          )}
          <Boton
            variante="primario"
            onClick={() => onConfirmar(posicionPrincipal, posicionSecundaria)}
            disabled={!puedeConfirmar}
          >
            {procesando ? 'Guardando…' : 'Confirmar'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
