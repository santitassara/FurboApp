import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';

export default function RutaAdmin({ children }) {
  const { cargando } = useAuth();
  const { grupoActivo, cargandoGrupos } = useGrupo();

  if (cargando || cargandoGrupos) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (grupoActivo?.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}
