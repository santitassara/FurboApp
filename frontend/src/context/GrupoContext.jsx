import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api, { SERVER_URL } from '../services/api';
import obtenerTokenActual from '../utils/obtenerTokenActual';
import { useAuth } from './AuthContext';

const GrupoContext = createContext(null);
export const GRUPO_ACTIVO_KEY = 'furboapp_grupo_activo_id';

export function GrupoProvider({ children }) {
  const { perfil } = useAuth();
  const [misGrupos, setMisGrupos] = useState([]);
  const [grupoActivoId, setGrupoActivoId] = useState(() => localStorage.getItem(GRUPO_ACTIVO_KEY));
  const [cargandoGrupos, setCargandoGrupos] = useState(true);
  const [errorGrupos, setErrorGrupos] = useState('');

  const refrescarGrupos = useCallback(async () => {
    if (!perfil) {
      setMisGrupos([]);
      setCargandoGrupos(false);
      return;
    }
    setCargandoGrupos(true);
    try {
      const { data } = await api.get('/grupos/mios');
      setMisGrupos(data);
      setErrorGrupos('');
    } catch (error) {
      setErrorGrupos(error.message);
    } finally {
      setCargandoGrupos(false);
    }
  }, [perfil]);

  useEffect(() => {
    refrescarGrupos();
  }, [refrescarGrupos]);

  const socketRef = useRef(null);
  const gruposUnidosRef = useRef(new Set());

  const unirseATodosLosGrupos = useCallback(async (grupos) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    const token = await obtenerTokenActual();
    grupos.forEach((grupo) => {
      if (gruposUnidosRef.current.has(grupo.id)) return;
      socket.emit('unirseGrupo', { grupoId: grupo.id, token });
      gruposUnidosRef.current.add(grupo.id);
    });
  }, []);

  useEffect(() => {
    if (!perfil) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return undefined;
    }
    const socket = io(SERVER_URL);
    socketRef.current = socket;
    socket.on('connect', () => {
      gruposUnidosRef.current = new Set();
      unirseATodosLosGrupos(misGrupos);
    });
    socket.on('grupoActualizado', () => {
      refrescarGrupos();
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  useEffect(() => {
    unirseATodosLosGrupos(misGrupos);
  }, [misGrupos, unirseATodosLosGrupos]);

  useEffect(() => {
    if (cargandoGrupos) return;
    const sigueSiendoValido = grupoActivoId && misGrupos.some((grupo) => grupo.id === grupoActivoId);
    if (!sigueSiendoValido) {
      const primero = misGrupos[0]?.id || null;
      if (primero) localStorage.setItem(GRUPO_ACTIVO_KEY, primero);
      else localStorage.removeItem(GRUPO_ACTIVO_KEY);
      setGrupoActivoId(primero);
    }
  }, [misGrupos, grupoActivoId, cargandoGrupos]);

  function seleccionarGrupo(grupoId) {
    setGrupoActivoId(grupoId);
    localStorage.setItem(GRUPO_ACTIVO_KEY, grupoId);
  }

  async function crearGrupo(nombre) {
    const { data } = await api.post('/grupos', { nombre });
    await refrescarGrupos();
    return data;
  }

  async function unirseAGrupo(codigoInvitacion) {
    const { data } = await api.post('/grupos/unirse', { codigoInvitacion });
    await refrescarGrupos();
    seleccionarGrupo(data.id);
    return data;
  }

  async function abandonarGrupo(grupoId) {
    await api.delete(`/grupos/${grupoId}/abandonar`);
    if (grupoActivoId === grupoId) {
      setGrupoActivoId(null);
      localStorage.removeItem(GRUPO_ACTIVO_KEY);
    }
    await refrescarGrupos();
  }

  const grupoActivo = misGrupos.find((grupo) => grupo.id === grupoActivoId) || null;

  const valor = {
    misGrupos,
    grupoActivo,
    cargandoGrupos,
    errorGrupos,
    seleccionarGrupo,
    crearGrupo,
    unirseAGrupo,
    abandonarGrupo,
    refrescarGrupos,
  };

  return <GrupoContext.Provider value={valor}>{children}</GrupoContext.Provider>;
}

export function useGrupo() {
  const contexto = useContext(GrupoContext);
  if (!contexto) {
    throw new Error('useGrupo debe usarse dentro de GrupoProvider');
  }
  return contexto;
}
