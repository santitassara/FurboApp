import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { onAuthStateChanged, signInWithCredential, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, googleProvider } from '../config/firebase';
import api from '../services/api';
import { registrarSuscripcionPush } from '../services/notificacionesService';

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
      await registrarSuscripcionPush(tokenPropio);
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
          const token = await usuario.getIdToken();
          const { data } = await api.post('/auth/sync');
          setPerfil(data);
          setErrorAuth('');
          await registrarSuscripcionPush(token);
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

  const iniciarSesion = useCallback(async () => {
    if (!auth) {
      throw new Error('Firebase no está configurado. Completá frontend/.env con tus credenciales.');
    }
    if (Capacitor.isNativePlatform()) {
      const resultado = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
      const credencial = GoogleAuthProvider.credential(resultado.credential?.idToken);
      await signInWithCredential(auth, credencial);
      return;
    }
    if (!googleProvider) {
      throw new Error('Firebase no está configurado. Completá frontend/.env con tus credenciales.');
    }
    await signInWithPopup(auth, googleProvider);
  }, []);

  const iniciarSesionConPassword = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setPerfil(data.usuario);
    setErrorAuth('');
    await registrarSuscripcionPush(data.token);
  }, []);

  const registrarse = useCallback(async (nombre, email, password) => {
    const { data } = await api.post('/auth/register', { nombre, email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setPerfil(data.usuario);
    setErrorAuth('');
    await registrarSuscripcionPush(data.token);
  }, []);

  const cerrarSesion = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY);
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut();
    }
    if (auth && usuarioFirebase) {
      await signOut(auth);
    } else {
      setUsuarioFirebase(null);
      setPerfil(null);
    }
  }, [usuarioFirebase]);

  const refrescarPerfil = useCallback(async () => {
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
  }, [usuarioFirebase]);

  const actualizarPosicionesPerfil = useCallback(async (posicionPrincipal, posicionSecundaria) => {
    const { data } = await api.patch('/usuarios/me/posiciones', { posicionPrincipal, posicionSecundaria });
    setPerfil(data);
  }, []);

  const actualizarMiPerfil = useCallback(async (datos) => {
    const { data } = await api.patch('/usuarios/me/perfil', datos);
    setPerfil(data);
  }, []);

  const subirFotoPerfil = useCallback(async (archivo) => {
    const formData = new FormData();
    formData.append('foto', archivo);
    const { data } = await api.post('/usuarios/me/foto', formData);
    setPerfil(data);
  }, []);

  const valor = useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return contexto;
}
