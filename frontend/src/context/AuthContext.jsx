import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuarioFirebase, setUsuarioFirebase] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAuth, setErrorAuth] = useState('');

  useEffect(() => {
    if (!auth) {
      setCargando(false);
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
          setPerfil(null);
          setErrorAuth('');
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
    if (!usuarioFirebase) {
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

  async function cerrarSesion() {
    await signOut(auth);
  }

  const valor = {
    usuarioFirebase,
    perfil,
    cargando,
    errorAuth,
    iniciarSesion,
    cerrarSesion,
    refrescarPerfil,
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
