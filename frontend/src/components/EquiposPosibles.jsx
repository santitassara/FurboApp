import { useState } from 'react';
import api from '../services/api';
import Boton from './Boton';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './EquiposPosibles.module.css';

export default function EquiposPosibles({ grupoId, partidoId, datos, esAdmin, soyTitular, soyAnotado, onActualizado, onVerEnCancha }) {
  const [procesando, setProcesando] = useState(null);
  const [expandidoId, setExpandidoId] = useState(null);
  const [error, setError] = useState('');
  const [proponiendoEn, setProponiendoEn] = useState(null);
  const [seleccion, setSeleccion] = useState({ a: '', b: '' });

  if (!datos || datos.propuestas.length === 0) return null;

  const { votacionEquiposCerrada, propuestaGanadoraId, opcionGanadoraId, miVoto, miVotoOpcionId, propuestas } = datos;

  async function votar(propuestaId, opcionId = null) {
    setError('');
    setProcesando(opcionId || propuestaId);
    try {
      await api.post(
        rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}/votar`),
        opcionId ? { opcionId } : {}
      );
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

  function clavePropuesta(jugador) {
    return jugador.usuarioId ? `u:${jugador.usuarioId}` : `i:${jugador.invitadoId}`;
  }

  function referenciaJugador(clave) {
    const [tipo, id] = [clave.slice(0, 1), clave.slice(2)];
    return tipo === 'u' ? { usuarioId: id } : { invitadoId: id };
  }

  async function proponerIntercambio(propuestaId) {
    setError('');
    setProcesando(`opcion-${propuestaId}`);
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}/opciones`), {
        jugadorA: referenciaJugador(seleccion.a),
        jugadorB: referenciaJugador(seleccion.b),
      });
      setProponiendoEn(null);
      setSeleccion({ a: '', b: '' });
      await onActualizado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  async function eliminarOpcion(propuestaId, opcionId) {
    setError('');
    setProcesando(opcionId);
    try {
      await api.delete(rutaGrupo(grupoId, `/partidos/${partidoId}/formaciones-propuestas/${propuestaId}/opciones/${opcionId}`));
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
          const esGanadora = propuestaGanadoraId === propuesta.id && !opcionGanadoraId;
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
                        <p key={jugador.usuarioId || jugador.invitadoId}>{jugador.nombre}</p>
                      ))}
                    </div>
                    <div>
                      <p className={styles.equipoLabel}>Equipo B</p>
                      {propuesta.equipoB.map((jugador) => (
                        <p key={jugador.usuarioId || jugador.invitadoId}>{jugador.nombre}</p>
                      ))}
                    </div>
                  </div>

                  <div className={styles.acciones}>
                    <Boton variante="ghost" onClick={() => onVerEnCancha(propuesta, `Equipos posibles ${propuesta.numero}`)}>
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

                  {(propuesta.opciones.length > 0 || (soyAnotado && !votacionEquiposCerrada)) && (
                    <div className={styles.opciones}>
                      <p className={styles.equipoLabel}>Opciones de intercambio</p>
                      {propuesta.opciones.map((opcion) => {
                        const opcionGanadora = opcionGanadoraId === opcion.id;
                        const opcionMiVoto = miVotoOpcionId === opcion.id;
                        return (
                          <div key={opcion.id} className={styles.opcion}>
                            <div className={styles.opcionTexto}>
                              <span className={styles.opcionTitulo}>
                                Opción {opcion.numero}: {opcion.jugadorA?.nombre} (A) ⇄ {opcion.jugadorB?.nombre} (B)
                                {opcionGanadora && <span className={styles.badgeGanadora}>Ganadora</span>}
                                {opcionMiVoto && !opcionGanadora && <span className={styles.badgeMiVoto}>Tu voto</span>}
                              </span>
                              <span className={styles.votos}>
                                {opcion.proponenteNombre} · {opcion.votos} voto{opcion.votos === 1 ? '' : 's'}
                              </span>
                            </div>
                            <div className={styles.acciones}>
                              <Boton
                                variante="ghost"
                                onClick={() =>
                                  onVerEnCancha(
                                    opcion,
                                    `Opción ${opcion.numero}: ${opcion.jugadorA?.nombre} ⇄ ${opcion.jugadorB?.nombre}`
                                  )
                                }
                              >
                                Ver en cancha
                              </Boton>
                              {soyTitular && !votacionEquiposCerrada && (
                                <Boton
                                  variante="primario"
                                  onClick={() => votar(propuesta.id, opcion.id)}
                                  disabled={procesando === opcion.id}
                                >
                                  {opcionMiVoto ? 'Votaste esta' : procesando === opcion.id ? 'Votando…' : 'Votar esta'}
                                </Boton>
                              )}
                              {esAdmin && !votacionEquiposCerrada && (
                                <Boton variante="peligro" onClick={() => eliminarOpcion(propuesta.id, opcion.id)} disabled={procesando === opcion.id}>
                                  Eliminar
                                </Boton>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {soyAnotado && !votacionEquiposCerrada && proponiendoEn !== propuesta.id && (
                        <Boton
                          variante="ghost"
                          onClick={() => {
                            setSeleccion({ a: '', b: '' });
                            setProponiendoEn(propuesta.id);
                          }}
                        >
                          Proponer intercambio
                        </Boton>
                      )}

                      {proponiendoEn === propuesta.id && (
                        <div className={styles.formIntercambio}>
                          <select
                            className={styles.select}
                            value={seleccion.a}
                            onChange={(evento) => setSeleccion((anterior) => ({ ...anterior, a: evento.target.value }))}
                          >
                            <option value="">Jugador del Equipo A…</option>
                            {propuesta.equipoA.map((jugador) => (
                              <option key={clavePropuesta(jugador)} value={clavePropuesta(jugador)}>
                                {jugador.nombre}
                              </option>
                            ))}
                          </select>
                          <select
                            className={styles.select}
                            value={seleccion.b}
                            onChange={(evento) => setSeleccion((anterior) => ({ ...anterior, b: evento.target.value }))}
                          >
                            <option value="">Jugador del Equipo B…</option>
                            {propuesta.equipoB.map((jugador) => (
                              <option key={clavePropuesta(jugador)} value={clavePropuesta(jugador)}>
                                {jugador.nombre}
                              </option>
                            ))}
                          </select>
                          <div className={styles.acciones}>
                            <Boton
                              variante="primario"
                              onClick={() => proponerIntercambio(propuesta.id)}
                              disabled={!seleccion.a || !seleccion.b || procesando === `opcion-${propuesta.id}`}
                            >
                              {procesando === `opcion-${propuesta.id}` ? 'Enviando…' : 'Proponer'}
                            </Boton>
                            <Boton variante="ghost" onClick={() => setProponiendoEn(null)}>
                              Cancelar
                            </Boton>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
