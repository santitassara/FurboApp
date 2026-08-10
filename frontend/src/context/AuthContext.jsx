import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuarioFirebase, setUsuarioFirebase] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usuario) => {
      setUsuarioFirebase(usuario);
      if (usuario) {
        const { data } = await api.post('/auth/sync');
        setPerfil(data);
      } else {
        setPerfil(null);
      }
      setCargando(false);
    });
    return unsubscribe;
  }, []);

  async function iniciarSesion() {
    await signInWithPopup(auth, googleProvider);
  }

  async function cerrarSesion() {
    await signOut(auth);
  }

  const valor = {
    usuarioFirebase,
    perfil,
    cargando,
    iniciarSesion,
    cerrarSesion,
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
