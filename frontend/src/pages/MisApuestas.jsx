import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { obtenerMisApuestas } from '../services/apuestasApi';
import {
  ESTADOS_APUESTA_ETIQUETAS,
  ESTADOS_APUESTA_COLORES,
  TIPOS_APUESTA_ETIQUETAS,
  TIPOS_APUESTA_ICONOS,
  formatearMonto,
  formatearGanancia,
  formatearCuota,
} from '../constants/apuestas';
import styles from './MisApuestas.module.css';

export default function MisApuestas() {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const navigate = useNavigate();

  const [apuestas, setApuestas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const cargarApuestas = useCallback(async () => {
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      const data = await obtenerMisApuestas(grupoActivo.id);
      setApuestas(data);
    } catch (err) {
      setError(err.message || 'Error al cargar tus apuestas');
    } finally {
      setCargando(false);
    }
  }, [grupoActivo]);

  useEffect(() => {
    cargarApuestas();
  }, [cargarApuestas]);

  const apuestasFiltradas = apuestas.filter((apuesta) => {
    if (filtroEstado === 'todos') return true;
    return apuesta.estado === filtroEstado;
  });

  const formatearFecha = (fechaISO) => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const obtenerResultadoPartido = (apuesta) => {
    const golesA = apuesta.golesEquipoA ?? 0;
    const golesB = apuesta.golesEquipoB ?? 0;
    if (golesA === 0 && golesB === 0 && apuesta.partidoEstado !== 'jugado') return null;
    return `${golesA}-${golesB}`;
  };

  if (cargando) {
    return (
      <div className={styles.contenedorCargando}>
        <div className={styles.spinner} />
        <p>Cargando tus apuestas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.contenedorError}>
        <p className={styles.mensajeError}>{error}</p>
        <button className={styles.botonReintentar} onClick={cargarApuestas}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.misApuestas}>
      <header className={styles.header}>
        <h1 className={styles.titulo}>Mis Apuestas</h1>
      </header>

      <div className={styles.filtros}>
        <button
          className={clsx(styles.filtroBoton, filtroEstado === 'todos' && styles.filtroActivo)}
          onClick={() => setFiltroEstado('todos')}
        >
          Todas
        </button>
        <button
          className={clsx(styles.filtroBoton, filtroEstado === 'pendiente' && styles.filtroActivo)}
          onClick={() => setFiltroEstado('pendiente')}
        >
          Pendientes
        </button>
        <button
          className={clsx(styles.filtroBoton, filtroEstado === 'ganada' && styles.filtroActivo)}
          onClick={() => setFiltroEstado('ganada')}
        >
          Ganadas
        </button>
        <button
          className={clsx(styles.filtroBoton, filtroEstado === 'perdida' && styles.filtroActivo)}
          onClick={() => setFiltroEstado('perdida')}
        >
          Perdidas
        </button>
      </div>

      {apuestasFiltradas.length === 0 ? (
        <div className={styles.sinApuestas}>
          {filtroEstado === 'todos' ? (
            <>
              <p className={styles.sinApuestasTexto}>No has realizado ninguna apuesta aún.</p>
              <p className={styles.sinApuestasDetalle}>
                Ve a la pestaña de Apuestas para apostar en los próximos partidos.
              </p>
            </>
          ) : (
            <>
              <p className={styles.sinApuestasTexto}>
                No tienes apuestas {ESTADOS_APUESTA_ETIQUETAS[filtroEstado]?.toLowerCase() || filtroEstado}.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className={styles.listaApuestas}>
          {apuestasFiltradas.map((apuesta) => (
            <div key={apuesta.id} className={styles.apuestaCard}>
              <div className={styles.apuestaHeader}>
                <div className={styles.apuestaTipo}>
                  <span className={styles.iconoTipo}>{TIPOS_APUESTA_ICONOS[apuesta.tipo]}</span>
                  <span className={styles.nombreTipo}>{TIPOS_APUESTA_ETIQUETAS[apuesta.tipo]}</span>
                </div>
                <span
                  className={styles.estadoBadge}
                  style={{ backgroundColor: ESTADOS_APUESTA_COLORES[apuesta.estado] }}
                >
                  {ESTADOS_APUESTA_ETIQUETAS[apuesta.estado]}
                </span>
              </div>

              <div className={styles.apuestaInfo}>
                <div className={styles.infoFila}>
                  <span className={styles.infoEtiqueta}>Partido</span>
                  <span className={styles.infoValor}>
                    {apuesta.rival ? `vs ${apuesta.rival}` : 'Partido'}
                    {apuesta.partidoFecha && (
                      <span className={styles.fechaPartido}>
                        {new Date(apuesta.partidoFecha).toLocaleDateString('es-ES', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </span>
                </div>

                <div className={styles.infoFila}>
                  <span className={styles.infoEtiqueta}>Predicción</span>
                  <span className={clsx(styles.infoValor, styles.prediccion)}>
                    {apuesta.seleccion}
                  </span>
                </div>

                <div className={styles.infoFila}>
                  <span className={styles.infoEtiqueta}>Cuota</span>
                  <span className={clsx(styles.infoValor, styles.cuota)}>{formatearCuota(apuesta.cuota)}</span>
                </div>

                <div className={styles.infoFila}>
                  <span className={styles.infoEtiqueta}>Apostado</span>
                  <span className={clsx(styles.infoValor, styles.monto)}>{formatearMonto(apuesta.monto)}</span>
                </div>

                {apuesta.estado === 'ganada' && (
                  <div className={clsx(styles.infoFila, styles.ganancia)}>
                    <span className={styles.infoEtiqueta}>Ganancia</span>
                    <span className={styles.infoValor}>{formatearGanancia(apuesta.gananciaReal)}</span>
                  </div>
                )}

                {apuesta.estado === 'perdida' && (
                  <div className={clsx(styles.infoFila, styles.perdida)}>
                    <span className={styles.infoEtiqueta}>Pérdida</span>
                    <span className={styles.infoValor}>-{formatearMonto(apuesta.monto)}</span>
                  </div>
                )}

                {apuesta.fechaResolucion && (
                  <div className={styles.infoFila}>
                    <span className={styles.infoEtiqueta}>Resuelto</span>
                    <span className={styles.infoValor}>{formatearFecha(apuesta.fechaResolucion)}</span>
                  </div>
                )}

                {apuesta.partidoEstado === 'jugado' && (
                  <div className={clsx(styles.infoFila, styles.resultado)}>
                    <span className={styles.infoEtiqueta}>Resultado</span>
                    <span className={styles.infoValor}>{obtenerResultadoPartido(apuesta)}</span>
                  </div>
                )}
              </div>

              <div className={styles.apuestaFooter}>
                <span className={styles.fechaCreacion}>
                  Apostado el {formatearFecha(apuesta.fechaCreacion)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}