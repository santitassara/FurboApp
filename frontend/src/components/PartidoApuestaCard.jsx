import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { obtenerOpcionesPartido, crearApuestas } from '../services/apuestasApi';
import {
  TIPOS_APUESTA_VALIDOS,
  TIPOS_APUESTA_ETIQUETAS,
  TIPOS_APUESTA_ICONOS,
  esTipoJugador,
} from '../constants/apuestas';
import ModalOpcionesApuesta from './ModalOpcionesApuesta';
import Boton from './Boton';
import styles from './PartidoApuestaCard.module.css';

export default function PartidoApuestaCard({ partido, saldo, onApuestaCreada }) {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [opciones, setOpciones] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  const handleAbrirModal = async (tipo) => {
    if (cargandoOpciones) return;
    setCargandoOpciones(true);
    setError('');
    try {
      const opcionesData = await obtenerOpcionesPartido(grupoActivo.id, partido.id);
      setOpciones(opcionesData);
      setTipoSeleccionado(tipo);
      setModalAbierto(true);
    } catch (err) {
      setError(err.message || 'Error al cargar opciones');
    } finally {
      setCargandoOpciones(false);
    }
  };

  const handleCerrarModal = () => {
    setModalAbierto(false);
    setTipoSeleccionado(null);
    setOpciones(null);
    setError('');
  };

  const handleConfirmarApuesta = async (apuestas) => {
    setCreando(true);
    setError('');
    try {
      await crearApuestas(grupoActivo.id, partido.id, apuestas);
      handleCerrarModal();
      onApuestaCreada?.();
    } catch (err) {
      setError(err.message || 'Error al crear la apuesta');
    } finally {
      setCreando(false);
    }
  };

  // Obtener cuota para mostrar en el botón
  const cuotaMostrar = useMemo(() => {
    if (!opciones || !tipoSeleccionado) return null;
    const tipoOpciones = opciones[tipoSeleccionado];
    if (!tipoOpciones || tipoOpciones.length === 0) return null;
    // Devolver la cuota más baja (más probable) para mostrar
    const cuotas = tipoOpciones.map((o) => o.cuota).filter(Boolean);
    if (cuotas.length === 0) return null;
    return Math.min(...cuotas);
  }, [opciones, tipoSeleccionado]);

  const fechaFormateada = useMemo(() => {
    const fecha = new Date(partido.fecha);
    return fecha.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }, [partido.fecha]);

  const horaFormateada = useMemo(() => {
    const fecha = new Date(partido.fecha);
    return fecha.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [partido.fecha]);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.infoPartido}>
          <div className={styles.fechaHora}>
            <span className={styles.fecha}>{fechaFormateada}</span>
            <span className={styles.hora}>{horaFormateada}</span>
          </div>
          {partido.rival && (
            <div className={styles.rival}>
              vs {partido.rival}
            </div>
          )}
          {partido.estadio && (
            <div className={styles.estadio}>
              📍 {partido.estadio}
            </div>
          )}
        </div>
      </div>

      <div className={styles.tiposApuesta}>
        {TIPOS_APUESTA_VALIDOS.map((tipo) => (
          <button
            key={tipo}
            className={clsx(styles.botonTipo, styles[`tipo-${tipo}`])}
            onClick={() => handleAbrirModal(tipo)}
            disabled={cargandoOpciones || creando}
          >
            <span className={styles.iconoTipo}>{TIPOS_APUESTA_ICONOS[tipo]}</span>
            <span className={styles.nombreTipo}>{TIPOS_APUESTA_ETIQUETAS[tipo]}</span>
            {cuotaMostrar && tipo === tipoSeleccionado && (
              <span className={styles.cuotaPreview}>{cuotaMostrar.toFixed(2)}x</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      <ModalOpcionesApuesta
        abierto={modalAbierto}
        onCerrar={handleCerrarModal}
        onConfirmar={handleConfirmarApuesta}
        partido={partido}
        tipo={tipoSeleccionado}
        opciones={opciones}
        saldo={saldo}
        cargando={creando}
      />
    </div>
  );
}