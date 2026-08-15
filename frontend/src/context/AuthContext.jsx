import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import api from '../services/api';

const AuthContext = createContext(null);
export const TOKEN_KEY = 'furboapp_token';

export function AuthProvider({ children }) {
  const [usuarioFirebase, setUsuarioFirebase] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAuth, setErrorAuth] = useState('');

  async function intentarRestaurarSesionPropia() {
    const tokenPropio = localStorage.getItem(TOKEN_KEY);
    if (!tokenPropio) {
      setPerfil(null);
      return;
    }
    try {
      const { data } = await api.post('/auth/sync');
      setPerfil(data);
      setErrorAuth('');
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      setPerfil(null);
    }
  }

  useEffect(() => {
    if (!auth) {
      intentarRestaurarSesionPropia().finally(() => setCargando(false));
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (usuario) => {
      setUsuarioFirebase(usuario);
      try {
        if (usuario) {
          const { data } = await api.post('/auth/sync');
          setPerfil(data);
          setErrorAuth('');
        } else {
          await intentarRestaurarSesionPropia();
        }
      } catch (error) {
        setErrorAuth(error.message || 'No se pudo sincronizar el perfil.');
      } finally {
        setCargando(false);
      }
    });
    return unsubscribe;
  }, []);

  async function refrescarPerfil() {
    if (!usuarioFirebase && !localStorage.getItem(TOKEN_KEY)) {
      return;
    }
    try {
      const { data } = await api.post('/auth/sync');
      setPerfil(data);
      setErrorAuth('');
    } catch (error) {
      // No dejamos que un refresco fallido rompa la app; el perfil queda como estaba.
    }
  }

  async function iniciarSesion() {
    if (!auth || !googleProvider) {
      throw new Error('Firebase no está configurado. Completá frontend/.env con tus credenciales.');
    }
    await signInWithPopup(auth, googleProvider);
  }

  async function iniciarSesionConPassword(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setPerfil(data.usuario);
    setErrorAuth('');
  }

  async function registrarse(nombre, email, password) {
    const { data } = await api.post('/auth/register', { nombre, email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setPerfil(data.usuario);
    setErrorAuth('');
  }

  async function actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria) {
    const { data } = await api.patch('/usuarios/me/posiciones', { posicionPrincipal, posicionSecundaria });
    setPerfil(data);
  }

  async function actualizarMiPerfil(datos) {
    const { data } = await api.patch('/usuarios/me/perfil', datos);
    setPerfil(data);
  }

  async function subirFotoPerfil(archivo) {
    const formData = new FormData();
    formData.append('foto', archivo);
    const { data } = await api.post('/usuarios/me/foto', formData);
    setPerfil(data);
  }

  async function cerrarSesion() {
    localStorage.removeItem(TOKEN_KEY);
    if (auth && usuarioFirebase) {
      await signOut(auth);
    } else {
      setUsuarioFirebase(null);
      setPerfil(null);
    }
  }

  const valor = {
    usuarioFirebase,
    perfil,
    cargando,
    errorAuth,
    iniciarSesion,
    iniciarSesionConPassword,
    registrarse,
    cerrarSesion,
    refrescarPerfil,
    actualizarPosicionesPerfil,
    actualizarMiPerfil,
    subirFotoPerfil,
    esAdmin: perfil?.rol === 'admin',
    estaSancionado: Boolean(perfil?.estaSancionado),
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return contexto;
}
