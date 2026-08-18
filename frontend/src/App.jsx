import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useGrupo } from './context/GrupoContext';
import Login from './pages/Login';
import SeleccionarGrupo from './pages/SeleccionarGrupo';
import Home from './pages/Home';
import Perfil from './pages/Perfil';
import PerfilJugador from './pages/PerfilJugador';
import Jugadores from './pages/Jugadores';
import UltimosPartidos from './pages/UltimosPartidos';
import AdminPanel from './pages/AdminPanel';
import RutaPrivada from './components/RutaPrivada';
import RutaAdmin from './components/RutaAdmin';
import Layout from './components/Layout';
import Boton from './components/Boton';
import InstallAppPrompt from './components/InstallAppPrompt';
import './components/InstallAppPrompt.css';

export default function App() {
  const { perfil, cargando, errorAuth, cerrarSesion } = useAuth();
  const { grupoActivo, cargandoGrupos } = useGrupo();

  useEffect(() => {
    window.__furboInstallPrompt = new InstallAppPrompt({
      dismissDaysAndroid: 7,
      dismissDaysIos: 7,
    });
  }, []);

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

  if (perfil && !cargandoGrupos && !grupoActivo) {
    return (
      <Routes>
        <Route path="*" element={<SeleccionarGrupo />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={perfil ? <Navigate to="/inicio" replace /> : <Login />} />
      <Route path="/grupos" element={<RutaPrivada><SeleccionarGrupo /></RutaPrivada>} />
      <Route
        path="/inicio"
        element={
          <RutaPrivada>
            <Layout>
              <Home />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/perfil"
        element={
          <RutaPrivada>
            <Layout>
              <Perfil />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/jugadores"
        element={
          <RutaPrivada>
            <Layout>
              <Jugadores />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/jugadores/:uid"
        element={
          <RutaPrivada>
            <Layout>
              <PerfilJugador />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/historial"
        element={
          <RutaPrivada>
            <Layout>
              <UltimosPartidos />
            </Layout>
          </RutaPrivada>
        }
      />
      <Route
        path="/admin"
        element={
          <RutaAdmin>
            <Layout>
              <AdminPanel />
            </Layout>
          </RutaAdmin>
        }
      />
    </Routes>
  );
}
