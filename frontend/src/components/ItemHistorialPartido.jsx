import { useMemo, useState } from 'react';
import clsx from 'clsx';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import { formatearFechaPartido } from '../utils/fecha';
import ResultadoPartido from './ResultadoPartido';
import ModalVotarValoraciones from './ModalVotarValoraciones';
import Boton from './Boton';
import styles from './ItemHistorialPartido.module.css';

export default function ItemHistorialPartido({ partido }) {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [expandido, setExpandido] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [elegibles, setElegibles] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [votoAbierto, setVotoAbierto] = useState(false);
  const [votosPropios, setVotosPropios] = useState({ valoraciones: [], mvpId: null });
  const [votando, setVotando] = useState(false);
  const [errorVoto, setErrorVoto] = useState('');
  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [cerrandoVotacion, setCerrandoVotacion] = useState(false);

  const cantidadJugadores = (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0);
  const soyElegible = elegibles.some((j) => j.usuarioId === perfil?.uid);
  const elegiblesParaVotar = useMemo(
    () => elegibles.filter((j) => j.usuarioId !== perfil?.uid),
    [elegibles, perfil?.uid],
  );

  async function alternar() {
    const nuevoExpandido = !expandido;
    setExpandido(nuevoExpandido);
    if (nuevoExpandido && !resultado) {
      setCargando(true);
      setError('');
      try {
        const [{ data: datosResultado }, { data: datosFormacion }] = await Promise.all([
          api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/resultado`)),
          api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`)),
        ]);
        setResultado(datosResultado);
        setElegibles((datosFormacion.jugadores || []).filter((j) => j.equipo));
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
  }

  async function abrirVotacion() {
    setErrorVoto('');
    try {
      const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/votos/mios`));
      setVotosPropios(data);
      setVotoAbierto(true);
    } catch (err) {
      setErrorVoto(err.message);
    }
  }

  async function confirmarVoto(payload) {
    setVotando(true);
    setErrorVoto('');
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/votos`), payload);
      setVotoAbierto(false);
      const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/resultado`));
      setResultado(data);
    } catch (err) {
      setErrorVoto(err.message);
    } finally {
      setVotando(false);
    }
  }

  async function confirmarEliminar() {
    setEliminando(true);
    try {
      await api.delete(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}`));
      setEliminarAbierto(false);
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setEliminando(false);
    }
  }

  async function confirmarCerrarVotacion() {
    const confirmado = window.confirm(
      '¿Cerrar la votación y actualizar las habilidades de los jugadores? Esta acción no se puede deshacer.'
    );
    if (!confirmado) return;

    setCerrandoVotacion(true);
    setError('');
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/cerrar-votacion`));
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setCerrandoVotacion(false);
    }
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        onClick={alternar}
        className={styles.headerBtn}
      >
        <div>
          <p className={styles.fecha}>{formatearFechaPartido(partido.fecha)}</p>
          <p className={styles.cantidadJugadores}>{cantidadJugadores} jugadores</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(styles.chevron, expandido && styles.chevronExpandido)}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expandido && (
        <div className={styles.detalle}>
          {cargando ? (
            <p className={styles.textoCargando}>Cargando resultado…</p>
          ) : error ? (
            <p className={styles.textoError}>{error}</p>
          ) : (
            <>
              <ResultadoPartido partido={partido} resultado={resultado} />
              <div className={styles.accionesRow}>
                {soyElegible && !partido.votacionCerrada && (
                  <button
                    type="button"
                    onClick={abrirVotacion}
                    className={styles.btnCalificar}
                  >
                    Calificar jugadores
                  </button>
                )}
                {grupoActivo?.rol === 'admin' && !partido.votacionCerrada && (
                  <button
                    type="button"
                    onClick={confirmarCerrarVotacion}
                    disabled={cerrandoVotacion}
                    className={styles.btnCerrar}
                  >
                    {cerrandoVotacion ? 'Cerrando…' : 'Cerrar votación'}
                  </button>
                )}
                {grupoActivo?.rol === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setEliminarAbierto(true)}
                    className={styles.btnEliminar}
                  >
                    Eliminar
                  </button>
                )}
              </div>
              {errorVoto && !votoAbierto && <p className={styles.errorVoto}>{errorVoto}</p>}
            </>
          )}
        </div>
      )}

      <ModalVotarValoraciones
        abierto={votoAbierto}
        partido={partido}
        elegibles={elegiblesParaVotar}
        votosPropios={votosPropios}
        procesando={votando}
        error={errorVoto}
        onConfirmar={confirmarVoto}
        onCancelar={() => {
          setVotoAbierto(false);
          setErrorVoto('');
        }}
      />

      {eliminarAbierto && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitulo}>Eliminar partido</h2>
            <p className={styles.modalTexto}>Esta acción es irreversible, ¿estás seguro de hacerlo?</p>
            <div className={styles.modalAcciones}>
              <Boton variante="ghost" onClick={() => setEliminarAbierto(false)} disabled={eliminando}>
                Cancelar
              </Boton>
              <Boton variante="peligro" onClick={confirmarEliminar} disabled={eliminando}>
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
