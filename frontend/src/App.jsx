import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Home from './pages/Home';
import AdminPanel from './pages/AdminPanel';
import RutaPrivada from './components/RutaPrivada';
import RutaAdmin from './components/RutaAdmin';
import Boton from './components/Boton';

export default function App() {
  const { usuarioFirebase, cargando, errorAuth, cerrarSesion } = useAuth();

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center text-white/70">Cargando…</div>;
  }

  if (errorAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{errorAuth}</p>
        <Boton onClick={cerrarSesion}>Reintentar (salir e ingresar de nuevo)</Boton>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={usuarioFirebase ? <Navigate to="/inicio" replace /> : <Login />} />
      <Route
        path="/inicio"
        element={
          <RutaPrivada>
            <Home />
          </RutaPrivada>
        }
      />
      <Route
        path="/admin"
        element={
          <RutaAdmin>
            <AdminPanel />
          </RutaAdmin>
        }
      />
    </Routes>
  );
}
