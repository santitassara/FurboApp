import { useEffect, useState } from 'react';
import Boton from './Boton';
import { formatearFechaPartido } from '../utils/fecha';
import styles from './ModalVotarValoraciones.module.css';

// Identidad de un jugador elegible: real o invitado, nunca ambos (ver backend
// claveJugador). Se usa como key/value para no colisionar cuando usuarioId es
// null en varias filas de invitados.
function clave(usuarioId, invitadoId) {
  if (!usuarioId && !invitadoId) return '';
  return usuarioId ? `u:${usuarioId}` : `i:${invitadoId}`;
}

function declave(valor) {
  if (!valor) return { usuarioId: null, invitadoId: null };
  if (valor.startsWith('u:')) return { usuarioId: valor.slice(2), invitadoId: null };
  return { usuarioId: null, invitadoId: valor.slice(2) };
}

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
  const [mvpClave, setMvpClave] = useState('');

  const faltanCalificar = elegibles.some((jugador) => {
    const puntaje = puntajes[clave(jugador.usuarioId, jugador.invitadoId)];
    return puntaje === '' || puntaje === null || puntaje === undefined;
  });

  useEffect(() => {
    if (!abierto) return;
    const previos = Object.fromEntries(
      (votosPropios.valoraciones || []).map((v) => [clave(v.usuarioId, v.invitadoId), v.puntaje])
    );
    setPuntajes(
      Object.fromEntries(
        elegibles.map((j) => {
          const c = clave(j.usuarioId, j.invitadoId);
          return [c, previos[c] ?? ''];
        })
      )
    );
    setMvpClave(clave(votosPropios.mvpUsuarioId, votosPropios.mvpInvitadoId));
  }, [abierto, elegibles, votosPropios]);

  if (!abierto) return null;

  function confirmar() {
    const mvp = declave(mvpClave);
    const payload = {
      valoraciones: Object.entries(puntajes)
        .filter(([, puntaje]) => puntaje !== '' && puntaje !== null && puntaje !== undefined)
        .map(([c, puntaje]) => ({
          ...declave(c),
          puntaje: Number(puntaje),
        })),
      mvpUsuarioId: mvp.usuarioId,
      mvpInvitadoId: mvp.invitadoId,
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
          {elegibles.map((jugador) => {
            const c = clave(jugador.usuarioId, jugador.invitadoId);
            return (
              <div key={c} className={styles.filaJugador}>
                <span className={styles.nombreJugador}>
                  {jugador.nombre} ({jugador.equipo})
                </span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="Sin calificar"
                  value={puntajes[c] ?? ''}
                  onChange={(e) => setPuntajes((anterior) => ({ ...anterior, [c]: e.target.value }))}
                  className={styles.inputPuntaje}
                />
              </div>
            );
          })}
        </section>

        <section className={styles.seccion}>
          <h3 className={styles.subtitulo}>Tu MVP del partido</h3>
          <select
            value={mvpClave}
            onChange={(e) => setMvpClave(e.target.value)}
            className={styles.selectMvp}
          >
            <option value="">Sin elegir</option>
            {elegibles.map((j) => (
              <option key={clave(j.usuarioId, j.invitadoId)} value={clave(j.usuarioId, j.invitadoId)}>
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
