import { useEffect, useState } from 'react';
import Boton from './Boton';
import { formatearFechaPartido } from '../utils/fecha';
import styles from './ModalVotarValoraciones.module.css';

export default function ModalVotarValoraciones({
  abierto,
  partido,
  elegibles,
  votosPropios,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  const [puntajes, setPuntajes] = useState({});
  const [mvpId, setMvpId] = useState('');

  const faltanCalificar = elegibles.some((jugador) => {
    const puntaje = puntajes[jugador.usuarioId];
    return puntaje === '' || puntaje === null || puntaje === undefined;
  });

  useEffect(() => {
    if (!abierto) return;
    const previos = Object.fromEntries((votosPropios.valoraciones || []).map((v) => [v.jugadorId, v.puntaje]));
    setPuntajes(Object.fromEntries(elegibles.map((j) => [j.usuarioId, previos[j.usuarioId] ?? ''])));
    setMvpId(votosPropios.mvpId || '');
  }, [abierto, elegibles, votosPropios]);

  if (!abierto) return null;

  function confirmar() {
    const payload = {
      valoraciones: Object.entries(puntajes)
        .filter(([, puntaje]) => puntaje !== '' && puntaje !== null && puntaje !== undefined)
        .map(([jugadorId, puntaje]) => ({
          jugadorId,
          puntaje: Number(puntaje),
        })),
      mvpId: mvpId || null,
    };
    onConfirmar(payload);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.titulo}>
          Calificar jugadores — {formatearFechaPartido(partido.fecha)}
        </h2>

        <section className={styles.seccion}>
          <h3 className={styles.subtitulo}>Puntaje (1-10)</h3>
          {elegibles.map((jugador) => (
            <div key={jugador.usuarioId} className={styles.filaJugador}>
              <span className={styles.nombreJugador}>
                {jugador.nombre} ({jugador.equipo})
              </span>
              <input
                type="number"
                min="1"
                max="10"
                placeholder="Sin calificar"
                value={puntajes[jugador.usuarioId] ?? ''}
                onChange={(e) => setPuntajes((anterior) => ({ ...anterior, [jugador.usuarioId]: e.target.value }))}
                className={styles.inputPuntaje}
              />
            </div>
          ))}
        </section>

        <section className={styles.seccion}>
          <h3 className={styles.subtitulo}>Tu MVP del partido</h3>
          <select
            value={mvpId}
            onChange={(e) => setMvpId(e.target.value)}
            className={styles.selectMvp}
          >
            <option value="">Sin elegir</option>
            {elegibles.map((j) => (
              <option key={j.usuarioId} value={j.usuarioId}>
                {j.nombre} ({j.equipo})
              </option>
            ))}
          </select>
        </section>

        {faltanCalificar && (
          <p className={styles.textoAyuda}>Tenés que calificar a todos los jugadores para guardar.</p>
        )}
        {error && <p className={styles.mensajeError}>{error}</p>}

        <div className={styles.acciones}>
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={confirmar} disabled={procesando || faltanCalificar}>
            {procesando ? 'Guardando…' : 'Guardar mi voto'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
