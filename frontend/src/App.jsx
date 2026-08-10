import { useAuth } from './context/AuthContext';
import Login from './pages/Login';

export default function App() {
  const { usuarioFirebase, cargando } = useAuth();

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (!usuarioFirebase) {
    return <Login />;
  }

  return <div className="flex min-h-screen items-center justify-center">Sesión iniciada ✅</div>;
}
