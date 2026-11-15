import { useState, useEffect } from 'react';
import { useGrupo } from '../context/GrupoContext';
import { obtenerApuestasPartido } from '../services/apuestasApi';
import {
  ESTADOS_APUESTA_ETIQUETAS,
  ESTADOS_APUESTA_COLORES,
  TIPOS_APUESTA_ETIQUETAS,
  TIPOS_APUESTA_ICONOS,
  formatearMonto,
  formatearGanancia,
} from '../constants/apuestas';
import styles from './ResultadosApuestasPartido.module.css';

export default function ResultadosApuestasPartido({ partidoId, partidoEstado, partidoResultado }) {
  const { grupoActivo } = useGrupo();
  const [apuestas, setApuestas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');

  const cargarApuestas = async () => {
    if (!grupoActivo || !partidoId) return;
    setCargando(true);
    setError('');
    try {
      const data = await obtenerApuestasPartido(grupoActivo.id, partidoId);
      setApuestas(data);
    } catch (err) {
      setError(err.message || 'Error al cargar resultados');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (partidoEstado === 'jugado' && !cargando && apuestas.length === 0) {
      cargarApuestas();
    }
  }, [partidoEstado, partidoId, grupoActivo]);

  const toggleDropdown = () => {
    if (partidoEstado !== 'jugado') return;
    setAbierto(!abierto);
    if (!abierto && apuestas.length === 0) {
      cargarApuestas();
    }
  };

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

  if (partidoEstado !== 'jugado') {
    return null;
  }

  // Agrupar apuestas por usuario
  const apuestasPorUsuario = apuestas.reduce((acc, apuesta) => {
    const uid = apuesta.usuarioUid || apuesta.usuarioId;
    if (!acc[uid]) {
      acc[uid] = {
        nombre: apuesta.usuarioNombre,
        uid,
        apuestas: [],
        totalApostado: 0,
        totalGanado: 0,
        totalPerdido: 0,
      };
    }
    acc[uid].apuestas.push(apuesta);
    acc[uid].totalApostado += apuesta.monto;
    if (apuesta.estado === 'ganada') {
      acc[uid].totalGanado += apuesta.gananciaReal;
    } else if (apuesta.estado === 'perdida') {
      acc[uid].totalPerdido += apuesta.monto;
    }
    return acc;
  }, {});

  const usuarios = Object.values(apuestasPorUsuario);

  return (
    <div className={styles.contenedor}>
      <button
        className={styles.botonToggle}
        onClick={toggleDropdown}
        disabled={cargando}
        aria-expanded={abierto}
        aria-controls="resultados-apuestas-dropdown"
      >
        <span className={styles.iconoDropdown}>
          {abierto ? '▲' : '▼'}
        </span>
        <span className={styles.textoToggle}>
          {apuestas.length === 0 && !cargando ? 'Ver resultados de apuestas' : `Resultados (${usuarios.length} jugadores)`}
        </span>
        {cargando && <span className={styles.spinner} />}
      </button>

      {abierto && (
        <div
          id="resultados-apuestas-dropdown"
          className={styles.dropdown}
          role="region"
          aria-label="Resultados de apuestas del partido"
        >
          {cargando && (
            <div className={styles.cargando}>
              <div className={styles.spinner} />
              <p>Cargando resultados...</p>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              {error}
              <button className={styles.botonReintentar} onClick={cargarApuestas}>
                Reintentar
              </button>
            </div>
          )}

          {!cargando && !error && usuarios.length === 0 && (
            <div className={styles.sinResultados}>
              <p>No hay apuestas registradas para este partido.</p>
            </div>
          )}

          {!cargando && !error && usuarios.length > 0 && (
            <div className={styles.listaUsuarios}>
              {usuarios.map((usuario) => (
                <div key={usuario.uid} className={styles.usuarioCard}>
                  <div className={styles.usuarioHeader}>
                    <span className={styles.usuarioNombre}>{usuario.nombre}</span>
                    <div className={styles.usuarioResumen}>
                      <span className={clsx(styles.badge, styles.badgeApostado)}>
                        Apostado: {formatearMonto(usuario.totalApostado)}
                      </span>
                      {usuario.totalGanado > 0 && (
                        <span className={clsx(styles.badge, styles.badgeGanado)}>
                          +{formatearGanancia(usuario.totalGanado)}
                        </span>
                      )}
                      {usuario.totalPerdido > 0 && (
                        <span className={clsx(styles.badge, styles.badgePerdido)}>
                          -{formatearMonto(usuario.totalPerdido)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.usuarioApuestas}>
                    {usuario.apuestas.map((apuesta) => (
                      <div
                        key={apuesta.id}
                        className={clsx(styles.apuestaItem, apuesta.estado === 'ganada' && styles.apuestaGanada, apuesta.estado === 'perdida' && styles.apuestaPerdida)}
                      >
                        <div className={styles.apuestaInfo}>
                          <span className={styles.apuestaIcono}>
                            {TIPOS_APUESTA_ICONOS[apuesta.tipo]}
                          </span>
                          <span className={styles.apuestaTipo}>
                            {TIPOS_APUESTA_ETIQUETAS[apuesta.tipo]}
                          </span>
                          <span className={styles.apuestaSeleccion}>
                            {apuesta.seleccion}
                          </span>
                          <span className={clsx(styles.apuestaCuota, styles.monospace)}>
                            {apuesta.cuota.toFixed(2)}x
                          </span>
                          <span className={clsx(styles.apuestaMonto, styles.monospace)}>
                            {formatearMonto(apuesta.monto)}
                          </span>
                        </div>
                        <div className={clsx(styles.apuestaResultado, styles.monospace)}>
                          <span
                            className={clsx(styles.estadoBadge, {
                              [styles.estadoGanada]: apuesta.estado === 'ganada',
                              [styles.estadoPerdida]: apuesta.estado === 'perdida',
                              [styles.estadoReembolsada]: apuesta.estado === 'reembolsada',
                            })}
                          >
                            {ESTADOS_APUESTA_ETIQUETAS[apuesta.estado] || apuesta.estado}
                          </span>
                          {apuesta.estado === 'ganada' && (
                            <span className={styles.gananciaReal}>
                              +{formatearGanancia(apuesta.gananciaReal)}
                            </span>
                          )}
                          {apuesta.estado === 'perdida' && (
                            <span className={styles.perdidaReal}>
                              -{formatearMonto(apuesta.monto)}
                            </span>
                          )}
                          {apuesta.estado === 'reembolsada' && (
                            <span className={styles.reembolsadaReal}>
                              Reembolsado
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {partidoResultado && !cargando && !error && (
            <div className={styles.resultadoPartido}>
              <span className={styles.resultadoLabel}>Resultado del partido:</span>
              <span className={styles.resultadoValor}>{partidoResultado}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}