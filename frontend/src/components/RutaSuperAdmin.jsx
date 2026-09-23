import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './RutaSuperAdmin.module.css';

export default function RutaSuperAdmin({ children }) {
  const { cargando, perfil } = useAuth();

  if (cargando) {
    return <div className={styles.cargando}>Cargando…</div>;
  }

  if (!perfil?.esSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
