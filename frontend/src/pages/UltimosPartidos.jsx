import { useEffect, useState } from 'react';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import ItemHistorialPartido from '../components/ItemHistorialPartido';
import styles from './UltimosPartidos.module.css';

export default function UltimosPartidos() {
  const { grupoActivo } = useGrupo();
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!grupoActivo) return;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const { data } = await api.get(rutaGrupo(grupoActivo.id, '/partidos/historial'));
        setPartidos(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [grupoActivo]);

  return (
    <div className={styles.contenedor}>
      <header>
        <h1 className={styles.titulo}>Últimos partidos</h1>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {cargando ? (
        <p className={styles.mensaje}>Cargando…</p>
      ) : partidos.length === 0 ? (
        <p className={styles.mensaje}>Todavía no hay partidos jugados.</p>
      ) : (
        <div className={styles.lista}>
          {partidos.map((partido) => (
            <ItemHistorialPartido key={partido.id} partido={partido} />
          ))}
        </div>
      )}
    </div>
  );
}
