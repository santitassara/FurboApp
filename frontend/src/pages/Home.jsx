import { useCallback, useEffect, useState, useMemo } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import styles from './Home.module.css';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import TarjetaPartido from '../components/TarjetaPartido';
import MapaCancha from '../components/MapaCancha';
import ModalConfirmacionSancion from '../components/ModalConfirmacionSancion';
import ModalPosicion from '../components/ModalPosicion';
import PartidoConEstado from '../components/PartidoConEstado';
import EquiposPosibles from '../components/EquiposPosibles';
import HeroPartido from '../components/HeroPartido';
import TarjetaInfoPartido from '../components/TarjetaInfoPartido';
import ListaConvocadosScroll from '../components/ListaConvocadosScroll';
import MvpUltimaFecha from '../components/MvpUltimaFecha';
import LideresDelMes from '../components/LideresDelMes';
import InfoGeneralGrupo from '../components/InfoGeneralGrupo';
import ListaInvitadosGrupo from '../components/ListaInvitadosGrupo';

export default function Home() {
  const { perfil, actualizarPosicionesPerfil } = useAuth();
  const { grupoActivo, refrescarGrupos } = useGrupo();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const navigate = useNavigate();
  const [partidos, setPartidos] = useState([]);
  const [inscripcionesPorPartido, setInscripcionesPorPartido] = useState({});
  const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
  const [propuestasPorPartido, setPropuestasPorPartido] = useState({});
  const [previewPorPartido, setPreviewPorPartido] = useState({});
  const [previewEtiquetaPorPartido, setPreviewEtiquetaPorPartido] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [partidoParaBaja, setPartidoParaBaja] = useState(null);
  const [partidoEnProceso, setPartidoEnProceso] = useState(null);
  const [guardandoPosicionPerfil, setGuardandoPosicionPerfil] = useState(false);
  const [partidoParaAnotarse, setPartidoParaAnotarse] = useState(null);
  const [ultimoJugado, setUltimoJugado] = useState(null);

  // Detectar si hay un partido jugado con votación de performance abierta
  const partidoConVotoAbierto = useMemo(() => {
    console.log('[Home] useMemo check:', {
      hasUltimoJugado: !!ultimoJugado,
      hasPerfil: !!perfil,
      votacionCerrada: ultimoJugado?.votacionCerrada,
      perfilUid: perfil?.uid,
      inscripcionesKeys: Object.keys(inscripcionesPorPartido),
      inscripcionesForMatch: inscripcionesPorPartido[ultimoJugado?.id]?.length
    });
    if (!ultimoJugado || !perfil) return null;
    if (ultimoJugado.votacionCerrada) return null;
    // Verificar si el usuario actual fue titular en ese partido
    const inscripciones = inscripcionesPorPartido[ultimoJugado.id] || [];
    const fueTitular = inscripciones.some(
      (j) => j.usuarioId === perfil.uid && j.tipo === 'titular'
    );
    console.log('[Home] fueTitular check:', { fueTitular, inscripcionesSample: inscripciones.slice(0, 2) });
    if (!fueTitular) return null;
    return ultimoJugado;
  }, [ultimoJugado, perfil, inscripcionesPorPartido]);

  const irAVotar = () => {
    if (partidoConVotoAbierto) {
      // Navegar al historial con parámetro para auto-expandir y abrir votación
      navigate(`/historial?voteMatch=${partidoConVotoAbierto.id}`);
    }
  };

  const cargarPartidos = useCallback(async () => {
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      const { data: partidosAbiertos } = await api.get(rutaGrupo(grupoActivo.id, '/partidos'));
      setPartidos(partidosAbiertos);

      // Also load match history to detect open voting on played matches
      const { data: historial } = await api.get(rutaGrupo(grupoActivo.id, '/partidos/historial'));
      const ultimosJugados = historial.filter((p) => p.estado === 'jugado').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const ultimoJugado = ultimosJugados[0] || null;
      setUltimoJugado(ultimoJugado);

      // Load inscripciones for the last played match (needed for vote detection)
      if (ultimoJugado) {
        const { data: inscripcionesUltimo } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${ultimoJugado.id}/inscripciones`));
        setInscripcionesPorPartido((prev) => ({ ...prev, [ultimoJugado.id]: inscripcionesUltimo }));
      }

      // Modo plantel: la pizarra táctica se habilita con solo los titulares
      // (no hay suplentes ni dos equipos). Convocatoria: se habilita cuando
      // titulares + suplentes cubren el cupo.
      const esPlantel = grupoActivo.modo === 'plantel';
      const cuposCubiertos = (partido) =>
        esPlantel
          ? (partido.ocupados?.titulares || 0) >= partido.cupoTitulares
          : (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0) >= partido.cupoTitulares;

      const entradas = await Promise.all(
        partidosAbiertos.map(async (partido) => {
          const { data: jugadores } = await api.get(
            rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/inscripciones`)
          );
          return [partido.id, jugadores];
        })
      );
      setInscripcionesPorPartido(Object.fromEntries(entradas));

      const entradasFormacion = await Promise.all(
        partidosAbiertos
          .filter((partido) => partido.estado !== 'jugado' && cuposCubiertos(partido))
          .map(async (partido) => {
            const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`));
            return [partido.id, data];
          })
      );
      setFormacionesPorPartido(Object.fromEntries(entradasFormacion));

      // El modo plantel no usa votación de equipos: no hay propuestas que cargar.
      const entradasPropuestas = await Promise.all(
        partidosAbiertos
          .filter(
            (partido) =>
              !esPlantel && partido.estado !== 'jugado' && cuposCubiertos(partido)
          )
          .map(async (partido) => {
            const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formaciones-propuestas`));
            return [partido.id, data];
          })
      );
      setPropuestasPorPartido(Object.fromEntries(entradasPropuestas));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [grupoActivo]);

  useEffect(() => {
    cargarPartidos();
  }, [cargarPartidos]);

  function inscripcionDelUsuario(partidoId) {
    const jugadores = inscripcionesPorPartido[partidoId] || [];
    return jugadores.find((jugador) => jugador.usuarioId === perfil?.uid) || null;
  }

  async function anotarse(partidoId, posicionPrincipal, posicionSecundaria) {
    setError('');
    setPartidoEnProceso(partidoId);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/anotarse`), {
        posicionPrincipal,
        posicionSecundaria,
      });
      await cargarPartidos();
      setPartidoParaAnotarse(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPartidoEnProceso(null);
    }
  }

  async function confirmarBaja(partidoId) {
    setError('');
    setPartidoEnProceso(partidoId);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/bajarse`));
      await cargarPartidos();
      await refrescarGrupos();
    } catch (err) {
      setError(err.message);
    } finally {
      setPartidoParaBaja(null);
      setPartidoEnProceso(null);
    }
  }

  function solicitarBaja(partido) {
    const inscripcion = inscripcionDelUsuario(partido.id);
    if (inscripcion?.tipo === 'titular') {
      setPartidoParaBaja(partido.id);
    } else {
      confirmarBaja(partido.id);
    }
  }

  async function confirmarPosicionPerfil(posicionPrincipal, posicionSecundaria) {
    setError('');
    setGuardandoPosicionPerfil(true);
    try {
      await actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoPosicionPerfil(false);
    }
  }

  if (!grupoActivo) {
    return null;
  }

  return (
    <div className={styles.contenedor}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>Próximos partidos</h1>
          <p className={styles.saludo}>Hola, {perfil?.nombre}</p>
        </div>
        <div className={styles.headerActions}>
          {canInstall && (
            <button
              onClick={triggerInstall}
              className={styles.botonInstalar}
              aria-label="Instalar aplicación"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Instalar como App
            </button>
          )}
          {partidoConVotoAbierto && (
            <div className={styles.votoFabWrapper}>
              <button
                type="button"
                onClick={irAVotar}
                className={styles.votoFab}
                aria-label="Votar performance de jugadores"
              >
                <span className={styles.votoFabIcon}>⚽</span>
                <span>Vota la actuacion de los jugadores del ultimo partido</span>
              </button>
              <span className={styles.votoFabTooltip}>
                <svg className={styles.tooltipIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                No dar tu voto puede bajar tu puntaje o quitarte beneficios
              </span>
            </div>
          )}
        </div>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {cargando ? (
        <p className={styles.mensajeSecundario}>Cargando partidos…</p>
      ) : partidos.length === 0 ? (
        <p className={styles.mensajeSecundario}>No hay partidos para mostrar por ahora.</p>
      ) : (
        <div className={styles.listaPartidos}>
          {partidos.map((partido, indice) =>
            indice === 0 ? (
              <PartidoConEstado key={partido.id} partido={partido}>
                <div className={styles.contenidoPrimero}>
                  <HeroPartido
                    partido={partido}
                    inscripcionUsuario={inscripcionDelUsuario(partido.id)}
                    estaSancionado={grupoActivo?.estaSancionado}
                    procesando={partidoEnProceso === partido.id}
                    onAnotarse={() => setPartidoParaAnotarse(partido.id)}
                    onSolicitarBaja={() => solicitarBaja(partido)}
                  />

                  <TarjetaInfoPartido partido={partido} />

                  <div className={clsx(formacionesPorPartido[partido.id] && styles.gridDosColumnas)}>
                    <div>
                      <ListaConvocadosScroll
                        jugadores={inscripcionesPorPartido[partido.id] || []}
                        formacion={formacionesPorPartido[partido.id]}
                        equiposDefinidos={Boolean(propuestasPorPartido[partido.id]?.votacionEquiposCerrada)}
                        grupoId={grupoActivo.id}
                      />
                    </div>

                    {formacionesPorPartido[partido.id] && (
                      <div id={`mapa-cancha-${partido.id}`} className={styles.mapaWrapper}>
                        {(() => {
                          const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
                          const esperandoTitulares = ocupados.titulares < partido.cupoTitulares;
                          return (
                            <div className={clsx(esperandoTitulares && styles.bloqueado)}>
                              <MapaCancha
                                partidoId={partido.id}
                                formacion={formacionesPorPartido[partido.id]}
                                esAdmin={grupoActivo?.rol === 'admin'}
                                onGuardado={(data) =>
                                  setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))
                                }
                                propuestasInfo={propuestasPorPartido[partido.id]}
                                previewPropuesta={previewPorPartido[partido.id] || null}
                                previewEtiqueta={previewEtiquetaPorPartido[partido.id] || null}
                                onPropuesto={cargarPartidos}
                                onSalirPreview={() =>
                                  setPreviewPorPartido((anterior) => ({ ...anterior, [partido.id]: null }))
                                }
                                jugadores={inscripcionesPorPartido[partido.id] || []}
                                onPromovido={cargarPartidos}
                              />
                            </div>
                          );
                        })()}
                        {(() => {
                          const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
                          const esperandoTitulares = ocupados.titulares < partido.cupoTitulares;
                          return esperandoTitulares && (
                            <div className={styles.overlayEsperando}>
                              <p className={styles.mensajeEsperando}>
                                Esperando a todos los titulares
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  </div>

                  {propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (
                    <EquiposPosibles
                      grupoId={grupoActivo.id}
                      partidoId={partido.id}
                      datos={propuestasPorPartido[partido.id]}
                      esAdmin={grupoActivo?.rol === 'admin'}
                      soyTitular={inscripcionDelUsuario(partido.id)?.tipo === 'titular'}
                      soyAnotado={Boolean(inscripcionDelUsuario(partido.id))}
                      onActualizado={cargarPartidos}
                      onVerEnCancha={(propuesta, etiqueta) => {
                        setPreviewPorPartido((anterior) => ({
                          ...anterior,
                          [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
                        }));
                        setPreviewEtiquetaPorPartido((anterior) => ({ ...anterior, [partido.id]: etiqueta }));
                        document
                          .getElementById(`mapa-cancha-${partido.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    />
                  )}
                </div>
              </PartidoConEstado>
            ) : (
              <PartidoConEstado key={partido.id} partido={partido}>
                <div
                  className={clsx(formacionesPorPartido[partido.id] && styles.gridDosColumnas)}
                >
                  {formacionesPorPartido[partido.id] && (
                    <div id={`mapa-cancha-${partido.id}`}>
                      <MapaCancha
                        partidoId={partido.id}
                        formacion={formacionesPorPartido[partido.id]}
                        esAdmin={grupoActivo?.rol === 'admin'}
                        onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
                        propuestasInfo={propuestasPorPartido[partido.id]}
                        previewPropuesta={previewPorPartido[partido.id] || null}
                              previewEtiqueta={previewEtiquetaPorPartido[partido.id] || null}
                        onPropuesto={cargarPartidos}
                        onSalirPreview={() => setPreviewPorPartido((anterior) => ({ ...anterior, [partido.id]: null }))}
                        jugadores={inscripcionesPorPartido[partido.id] || []}
                        onPromovido={cargarPartidos}
                      />
                    </div>
                  )}
                  <TarjetaPartido
                    partido={partido}
                    inscripcionUsuario={inscripcionDelUsuario(partido.id)}
                    estaSancionado={grupoActivo?.estaSancionado}
                    procesando={partidoEnProceso === partido.id}
                    onAnotarse={() => setPartidoParaAnotarse(partido.id)}
                    onSolicitarBaja={() => solicitarBaja(partido)}
                    jugadores={inscripcionesPorPartido[partido.id] || []}
                    formacion={formacionesPorPartido[partido.id]}
                    equiposDefinidos={Boolean(propuestasPorPartido[partido.id]?.votacionEquiposCerrada)}
                    grupoId={grupoActivo.id}
                  />
                </div>
                {propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (
                  <EquiposPosibles
                    grupoId={grupoActivo.id}
                    partidoId={partido.id}
                    datos={propuestasPorPartido[partido.id]}
                    esAdmin={grupoActivo?.rol === 'admin'}
                    soyTitular={inscripcionDelUsuario(partido.id)?.tipo === 'titular'}
                      soyAnotado={Boolean(inscripcionDelUsuario(partido.id))}
                    onActualizado={cargarPartidos}
                    onVerEnCancha={(propuesta, etiqueta) => {
                      setPreviewPorPartido((anterior) => ({
                        ...anterior,
                        [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
                      }));
                      setPreviewEtiquetaPorPartido((anterior) => ({ ...anterior, [partido.id]: etiqueta }));
                      document
                        .getElementById(`mapa-cancha-${partido.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  />
                )}
              </PartidoConEstado>
            )
          )}
        </div>
      )}

      {!cargando && partidos.length > 0 && (
        <div className={styles.resumenGrid}>
          <MvpUltimaFecha grupoId={grupoActivo.id} />
          <LideresDelMes grupoId={grupoActivo.id} />
          <InfoGeneralGrupo grupoActivo={grupoActivo} proximoPartido={partidos[0]} />
        </div>
      )}

      {!cargando && (
        <ListaInvitadosGrupo
          grupoId={grupoActivo.id}
          esAdmin={grupoActivo?.rol === 'admin'}
          partidoActivo={partidos.find((partido) => partido.estado === 'abierto') || null}
          inscripcionesPartidoActivo={
            inscripcionesPorPartido[partidos.find((partido) => partido.estado === 'abierto')?.id] || []
          }
          onCambio={cargarPartidos}
        />
      )}

      <ModalConfirmacionSancion
        abierto={Boolean(partidoParaBaja)}
        procesando={partidoEnProceso === partidoParaBaja}
        onConfirmar={() => confirmarBaja(partidoParaBaja)}
        onCancelar={() => setPartidoParaBaja(null)}
      />

      <ModalPosicion
        abierto={Boolean(perfil) && !perfil.posicionPrincipal}
        procesando={guardandoPosicionPerfil}
        permitirCancelar={false}
        posicionPrincipalInicial={null}
        posicionSecundariaInicial={null}
        error={error}
        onConfirmar={confirmarPosicionPerfil}
      />

      <ModalPosicion
        abierto={Boolean(partidoParaAnotarse)}
        procesando={partidoEnProceso === partidoParaAnotarse}
        permitirCancelar
        posicionPrincipalInicial={perfil?.posicionPrincipal}
        posicionSecundariaInicial={perfil?.posicionSecundaria}
        error={error}
        onConfirmar={(posicionPrincipal, posicionSecundaria) =>
          anotarse(partidoParaAnotarse, posicionPrincipal, posicionSecundaria)
        }
        onCancelar={() => setPartidoParaAnotarse(null)}
      />
    </div>
  );
}
