import { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { obtenerEfectosActivosPartido, actualizarEfectoMetadata } from '../services/apuestasApi';
import Boton from './Boton';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './EfectosFormacionActivos.module.css';

const FORMACION_EFECTOS = [
  'elegir_equipo',
  'armar_equipo_completo',
  'cambiar_jugador_equipo',
  'bloquear_formacion',
];

const ICONOS_EFECTO = {
  elegir_equipo: '🎯',
  armar_equipo_completo: '⚽',
  cambiar_jugador_equipo: '🔄',
  bloquear_formacion: '🔒',
};

const NOMBRES_EFECTO = {
  elegir_equipo: 'Elegir tu equipo',
  armar_equipo_completo: 'Armar equipo completo',
  cambiar_jugador_equipo: 'Cambiar jugador de equipo',
  bloquear_formacion: 'Bloquear formación',
};

const DESCRIPCIONES_EFECTO = {
  elegir_equipo: 'Fuerza tu equipo (A o B) al confirmar formación',
  armar_equipo_completo: 'Define toda la formación titular y suplentes',
  cambiar_jugador_equipo: 'Mueve un jugador del Equipo A al B (o viceversa)',
  bloquear_formacion: 'Nadie puede cambiar la formación por 24 horas',
};

export default function EfectosFormacionActivos({ partidoId, onEjecutado }) {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [efectosActivos, setEfectosActivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ejecutando, setEjecutando] = useState(null);

  // Modal state
  const [modalAbierto, setModalAbierto] = useState(false);
  const [efectoSeleccionado, setEfectoSeleccionado] = useState(null);
  const [modalCargando, setModalCargando] = useState(false);

  // Form state for modals
  const [equipoSeleccionado, setEquipoSeleccionado] = useState('A');
  const [jugadorAMover, setJugadorAMover] = useState(null);
  const [jugadorDestino, setJugadorDestino] = useState(null);
  const [jugadoresDisponibles, setJugadoresDisponibles] = useState([]);
  const [jugadoresCargando, setJugadoresCargando] = useState(false);

  const cargarEfectos = useCallback(async () => {
    if (!grupoActivo || !perfil || !partidoId) return;
    setCargando(true);
    try {
      const data = await obtenerEfectosActivosPartido(grupoActivo.id, partidoId);
      const formacionEfectos = data.filter((efecto) =>
        FORMACION_EFECTOS.includes(efecto.tipo)
      );
      setEfectosActivos(formacionEfectos);
    } catch (err) {
      console.error('Error al cargar efectos activos:', err);
      setEfectosActivos([]);
    } finally {
      setCargando(false);
    }
  }, [grupoActivo, perfil, partidoId]);

  useEffect(() => {
    cargarEfectos();
  }, [cargarEfectos]);

  const cargarJugadoresPartido = useCallback(async () => {
    if (!grupoActivo || !partidoId) return;
    setJugadoresCargando(true);
    try {
      const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/inscripciones`));
      // Solo titulares con equipo asignado
      const titulares = data.filter(j => j.estado === 'anotado' && j.tipo === 'titular' && j.equipo);
      setJugadoresDisponibles(titulares);
    } catch (err) {
      console.error('Error cargando jugadores:', err);
    } finally {
      setJugadoresCargando(false);
    }
  }, [grupoActivo, partidoId]);

  const handleAbrirModal = useCallback((efecto) => {
    setEfectoSeleccionado(efecto);
    setModalAbierto(true);
    if (efecto.tipo === 'cambiar_jugador_equipo') {
      cargarJugadoresPartido();
    }
  }, [cargarJugadoresPartido]);

  const handleCerrarModal = useCallback(() => {
    setModalAbierto(false);
    setEfectoSeleccionado(null);
    setEquipoSeleccionado('A');
    setJugadorAMover(null);
    setJugadorDestino(null);
  }, []);

  const handleEjecutarEfecto = async () => {
    if (!efectoSeleccionado || !grupoActivo) return;
    setModalCargando(true);
    try {
      const metadata = {};

      switch (efectoSeleccionado.tipo) {
        case 'elegir_equipo':
          metadata.equipo = equipoSeleccionado; // 'A' or 'B'
          break;
        case 'cambiar_jugador_equipo':
          if (!jugadorAMover) {
            alert('Selecciona un jugador para mover');
            return;
          }
          if (!jugadorDestino) {
            alert('Selecciona un jugador del otro equipo para intercambiar');
            return;
          }
          metadata.jugadorId = jugadorAMover.usuarioId || jugadorAMover.invitadoId;
          metadata.jugadorDestinoId = jugadorDestino.usuarioId || jugadorDestino.invitadoId;
          break;
        case 'bloquear_formacion':
          // Passive effect, just mark as executed
          metadata.ejecutado = true;
          break;
        case 'armar_equipo_completo':
          // Enable formation editing for this user on the tactical board
          metadata.activarEdicion = true;
          break;
      }

      await actualizarEfectoMetadata(grupoActivo.id, efectoSeleccionado.id, metadata);
      handleCerrarModal();
      await cargarEfectos();
      onEjecutado?.(efectoSeleccionado);
    } catch (err) {
      console.error('Error al ejecutar efecto:', err);
      alert(err.message || 'Error al ejecutar el efecto');
    } finally {
      setModalCargando(false);
    }
  };

  if (cargando) {
    return (
      <div className={styles.cargando}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (efectosActivos.length === 0) {
    return null;
  }

  // Compute players from opposite team for swap
  const jugadoresDelEquipoOpuesto = jugadorAMover
    ? jugadoresDisponibles.filter(j => j.equipo !== jugadorAMover.equipo)
    : [];

  return (
    <>
      <div className={styles.contenedor}>
        <h4 className={styles.titulo}>⚡ Efectos de formación activos</h4>
        <p className={styles.subtitulo}>Ejecútalos en este partido</p>
        <div className={styles.lista}>
          {efectosActivos.map((efecto) => (
            <div key={efecto.id} className={styles.efectoCard}>
              <div className={styles.efectoInfo}>
                <span className={styles.efectoIcono}>{ICONOS_EFECTO[efecto.tipo] || '⚡'}</span>
                <div className={styles.efectoTexto}>
                  <strong className={styles.efectoNombre}>{NOMBRES_EFECTO[efecto.tipo] || efecto.tipo}</strong>
                  <span className={styles.efectoDescripcion}>{DESCRIPCIONES_EFECTO[efecto.tipo] || ''}</span>
                </div>
              </div>
              <Boton
                variante="primario"
                className={styles.botonEjecutar}
                onClick={() => handleAbrirModal(efecto)}
                disabled={ejecutando === efecto.id || modalCargando}
              >
                {ejecutando === efecto.id ? 'Ejecutando…' : 'Ejecutar'}
              </Boton>
            </div>
          ))}
        </div>
      </div>

      {modalAbierto && efectoSeleccionado && (
        <div className={styles.modalOverlay} onClick={handleCerrarModal} role="dialog" aria-modal="true">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3 className={styles.modalTitulo}>
                {ICONOS_EFECTO[efectoSeleccionado.tipo] || '⚡'} {NOMBRES_EFECTO[efectoSeleccionado.tipo]}
              </h3>
              <button className={styles.modalCerrar} onClick={handleCerrarModal} aria-label="Cerrar">✕</button>
            </header>
            <div className={styles.modalContenido}>
              {efectoSeleccionado.tipo === 'elegir_equipo' && (
                <div className={styles.modalForm}>
                  <p className={styles.modalTexto}>Selecciona tu equipo para este partido:</p>
                  <div className={styles.equipoOpciones}>
                    <label className={clsx(styles.equipoOpcion, equipoSeleccionado === 'A' && styles.seleccionado)}>
                      <input
                        type="radio"
                        name="equipo"
                        value="A"
                        checked={equipoSeleccionado === 'A'}
                        onChange={() => setEquipoSeleccionado('A')}
                      />
                      <span>⚽ Equipo A</span>
                    </label>
                    <label className={clsx(styles.equipoOpcion, equipoSeleccionado === 'B' && styles.seleccionado)}>
                      <input
                        type="radio"
                        name="equipo"
                        value="B"
                        checked={equipoSeleccionado === 'B'}
                        onChange={() => setEquipoSeleccionado('B')}
                      />
                      <span>⚽ Equipo B</span>
                    </label>
                  </div>
                </div>
              )}

              {efectoSeleccionado.tipo === 'cambiar_jugador_equipo' && (
                <div className={styles.modalForm}>
                  <p className={styles.modalTexto}>Selecciona el jugador a mover y con quién intercambiarlo:</p>
                  <div className={styles.selectGroup}>
                    <label className={styles.selectLabel}>Jugador a mover:</label>
                    <select
                      className={styles.select}
                      value={jugadorAMover?.usuarioId || jugadorAMover?.invitadoId || ''}
                      onChange={(e) => {
                        const id = e.target.value;
                        const jugador = jugadoresDisponibles.find(j => (j.usuarioId || j.invitadoId) === id);
                        setJugadorAMover(jugador || null);
                        setJugadorDestino(null);
                      }}
                      disabled={jugadoresCargando}
                    >
                      <option value="">{jugadoresCargando ? 'Cargando jugadores...' : '-- Selecciona un jugador --'}</option>
                      {jugadoresDisponibles.map((j) => (
                        <option key={j.usuarioId || j.invitadoId} value={j.usuarioId || j.invitadoId}>
                          {j.nombre} ({j.equipo === 'A' ? 'Equipo A' : 'Equipo B'})
                        </option>
                      ))}
                    </select>
                    {jugadoresCargando && <span className={styles.cargandoJugadores}>⏳</span>}
                  </div>
                  <div className={styles.selectGroup}>
                    <label className={styles.selectLabel}>Intercambiar con (equipo opuesto):</label>
                    {jugadorAMover ? (
                      <select
                        className={styles.select}
                        value={jugadorDestino?.usuarioId || jugadorDestino?.invitadoId || ''}
                        onChange={(e) => {
                          const id = e.target.value;
                          const jugador = jugadoresDelEquipoOpuesto.find(j => (j.usuarioId || j.invitadoId) === id);
                          setJugadorDestino(jugador || null);
                        }}
                        disabled={jugadoresDelEquipoOpuesto.length === 0}
                      >
                        <option value="">-- Selecciona jugador del otro equipo --</option>
                        {jugadoresDelEquipoOpuesto.map((j) => (
                          <option key={j.usuarioId || j.invitadoId} value={j.usuarioId || j.invitadoId}>
                            {j.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select className={styles.select} disabled>
                        <option value="">Primero selecciona un jugador a mover</option>
                      </select>
                    )}
                  </div>
                  {jugadorAMover && jugadorDestino && (
                    <p className={styles.preview}>
                      Intercambiar <strong>{jugadorAMover.nombre}</strong> ({jugadorAMover.equipo === 'A' ? 'Equipo A' : 'Equipo B'})
                      con <strong>{jugadorDestino.nombre}</strong> ({jugadorDestino.equipo === 'A' ? 'Equipo A' : 'Equipo B'})
                    </p>
                  )}
                </div>
              )}

              {efectoSeleccionado.tipo === 'bloquear_formacion' && (
                <div className={styles.modalForm}>
                  <p className={styles.modalTexto}>
                    La formación se bloqueará por 24 horas. Nadie podrá hacer cambios.
                  </p>
                </div>
              )}

              {efectoSeleccionado.tipo === 'armar_equipo_completo' && (
                <div className={styles.modalForm}>
                  <p className={styles.modalTexto}>
                    Usa la pizarra táctica (editor de formación) para armar el equipo completo.
                  </p>
                </div>
              )}
            </div>
            <footer className={styles.modalFooter}>
              <Boton variante="secundario" onClick={handleCerrarModal} disabled={modalCargando}>
                Cancelar
              </Boton>
              <Boton
                variante="primario"
                onClick={handleEjecutarEfecto}
                disabled={modalCargando || (efectoSeleccionado.tipo === 'cambiar_jugador_equipo' && (!jugadorAMover || !jugadorDestino))}
              >
                {modalCargando ? 'Ejecutando…' : 'Ejecutar'}
              </Boton>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}