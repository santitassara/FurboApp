import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import styles from './RutaAdmin.module.css';

export default function RutaAdmin({ children }) {
  const { cargando } = useAuth();
  const { grupoActivo, cargandoGrupos } = useGrupo();

  if (cargando || cargandoGrupos) {
    return <div className={styles.cargando}>Cargando…</div>;
  }

  if (grupoActivo?.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}
