import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
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

  useEffect(() => {
    if (cargandoGrupos) return;
    if (grupoActivoId && !misGrupos.some((grupo) => grupo.id === grupoActivoId)) {
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
    seleccionarGrupo(data.id);
    return data;
  }

  async function unirseAGrupo(codigoInvitacion) {
    const { data } = await api.post('/grupos/unirse', { codigoInvitacion });
    await refrescarGrupos();
    seleccionarGrupo(data.id);
    return data;
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
