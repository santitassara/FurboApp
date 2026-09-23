import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './RutaPrivada.module.css';

export default function RutaPrivada({ children }) {
  const { perfil, cargando } = useAuth();

  if (cargando) {
    return <div className={styles.cargando}>Cargando…</div>;
  }

  if (!perfil) {
    return <Navigate to="/" replace />;
  }

  return children;
}
