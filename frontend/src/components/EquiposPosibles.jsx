import { useState } from 'react';
import api from '../services/api';
import Boton from './Boton';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './EquiposPosibles.module.css';

export default function EquiposPosibles({ grupoId, partidoId, datos, esAdmin, soyTitular, onActualizado, onVerEnCancha }) {
  const [procesando, setProcesando] = useState(null);
  const [expandidoId, setExpandidoId] = useState(null);
  const [error, setError] = useState('');

  if (!datos || datos.propuestas.length === 0) return null;

  const { votacionEquiposCerrada, propuestaGanadoraId, miVoto, propuestas } = datos;

  async function votar(propuestaId) {
    setError('');
    setProcesando(propuestaId);
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}/votar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function eliminar(propuestaId) {
    setError('');
    setProcesando(propuestaId);
    try {
      await api.delete(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function cerrarVotacion() {
    setError('');
    setProcesando('cerrar');
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/cerrar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function reiniciarVotacion() {
    setError('');
    setProcesando('reiniciar');
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/reiniciar`));
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.titulo}>Equipos posibles</h4>
        {esAdmin && !votacionEquiposCerrada && (
          <Boton variante="ghost" onClick={cerrarVotacion} disabled={procesando === 'cerrar'}>
            {procesando === 'cerrar' ? 'Cerrando…' : 'Cerrar votación'}
          </Boton>
        )}
        {esAdmin && votacionEquiposCerrada && (
          <Boton variante="ghost" onClick={reiniciarVotacion} disabled={procesando === 'reiniciar'}>
            {procesando === 'reiniciar' ? 'Reiniciando…' : 'Nueva votación'}
          </Boton>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.lista}>
        {propuestas.map((propuesta) => {
          const expandido = expandidoId === propuesta.id;
          const esGanadora = propuestaGanadoraId === propuesta.id;
          const esMiVoto = miVoto === propuesta.id;

          return (
            <div key={propuesta.id} className={styles.propuesta}>
              <button
                type="button"
                className={styles.propuestaHeader}
                onClick={() => setExpandidoId(expandido ? null : propuesta.id)}
              >
                <span className={styles.propuestaNombre}>
                  Equipos posibles {propuesta.numero}
                  {esGanadora && <span className={styles.badgeGanadora}>Ganadora</span>}
                  {esMiVoto && !esGanadora && <span className={styles.badgeMiVoto}>Tu voto</span>}
                </span>
                <span className={styles.votos}>
                  {propuesta.votos} voto{propuesta.votos === 1 ? '' : 's'}
                </span>
              </button>

              {expandido && (
                <div className={styles.detalle}>
                  <div className={styles.equiposGrid}>
                    <div>
                      <p className={styles.equipoLabel}>Equipo A</p>
                      {propuesta.equipoA.map((jugador) => (
                        <p key={jugador.usuarioId}>{jugador.nombre}</p>
                      ))}
                    </div>
                    <div>
                      <p className={styles.equipoLabel}>Equipo B</p>
                      {propuesta.equipoB.map((jugador) => (
                        <p key={jugador.usuarioId}>{jugador.nombre}</p>
                      ))}
                    </div>
                  </div>

                  <div className={styles.acciones}>
                    <Boton variante="ghost" onClick={() => onVerEnCancha(propuesta)}>
                      Ver en cancha
                    </Boton>
                    {soyTitular && !votacionEquiposCerrada && (
                      <Boton variante="primario" onClick={() => votar(propuesta.id)} disabled={procesando === propuesta.id}>
                        {esMiVoto ? 'Votaste esta' : procesando === propuesta.id ? 'Votando…' : 'Votar esta'}
                      </Boton>
                    )}
                    {esAdmin && !votacionEquiposCerrada && (
                      <Boton variante="peligro" onClick={() => eliminar(propuesta.id)} disabled={procesando === propuesta.id}>
                        Eliminar
                      </Boton>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
