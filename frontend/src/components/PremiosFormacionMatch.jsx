import { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { obtenerMisPremios, usarPremio } from '../services/apuestasApi';
import Boton from './Boton';
import styles from './PremiosFormacionMatch.module.css';

const FORMACION_CLAVES = [
  'elegir_equipo',
  'armar_equipo_completo',
  'cambiar_jugador_equipo',
  'bloquear_formacion',
];

const ICONOS_PREMIO = {
  elegir_equipo: '🎯',
  armar_equipo_completo: '⚽',
  cambiar_jugador_equipo: '🔄',
  bloquear_formacion: '🔒',
};

export default function PremiosFormacionMatch({ partidoId, onActualizado }) {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [premiosDisponibles, setPremiosDisponibles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usandoPremio, setUsandoPremio] = useState(null);

  const cargarPremios = useCallback(async () => {
    if (!grupoActivo || !perfil) return;
    setCargando(true);
    try {
      const data = await obtenerMisPremios(grupoActivo.id);
      console.log('[PremiosFormacionMatch] Mis premios:', data);
      const formacionPremios = data.filter((premio) => {
        const metadata = premio.premioMetadata || {};
        return (
          FORMACION_CLAVES.includes(premio.clave) &&
          premio.estado === 'disponible' &&
          metadata.requierePartidoId &&
          !premio.partidoId
        );
      });
      console.log('[PremiosFormacionMatch] Premios formación disponibles:', formacionPremios);
      setPremiosDisponibles(formacionPremios);
    } catch (err) {
      console.error('Error al cargar premios de formación:', err);
      setPremiosDisponibles([]);
    } finally {
      setCargando(false);
    }
  }, [grupoActivo, perfil]);

  useEffect(() => {
    cargarPremios();
  }, [cargarPremios]);

  const handleUsarPremio = async (compraId, premioClave) => {
    setUsandoPremio(compraId);
    try {
      await usarPremio(grupoActivo.id, compraId, { partidoId });
      await cargarPremios();
      onActualizado?.();
    } catch (err) {
      alert(err.message || 'Error al usar el premio');
    } finally {
      setUsandoPremio(null);
    }
  };

  if (cargando) {
    return (
      <div className={styles.cargando}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (premiosDisponibles.length === 0) {
    return null;
  }

  return (
    <div className={styles.contenedor}>
      <h4 className={styles.titulo}>🎁 Tus premios de formación</h4>
      <p className={styles.subtitulo}>Úsalos en este partido</p>
      <div className={styles.lista}>
        {premiosDisponibles.map((premio) => (
          <div key={premio.id} className={styles.premioCard}>
            <div className={styles.premioInfo}>
              <span className={styles.premioIcono}>{ICONOS_PREMIO[premio.clave] || '🎁'}</span>
              <div className={styles.premioTexto}>
                <strong className={styles.premioNombre}>{premio.nombre}</strong>
                <span className={styles.premioDescripcion}>{premio.descripcion}</span>
              </div>
            </div>
            <Boton
              variante="primario"
              className={styles.botonUsar}
              onClick={() => handleUsarPremio(premio.id, premio.clave)}
              disabled={usandoPremio === premio.id}
            >
              {usandoPremio === premio.id ? 'Activando…' : 'Usar ahora'}
            </Boton>
          </div>
        ))}
      </div>
    </div>
  );
}