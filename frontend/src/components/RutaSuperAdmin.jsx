import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RutaSuperAdmin({ children }) {
  const { cargando, perfil } = useAuth();

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (!perfil?.esSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
