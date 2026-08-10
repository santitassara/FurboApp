import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RutaPrivada({ children }) {
  const { usuarioFirebase, cargando } = useAuth();

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (!usuarioFirebase) {
    return <Navigate to="/" replace />;
  }

  return children;
}
