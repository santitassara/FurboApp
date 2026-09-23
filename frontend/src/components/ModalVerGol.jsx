import { useEffect, useRef, useState } from 'react';
import Boton from './Boton';
import styles from './ModalVerGol.module.css';

const DURACION_JUGADA_MS = 60 * 1000;

function construirUrlConTiempo(beelupUrl, minuto) {
  const segundos = minuto * 60;
  const url = new URL(beelupUrl);
  url.searchParams.set('t', segundos);
  return url.toString();
}

export default function ModalVerGol({ abierto, beelupUrl, gol, onCerrar }) {
  const [finalizado, setFinalizado] = useState(false);
  const [src, setSrc] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;

    setFinalizado(false);
    setSrc(construirUrlConTiempo(beelupUrl, gol.minuto));
    timeoutRef.current = setTimeout(() => setFinalizado(true), DURACION_JUGADA_MS);

    return () => clearTimeout(timeoutRef.current);
  }, [abierto, beelupUrl, gol]);

  if (!abierto) return null;

  function verDeNuevo() {
    setFinalizado(false);
    setSrc(construirUrlConTiempo(beelupUrl, gol.minuto));
    timeoutRef.current = setTimeout(() => setFinalizado(true), DURACION_JUGADA_MS);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.headerFila}>
          <h2 className={styles.titulo}>
            Gol de {gol.nombre} — {gol.minuto}&apos;
          </h2>
          <button type="button" onClick={onCerrar} className={styles.botonCerrar}>
            ✕ Cerrar
          </button>
        </div>

        <div className={styles.videoWrapper}>
          {finalizado ? (
            <div className={styles.finalizadoWrapper}>
              <p className={styles.textoFinalizado}>Jugada finalizada</p>
              <Boton variante="primario" onClick={verDeNuevo}>
                Ver de nuevo
              </Boton>
            </div>
          ) : (
            <iframe
              key={src}
              src={src}
              title={`Gol de ${gol.nombre}`}
              className={styles.iframe}
              frameBorder="0"
              allowFullScreen
            />
          )}
        </div>
      </div>
    </div>
  );
}
