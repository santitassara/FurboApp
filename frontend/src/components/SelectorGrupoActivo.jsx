import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useGrupo } from '../context/GrupoContext';
import styles from './SelectorGrupoActivo.module.css';

function BadgeModo({ modo }) {
  const esPlantel = modo === 'plantel';
  return (
    <span
      className={clsx(
        styles.badgeModo,
        esPlantel ? styles.badgePlantel : styles.badgeConvocatoria
      )}
      title={esPlantel ? 'Grupo en modo plantel' : 'Grupo en modo convocatoria'}
    >
      {esPlantel ? '🛡️ Plantel' : '⚽ Convocatoria'}
    </span>
  );
}

export default function SelectorGrupoActivo() {
  const { misGrupos, grupoActivo, seleccionarGrupo, abandonarGrupo } = useGrupo();
  const [abierto, setAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  if (!grupoActivo) return null;

  async function manejarAbandonar() {
    if (!window.confirm(`¿Abandonar "${grupoActivo.nombre}"? Esta acción no se puede deshacer.`)) return;
    setError('');
    setProcesando(true);
    try {
      await abandonarGrupo(grupoActivo.id);
      setAbierto(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className={styles.contenedor}>
      <button
        onClick={() => setAbierto((valor) => !valor)}
        className={styles.botonActivo}
      >
        <span className={styles.nombreGrupo}>{grupoActivo.nombre}</span>
        <span className={styles.derechaBoton}>
          <BadgeModo modo={grupoActivo.modo} />
          <span className={styles.flechaIcono}>▾</span>
        </span>
      </button>
      {abierto && (
        <ul className={styles.menu}>
          {misGrupos.map((grupo) => (
            <li key={grupo.id}>
              <button
                onClick={() => {
                  seleccionarGrupo(grupo.id);
                  setAbierto(false);
                }}
                className={clsx(
                  styles.opcionGrupo,
                  grupo.id === grupoActivo.id ? styles.opcionActiva : styles.opcionInactiva
                )}
              >
                <span className={styles.nombreOpcion}>{grupo.nombre}</span>
                <BadgeModo modo={grupo.modo} />
              </button>
            </li>
          ))}
          <li>
            <Link
              to="/grupos"
              className={styles.enlaceCrear}
            >
              Crear o unirme a otro grupo
            </Link>
          </li>
          <li className={styles.separador}>
            <button
              onClick={manejarAbandonar}
              disabled={procesando}
              className={styles.botonAbandonar}
            >
              {procesando ? 'Abandonando…' : 'Abandonar grupo'}
            </button>
          </li>
          {error && (
            <li className={styles.errorContenedor}>
              <p className={styles.errorTexto}>{error}</p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
