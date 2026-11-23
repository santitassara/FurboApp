import { useEffect, useState, useMemo, useCallback } from 'react';
import { useGrupo } from '../context/GrupoContext';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

const efectosCache = new Map();
const cacheInvalidationListeners = new Set();

function claveCache(usuarioId, grupoId) {
  return `${grupoId}:${usuarioId}`;
}

function notifyCacheInvalidation() {
  cacheInvalidationListeners.forEach(cb => cb());
}

function subscribeCacheInvalidation(cb) {
  cacheInvalidationListeners.add(cb);
  return () => cacheInvalidationListeners.delete(cb);
}

function extraerEfectosVisuales(efectos) {
  if (!efectos || !efectos.length) return {};
  const visuales = { badges: [] };
  efectos.forEach((efecto) => {
    try {
      const metadata = typeof efecto.metadata === 'string' ? JSON.parse(efecto.metadata) : efecto.metadata;
      switch (efecto.tipo) {
        case 'badge':
          if (metadata?.badgeId && metadata.enabled !== false) visuales.badges.push(metadata.badgeId);
          break;
        case 'color_nombre':
          visuales.colorNombre = metadata?.color;
          break;
        case 'emoji_personalizado':
          visuales.emoji = metadata?.emoji;
          break;
        case 'titulo_personalizado':
          visuales.titulo = metadata?.titulo;
          break;
        case 'fondo_carta':
          visuales.fondo = metadata?.fondo;
          break;
      }
    } catch (e) {
      console.warn('Error parsing efecto metadata:', e);
    }
  });
  return visuales;
}

function obtenerBadgeEmoji(badgeId) {
  const badges = {
    apostador_pro: '🏅',
    mvp_hunter: '🏆',
    goleador: '⚽',
    estratega: '🧠',
    ballena: '🐋',
  };
  // Handle both formats: with and without 'badge_' prefix
  const normalizedId = badgeId.replace('badge_', '');
  return badges[normalizedId] || '🏅';
}

export function useEfectosVisuales(usuarioId, grupoId = null) {
  const { grupoActivo } = useGrupo();
  const grupoIdReal = grupoId || grupoActivo?.id;
  const cacheKey = useMemo(() => (usuarioId && grupoIdReal ? claveCache(usuarioId, grupoIdReal) : null), [usuarioId, grupoIdReal]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [efectos, setEfectos] = useState(null);
  const [cargando, setCargando] = useState(false);

  // Subscribe to cache invalidation events
  useEffect(() => {
    return subscribeCacheInvalidation(() => {
      setRefreshTrigger(prev => prev + 1);
    });
  }, []);

  useEffect(() => {
    if (!cacheKey) {
      setEfectos({});
      return;
    }

    // Check cache first
    if (efectosCache.has(cacheKey)) {
      setEfectos(extraerEfectosVisuales(efectosCache.get(cacheKey)));
      return;
    }

    setCargando(true);
    let cancelado = false;

    api
      .get(rutaGrupo(grupoIdReal, `/premios/efectos-activos/${usuarioId}`))
      .then(({ data }) => {
        if (!cancelado) {
          efectosCache.set(cacheKey, data);
          setEfectos(extraerEfectosVisuales(data));
        }
      })
      .catch((err) => {
        if (!cancelado) {
          console.error('Error cargando efectos visuales:', err.message);
          setEfectos({});
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [cacheKey, grupoIdReal, refreshTrigger]);

  const visuales = useMemo(() => ({
    badges: efectos?.badges || [],
    badgeEmojis: (efectos?.badges || []).map(obtenerBadgeEmoji),
    colorNombre: efectos?.colorNombre || null,
    emoji: efectos?.emoji || null,
    titulo: efectos?.titulo || null,
    fondo: efectos?.fondo || null,
    cargando,
  }), [efectos, cargando]);

  return visuales;
}

export function invalidateEfectosCache(usuarioId, grupoId) {
  const key = claveCache(usuarioId, grupoId);
  efectosCache.delete(key);
  notifyCacheInvalidation();
}

export function subscribeToCacheInvalidation(cb) {
  return subscribeCacheInvalidation(cb);
}

export function clearEfectosCache() {
  efectosCache.clear();
}