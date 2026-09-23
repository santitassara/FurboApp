import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
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

export default function Home() {
  const { perfil, actualizarPosicionesPerfil } = useAuth();
  const { grupoActivo, refrescarGrupos } = useGrupo();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const [partidos, setPartidos] = useState([]);
  const [inscripcionesPorPartido, setInscripcionesPorPartido] = useState({});
  const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
  const [propuestasPorPartido, setPropuestasPorPartido] = useState({});
  const [previewPorPartido, setPreviewPorPartido] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [partidoParaBaja, setPartidoParaBaja] = useState(null);
  const [partidoEnProceso, setPartidoEnProceso] = useState(null);
  const [guardandoPosicionPerfil, setGuardandoPosicionPerfil] = useState(false);
  const [partidoParaAnotarse, setPartidoParaAnotarse] = useState(null);

  const cargarPartidos = useCallback(async () => {
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      const { data: partidosAbiertos } = await api.get(rutaGrupo(grupoActivo.id, '/partidos'));
      setPartidos(partidosAbiertos);

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
          .filter(
            (partido) =>
              partido.estado !== 'jugado' &&
              (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0) >= partido.cupoTitulares
          )
          .map(async (partido) => {
            const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`));
            return [partido.id, data];
          })
      );
      setFormacionesPorPartido(Object.fromEntries(entradasFormacion));

      const entradasPropuestas = await Promise.all(
        partidosAbiertos
          .filter(
            (partido) =>
              partido.estado !== 'jugado' &&
              (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0) >= partido.cupoTitulares
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

                  <div
                    className={clsx(formacionesPorPartido[partido.id] && styles.gridDosColumnas)}
                  >
                    <div>
                      <ListaConvocadosScroll
                        jugadores={inscripcionesPorPartido[partido.id] || []}
                        formacion={formacionesPorPartido[partido.id]}
                        equiposDefinidos={Boolean(propuestasPorPartido[partido.id]?.votacionEquiposCerrada)}
                        grupoId={grupoActivo.id}
                      />
                    </div>

                    {(() => {
                      const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
                      const esperandoTitulares = ocupados.titulares < partido.cupoTitulares;
                      if (!formacionesPorPartido[partido.id]) return null;
                      return (
                        <div id={`mapa-cancha-${partido.id}`} className={styles.mapaWrapper}>
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
                              onPropuesto={cargarPartidos}
                              onSalirPreview={() =>
                                setPreviewPorPartido((anterior) => ({ ...anterior, [partido.id]: null }))
                              }
                              jugadores={inscripcionesPorPartido[partido.id] || []}
                              onPromovido={cargarPartidos}
                            />
                          </div>
                          {esperandoTitulares && (
                            <div className={styles.overlayEsperando}>
                              <p className={styles.mensajeEsperando}>
                                Esperando a todos los titulares
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {propuestasPorPartido[partido.id]?.propuestas?.length > 0 && (
                    <EquiposPosibles
                      grupoId={grupoActivo.id}
                      partidoId={partido.id}
                      datos={propuestasPorPartido[partido.id]}
                      esAdmin={grupoActivo?.rol === 'admin'}
                      soyTitular={inscripcionDelUsuario(partido.id)?.tipo === 'titular'}
                      onActualizado={cargarPartidos}
                      onVerEnCancha={(propuesta) => {
                        setPreviewPorPartido((anterior) => ({
                          ...anterior,
                          [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
                        }));
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
                    onActualizado={cargarPartidos}
                    onVerEnCancha={(propuesta) => {
                      setPreviewPorPartido((anterior) => ({
                        ...anterior,
                        [partido.id]: [...propuesta.equipoA, ...propuesta.equipoB],
                      }));
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
