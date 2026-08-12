import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RutaPrivada({ children }) {
  const { perfil, cargando } = useAuth();

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (!perfil) {
    return <Navigate to="/" replace />;
  }

  return children;
}
