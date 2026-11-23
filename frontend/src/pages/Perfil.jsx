import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import Boton from '../components/Boton';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';
import RadarHabilidades from '../components/RadarHabilidades';
import { POSICIONES } from '../constants/posiciones';
import { RESISTENCIA } from '../constants/resistencia';
import { RITMO_JUEGO } from '../constants/ritmoJuego';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';
import { etiquetaPiernaHabil } from '../constants/piernaHabil';
import { SERVER_URL } from '../services/api';
import api from '../services/api';
import { obtenerEfectosActivos, actualizarEfectoMetadata, obtenerMisPremios } from '../services/apuestasApi';
import { subscribeToCacheInvalidation, invalidateEfectosCache } from '../hooks/useEfectosVisuales';
import clsx from 'clsx';
import styles from './Perfil.module.css';

function formatearEfectoMetadata(efecto, obtenerNombreJugador) {
  if (!efecto.metadata || Object.keys(efecto.metadata).length === 0) {
    return { texto: 'Activo', colorSwatch: null };
  }

  const m = efecto.metadata;

  switch (efecto.tipo) {
    case 'color_nombre':
      return {
        texto: `Color: ${m.colorNombre || m.color || 'Personalizado'}`,
        colorSwatch: m.color || m.colorNombre,
      };
    case 'fondo_carta':
      return {
        texto: `Fondo: ${m.fondoNombre || m.fondo || 'Personalizado'}`,
        colorSwatch: null,
      };
    case 'emoji_personalizado':
      return { texto: `Emoji: ${m.emoji || 'Personalizado'}`, colorSwatch: null };
    case 'titulo_personalizado':
      return { texto: `Título: ${m.titulo || 'Personalizado'}`, colorSwatch: null };
    case 'badge':
      return { texto: `Badge: ${m.badgeNombre || m.badgeId || 'Personalizado'}`, colorSwatch: null };
    case 'elegir_equipo':
      return { texto: `Equipo: ${m.equipo === 'A' ? 'Equipo A' : m.equipo === 'B' ? 'Equipo B' : m.equipo}`, colorSwatch: null };
    case 'cambiar_jugador_equipo':
      if (m.jugadorId && m.jugadorDestinoId) {
        const nombreJugador = obtenerNombreJugador(m.jugadorId);
        const nombreDestino = obtenerNombreJugador(m.jugadorDestinoId);
        return {
          texto: `Intercambió: ${nombreJugador} ↔ ${nombreDestino}`,
          colorSwatch: null,
        };
      } else if (m.jugadorId) {
        return { texto: `Jugador a mover: ${obtenerNombreJugador(m.jugadorId)}`, colorSwatch: null };
      }
      return { texto: 'Pendiente de ejecución', colorSwatch: null };
    case 'armar_equipo_completo':
      return { texto: 'Formación completa armada', colorSwatch: null };
    case 'bloquear_formacion':
      return { texto: 'Formación bloqueada por 24h', colorSwatch: null };
    case 'voto_doble_formacion':
      return { texto: 'Voto doble en formación', colorSwatch: null };
    case 'ver_votos_formacion':
      return { texto: 'Puede ver votos de formación', colorSwatch: null };
    case 'ver_faltan_votar':
      return { texto: 'Puede ver quién falta votar', colorSwatch: null };
    case 'cancelar_apuesta':
      return { texto: 'Puede cancelar apuesta propia', colorSwatch: null };
    case 'perdonar_propia_sancion':
      return { texto: 'Perdonar propia sanción', colorSwatch: null };
    case 'perdonar_sancion_otro':
      return { texto: 'Perdonar sanción a otro', colorSwatch: null };
    case 'freebet_50':
      return { texto: 'Apuesta gratis disponible', colorSwatch: null };
    case 'cuota_mejorada':
      return { texto: 'Cuota mejorada disponible', colorSwatch: null };
    case 'seguro_apuesta':
      return { texto: 'Seguro de apuesta disponible', colorSwatch: null };
    case 'ver_pool_apuestas':
      return { texto: 'Puede ver distribución de apuestas', colorSwatch: null };
    case 'voto_valoracion_doble':
      return { texto: 'Voto de valoración doble', colorSwatch: null };
    case 'elegir_mvp_directo':
      return { texto: 'Puede elegir MVP directo', colorSwatch: null };
    case 'ver_votos_valoracion':
      return { texto: 'Puede ver votos de valoración', colorSwatch: null };
    case 'cambiar_rival':
      return { texto: 'Puede cambiar rival', colorSwatch: null };
    case 'dios_del_partido':
      return { texto: 'Dios del Partido activo', colorSwatch: null };
    case 'admin_temporal':
      return { texto: 'Admin temporal activo', colorSwatch: null };
    default:
      return { texto: typeof m === 'string' ? m : JSON.stringify(m), colorSwatch: null };
  }
}

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

function PerfilDatos({ perfil, grupoActivo, efectos }) {
  const [estadisticas, setEstadisticas] = useState(null);
  const [estadisticasTotales, setEstadisticasTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');

    Promise.all([
      grupoActivo ? api.get(`/usuarios/${perfil.uid}/estadisticas/${grupoActivo.id}`) : Promise.resolve(null),
      api.get(`/usuarios/${perfil.uid}/estadisticas`),
    ])
      .then(([statsRes, statsTotalesRes]) => {
        if (activo) {
          if (statsRes) setEstadisticas(statsRes.data);
          setEstadisticasTotales(statsTotalesRes.data);
        }
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [perfil.uid, grupoActivo]);

  const tiles = perfil
    ? [
        { etiqueta: 'Edad', valor: perfil.edad != null ? `${perfil.edad} años` : 'Sin dato' },
        {
          etiqueta: 'Posición',
          valor:
            [etiquetaPosicion(perfil.posicionPrincipal), etiquetaPosicion(perfil.posicionSecundaria)]
              .filter((p) => p !== 'Sin posición')
              .join(' / ') || 'Sin dato',
          ancha: Boolean(perfil.posicionPrincipal && perfil.posicionSecundaria),
        },
        { etiqueta: 'Pierna hábil', valor: etiquetaPiernaHabil(perfil.piernaHabil) },
        { etiqueta: 'Resistencia', valor: etiquetaResistencia(perfil.resistencia) },
        { etiqueta: 'Ritmo de juego', valor: etiquetaRitmoJuego(perfil.ritmoJuego) },
      ]
    : [];

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Mi Perfil</h1>

      {cargando && <p className={styles.cargando}>Cargando…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {perfil && (
        <div className={styles.grid}>
          <div className={styles.tarjetaWrap}>
            <TarjetaJugadorFIFA
              nombre={perfil.nombreCompleto || perfil.nombre}
              posicion={perfil.posicionPrincipal}
              habilidades={perfil}
              fotoUrl={perfil.fotoUrl ? `${SERVER_URL}${perfil.fotoUrl}` : null}
              efectos={efectos}
            />
          </div>

          <div className={styles.columnaDerecha}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitulo}>Resumen</h2>
              <div className={styles.tilesGrid}>
                {tiles.map((tile) => (
                  <div
                    key={tile.etiqueta}
                    className={clsx(styles.tile, tile.ancha && styles.tileAncha)}
                  >
                    <p className={styles.tileLabel}>{tile.etiqueta}</p>
                    <p className={styles.tileValor}>{tile.valor}</p>
                  </div>
                ))}
              </div>
            </div>

            {estadisticas && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitulo}>
                  Estadísticas en grupo {grupoActivo?.nombre}
                </h2>
                <div className={styles.tilesGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Partidos Jugados</p>
                    <p className={styles.statValor}>{estadisticas.pj}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Goles</p>
                    <p className={styles.statValor}>{estadisticas.goles}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Asistencias</p>
                    <p className={styles.statValor}>{estadisticas.asistencias}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Valoración</p>
                    <p className={styles.statValor}>{estadisticas.valoracion}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>MVPs</p>
                    <p className={styles.statValor}>{estadisticas.mvps}</p>
                  </div>
                </div>
              </div>
            )}

            {estadisticasTotales && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitulo}>Totales</h2>
                <div className={styles.tilesGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>
                      Goles en grupo {grupoActivo?.nombre}
                    </p>
                    <p className={styles.statValor}>{estadisticas?.goles || 0}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Goles Totales</p>
                    <p className={styles.statValor}>{estadisticasTotales.goles}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>
                      MVPs en grupo {grupoActivo?.nombre}
                    </p>
                    <p className={styles.statValor}>{estadisticas?.mvps || 0}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>MVPs Totales</p>
                    <p className={styles.statValor}>{estadisticasTotales.mvps}</p>
                  </div>
                </div>
              </div>
            )}

            <RadarHabilidades perfil={perfil} />
          </div>
        </div>
      )}
    </div>
  );
}

import NombreConEfectos from '../components/NombreConEfectos';

function PerfilPremios({ perfil, grupoActivo, efectos = [], cargando = false }) {

  const ICONOS_TIPO = {
    badge: '🏅',
    color_nombre: '🎨',
    fondo_carta: '🖼️',
    emoji_personalizado: '😀',
    titulo_personalizado: '📛',
    admin_temporal: '👑',
    voto_doble_formacion: '🗳️',
    ver_votos_formacion: '👁️',
    ver_faltan_votar: '📋',
    cancelar_apuesta: '↩️',
    elegir_equipo: '🎯',
    cambiar_jugador_equipo: '🔄',
    armar_equipo_completo: '⚽',
    bloquear_formacion: '🔒',
    perdonar_propia_sancion: '🎫',
    perdonar_sancion_otro: '🤝',
    freebet_50: '🎁',
    cuota_mejorada: '📈',
    seguro_apuesta: '🛡️',
    ver_pool_apuestas: '💰',
    voto_valoracion_doble: '⭐',
    elegir_mvp_directo: '🏆',
    ver_votos_valoracion: '👁️',
    cambiar_rival: '🔄',
    dios_del_partido: '⚡',
  };

  const NOMBRES_EFECTOS = {
    badge: 'Insignia (Badge)',
    color_nombre: 'Color de nombre',
    fondo_carta: 'Fondo de carta',
    emoji_personalizado: 'Emoji personalizado',
    titulo_personalizado: 'Título personalizado',
    admin_temporal: 'Admin temporal',
    voto_doble_formacion: 'Voto doble en formación',
    ver_votos_formacion: 'Ver votos de formación',
    ver_faltan_votar: 'Ver quién falta votar',
    cancelar_apuesta: 'Cancelar apuesta propia',
    elegir_equipo: 'Elegir tu equipo',
    cambiar_jugador_equipo: 'Cambiar jugador de equipo',
    armar_equipo_completo: 'Armar equipo completo',
    bloquear_formacion: 'Bloquear formación',
    perdonar_propia_sancion: 'Perdonar propia sanción',
    perdonar_sancion_otro: 'Perdonar sanción a otro',
    freebet_50: 'Apuesta gratis (Freebet)',
    cuota_mejorada: 'Cuota mejorada',
    seguro_apuesta: 'Seguro de apuesta',
    ver_pool_apuestas: 'Ver distribución de apuestas',
    voto_valoracion_doble: 'Voto de valoración doble',
    elegir_mvp_directo: 'Elegir MVP directo',
    ver_votos_valoracion: 'Ver votos de valoración',
    cambiar_rival: 'Cambiar rival',
    dios_del_partido: 'Dios del Partido',
  };

  const formatearFecha = (fechaISO) => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Build player name lookup from effects metadata (backend should enrich with names)
  const obtenerNombreJugador = useCallback((jugadorId) => {
    if (!jugadorId) return 'Jugador desconocido';
    // Check if metadata already has player names (enriched by backend)
    for (const efecto of efectos) {
      if (efecto.metadata) {
        if (efecto.metadata.jugadorId === jugadorId && efecto.metadata.jugadorNombre) {
          return efecto.metadata.jugadorNombre;
        }
        if (efecto.metadata.jugadorDestinoId === jugadorId && efecto.metadata.jugadorDestinoNombre) {
          return efecto.metadata.jugadorDestinoNombre;
        }
        // Also check for jugadorNombre directly on metadata
        if (efecto.metadata.jugadorNombre && efecto.metadata.jugadorId === jugadorId) {
          return efecto.metadata.jugadorNombre;
        }
        if (efecto.metadata.jugadorDestinoNombre && efecto.metadata.jugadorDestinoId === jugadorId) {
          return efecto.metadata.jugadorDestinoNombre;
        }
      }
    }
    // Fallback to just showing ID if no name found
    return `Jugador ${jugadorId.slice(0, 8)}`;
  }, [efectos]);

  if (cargando) {
    return (
      <div className={styles.container}>
        <h1 className={styles.titulo}>Mis Premios y Efectos</h1>
        <p className={styles.cargando}>Cargando…</p>
      </div>
    );
  }

  // Separar efectos visuales (que se ven en perfil) de efectos funcionales
  const efectosVisuales = ['badge', 'color_nombre', 'fondo_carta', 'emoji_personalizado', 'titulo_personalizado'];
  const visuales = efectos.filter((e) => efectosVisuales.includes(e.tipo));
  const funcionales = efectos.filter((e) => !efectosVisuales.includes(e.tipo));

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Mis Premios y Efectos</h1>

      <div className={styles.previewEfectos}>
        <p className={styles.previewLabel}>Vista previa de tu nombre con efectos:</p>
        <p className={styles.previewNombre}>
          <NombreConEfectos nombre={perfil?.nombreCompleto || perfil?.nombre} usuarioId={perfil?.uid} grupoId={grupoActivo?.id} showTitulo showBadge showEmojiPersonalizado />
        </p>
      </div>

      {efectos.length === 0 && (
        <div className={styles.sinEfectos}>
          <p>No tienes efectos activos.</p>
          <p className={styles.sinEfectosDetalle}>Ve a la tienda de premios para canjear puntos y activar efectos.</p>
        </div>
      )}

      {visuales.length > 0 && (
        <section className={styles.seccion}>
          <h2 className={styles.seccionTitulo}>🏅 Efectos visuales en tu perfil</h2>
          <p className={styles.seccionDescripcion}>Estos efectos se muestran en tu tarjeta de jugador y perfil.</p>
          <div className={styles.listaEfectos}>
            {visuales.map((efecto) => {
              const icono = ICONOS_TIPO[efecto.tipo] || '⚡';
              const nombre = NOMBRES_EFECTOS[efecto.tipo] || efecto.tipo;
              const esPermanente = new Date(efecto.expiraEn).getFullYear() > 2090;
              const tiempoRestante = esPermanente ? 'Permanente' : `Expira: ${formatearFecha(efecto.expiraEn)}`;

              const { texto, colorSwatch } = formatearEfectoMetadata(efecto, obtenerNombreJugador);

              return (
                <div key={efecto.id} className={styles.efectoCard}>
                  <div className={styles.efectoHeader}>
                    <span className={styles.efectoIcono}>{icono}</span>
                    <div className={styles.efectoInfo}>
                      <h3 className={styles.efectoNombre}>{nombre}</h3>
                      <p className={styles.efectoDetalle}>{texto}</p>
                    </div>
                  </div>
                  {colorSwatch && (
                    <div className={styles.colorSwatchWrapper}>
                      <div className={styles.colorSwatch} style={{ backgroundColor: colorSwatch }} />
                    </div>
                  )}
                  <p className={styles.efectoExpira}>{tiempoRestante}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {funcionales.length > 0 && (
        <section className={styles.seccion}>
          <h2 className={styles.seccionTitulo}>⚙️ Efectos funcionales</h2>
          <p className={styles.seccionDescripcion}>Estos efectos modifican el juego (votaciones, apuestas, sanciones, etc.).</p>
          <div className={styles.listaEfectos}>
            {funcionales.map((efecto) => {
              const icono = ICONOS_TIPO[efecto.tipo] || '⚡';
              const nombre = NOMBRES_EFECTOS[efecto.tipo] || efecto.tipo;
              const esPermanente = new Date(efecto.expiraEn).getFullYear() > 2090;
              const tiempoRestante = esPermanente ? 'Permanente' : `Expira: ${formatearFecha(efecto.expiraEn)}`;

              const { texto, colorSwatch } = formatearEfectoMetadata(efecto, obtenerNombreJugador);

              return (
                <div key={efecto.id} className={styles.efectoCard}>
                  <div className={styles.efectoHeader}>
                    <span className={styles.efectoIcono}>{icono}</span>
                    <div className={styles.efectoInfo}>
                      <h3 className={styles.efectoNombre}>{nombre}</h3>
                      <p className={styles.efectoDetalle}>{texto}</p>
                    </div>
                  </div>
                  {colorSwatch && (
                    <div className={styles.colorSwatchWrapper}>
                      <div className={styles.colorSwatch} style={{ backgroundColor: colorSwatch }} />
                    </div>
                  )}
                  <p className={styles.efectoExpira}>{tiempoRestante}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// Opciones para efectos personalizables
// Función para obtener emoji de badge (local, no exportada desde hook)
function obtenerBadgeEmoji(badgeId) {
  const badges = {
    apostador_pro: '🏅',
    mvp_hunter: '🏆',
    goleador: '⚽',
    estratega: '🧠',
    ballena: '🐋',
  };
  const normalizedId = badgeId.replace('badge_', '');
  return badges[normalizedId] || '🏅';

}
const OPCIONES_COLORES = [
  { valor: '#FFD700', nombre: 'Dorado' },
  { valor: '#FF6B6B', nombre: 'Rojo coral' },
  { valor: '#4ECDC4', nombre: 'Turquesa' },
  { valor: '#45B7D1', nombre: 'Celeste' },
  { valor: '#96CEB4', nombre: 'Verde menta' },
  { valor: '#FFEAA7', nombre: 'Amarillo pastel' },
  { valor: '#DDA0DD', nombre: 'Ciruela' },
  { valor: '#98D8C8', nombre: 'Verde mar' },
  { valor: '#F7DC6F', nombre: 'Amostarado' },
  { valor: '#BB8FCE', nombre: 'Lila' },
  { valor: '#85C1E9', nombre: 'Azul claro' },
  { valor: '#F8B500', nombre: 'Naranja' },
  { valor: '#E74C3C', nombre: 'Rojo' },
  { valor: '#2ECC71', nombre: 'Verde' },
  { valor: '#9B59B6', nombre: 'Morado' },
  { valor: '#3498DB', nombre: 'Azul' },
  { valor: '#FFFFFF', nombre: 'Blanco' },
  { valor: '#000000', nombre: 'Negro' },
];

const OPCIONES_FONDOS = [
  { valor: 'degradado_oro', nombre: 'Degradado oro' },
  { valor: 'degradado_fuego', nombre: 'Degradado fuego' },
  { valor: 'patron_rombos', nombre: 'Patrón rombos' },
  { valor: 'brillo_neon', nombre: 'Brillo neón' },
];

const OPCIONES_EMOJIS = [
  '😀', '😎', '🤩', '🥳', '😍', '🤠', '😇', '🤯',
  '😈', '👑', '💎', '🔥', '⚡', '💪', '🏆', '⭐',
  '🎯', '🚀', '💰', '🎪', '🤖', '🦸', '🧙', '🦹',
];

const OPCIONES_BADGES = [
  { valor: 'apostador_pro', nombre: 'Apostador Pro' },
  { valor: 'mvp_hunter', nombre: 'Cazador MVP' },
  { valor: 'goleador', nombre: 'Goleador' },
  { valor: 'estratega', nombre: 'Estratega' },
  { valor: 'ballena', nombre: 'Ballena' },
];

function PerfilEditar({ perfil, actualizarMiPerfil, subirFotoPerfil, efectos = [], grupoActivo, premiosDisponibles = [] }) {
  const inputFotoRef = useRef(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const [datos, setDatos] = useState({
    nombreCompleto: perfil?.nombreCompleto || '',
    fechaNacimiento: perfil?.fechaNacimiento ? perfil.fechaNacimiento.slice(0, 10) : '',
    posicionPrincipal: perfil?.posicionPrincipal || '',
    posicionSecundaria: perfil?.posicionSecundaria || '',
    piernaHabil: perfil?.piernaHabil || '',
    resistencia: perfil?.resistencia || '',
    ritmoJuego: perfil?.ritmoJuego || '',
    velocidad: perfil?.velocidad ?? 50,
    pegada: perfil?.pegada ?? 50,
    tocaPase: perfil?.tocaPase ?? 50,
    gambeta: perfil?.gambeta ?? 50,
    marcaDefensa: perfil?.marcaDefensa ?? 50,
    fisico: perfil?.fisico ?? 50,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  // Estado para efectos personalizables
  const [efectosPersonalizados, setEfectosPersonalizados] = useState({});

  const habilidadesBloqueadas = Boolean(perfil?.habilidadesEditadas);

  const posicionesIguales =
    datos.posicionPrincipal && datos.posicionSecundaria && datos.posicionPrincipal === datos.posicionSecundaria;
  const posicionesSinElegir = !datos.posicionPrincipal || !datos.posicionSecundaria;
  const puedeGuardar = datos.posicionPrincipal && datos.posicionSecundaria && !posicionesIguales && !guardando;

  // Filtrar efectos que son personalizables (memoizado para evitar referencias nuevas)
  const efectosPersonalizables = useMemo(
    () => (efectos || []).filter((e) =>
      ['color_nombre', 'fondo_carta', 'emoji_personalizado', 'titulo_personalizado', 'badge'].includes(e.tipo)
    ),
    [efectos]
  );

  // Extraer badges que el usuario tiene activos (de los efectos actuales)
  const badgesDelUsuario = useMemo(
    () => (efectos || [])
      .filter((e) => e.tipo === 'badge' && e.metadata?.badgeId)
      .map((e) => ({
        id: e.id,
        badgeId: e.metadata.badgeId,
        enabled: e.metadata.enabled !== false, // Default to enabled
      })),
    [efectos]
  );

  // Estado para selección de badges a mostrar (máx 5)
  const [badgesSeleccionados, setBadgesSeleccionados] = useState(() =>
    badgesDelUsuario.filter(b => b.enabled).map(b => b.badgeId)
  );

  // Sincronizar badgesSeleccionados cuando cambien los badges del usuario
  useEffect(() => {
    const enabled = badgesDelUsuario.filter(b => b.enabled).map(b => b.badgeId);
    setBadgesSeleccionados(enabled);
  }, [badgesDelUsuario]);

  // Inicializar estado de efectos personalizados
  useEffect(() => {
    const inicial = {};
    efectosPersonalizables.forEach((efecto) => {
      const metadata = efecto.metadata || {};
      switch (efecto.tipo) {
        case 'color_nombre':
          inicial[efecto.id] = metadata.color || '#FFD700';
          break;
        case 'fondo_carta':
          inicial[efecto.id] = metadata.fondo || 'degradado_oro';
          break;
        case 'emoji_personalizado':
          inicial[efecto.id] = metadata.emoji || '😀';
          break;
        case 'titulo_personalizado':
          inicial[efecto.id] = metadata.titulo || 'El 10';
          break;
        case 'badge':
          inicial[efecto.id] = metadata.badgeId || 'apostador_pro';
          break;
      }
    });
    setEfectosPersonalizados(inicial);
  }, [efectosPersonalizables]);

  // Actualizar metadata del efecto
  const handleActualizarEfecto = async (efectoId, nuevoValor) => {
    setEfectosPersonalizados((prev) => ({ ...prev, [efectoId]: nuevoValor }));
    try {
      await actualizarEfectoMetadata(grupoActivo.id, efectoId, { color: nuevoValor }); // Se ajustará según tipo
      invalidateEfectosCache(perfil.uid, grupoActivo.id);
    } catch (err) {
      console.error('Error actualizando efecto:', err);
    }
  };

  // Mapear el valor según el tipo de efecto
  const prepararMetadata = (efecto, valor) => {
    switch (efecto.tipo) {
      case 'color_nombre':
        return { color: valor };
      case 'fondo_carta':
        return { fondo: valor };
      case 'emoji_personalizado':
        return { emoji: valor };
      case 'titulo_personalizado':
        return { titulo: valor };
      case 'badge':
        return { badgeId: valor };
      default:
        return {};
    }
  };

  // Handler para toggle de badges (acumulativos, máx 5)
  const handleToggleBadge = async (badgeId, enabled) => {
    const badgeEffect = badgesDelUsuario.find(b => b.badgeId === badgeId);
    if (!badgeEffect) return;

    const newSelected = enabled
      ? [...badgesSeleccionados, badgeId]
      : badgesSeleccionados.filter(b => b !== badgeId);

    // Limitar a 5
    if (newSelected.length > 5) {
      alert('Máximo 5 badges visibles a la vez');
      return;
    }

    setBadgesSeleccionados(newSelected);

    try {
      await actualizarEfectoMetadata(grupoActivo.id, badgeEffect.id, { enabled });
      invalidateEfectosCache(perfil.uid, grupoActivo.id);
    } catch (err) {
      console.error('Error actualizando badge:', err);
      setBadgesSeleccionados(badgesSeleccionados); // Revertir
    }
  };

  const handleCambioEfecto = async (efecto, valor) => {
    setEfectosPersonalizados((prev) => ({ ...prev, [efecto.id]: valor }));
    try {
      const metadata = prepararMetadata(efecto, valor);
      await actualizarEfectoMetadata(grupoActivo.id, efecto.id, metadata);
      invalidateEfectosCache(perfil.uid, grupoActivo.id);
    } catch (err) {
      console.error('Error actualizando efecto:', err);
      // Revertir en caso de error
      const metadataActual = efecto.metadata || {};
      let valorActual = '';
      switch (efecto.tipo) {
        case 'color_nombre':
          valorActual = metadataActual.color || '#FFD700';
          break;
        case 'fondo_carta':
          valorActual = metadataActual.fondo || 'degradado_oro';
          break;
        case 'emoji_personalizado':
          valorActual = metadataActual.emoji || '😀';
          break;
        case 'titulo_personalizado':
          valorActual = metadataActual.titulo || 'El 10';
          break;
        case 'badge':
          valorActual = metadataActual.badgeId || 'apostador_pro';
          break;
      }
      setEfectosPersonalizados((prev) => ({ ...prev, [efecto.id]: valorActual }));
    }
  };

  function actualizarCampo(campo, valor) {
    setDatos((anterior) => ({ ...anterior, [campo]: valor }));
    setGuardado(false);
  }

  function actualizarHabilidad(campo, valor) {
    actualizarCampo(campo, valor);
  }

  async function manejarSeleccionFoto(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    setErrorFoto('');
    setSubiendoFoto(true);
    try {
      await subirFotoPerfil(archivo);
    } catch (err) {
      setErrorFoto(err.message);
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload = { ...datos };
      for (const { campo } of HABILIDADES) {
        const valor = Number(datos[campo]);
        payload[campo] = Number.isNaN(valor) ? 50 : valor;
      }
      await actualizarMiPerfil(payload);
      setGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Mi Perfil</h1>

      <div className={styles.grilla}>
        <div className={styles.columnaFoto}>
          <TarjetaJugadorFIFA
            nombre={datos.nombreCompleto || perfil?.nombre}
            posicion={datos.posicionPrincipal}
            habilidades={datos}
            fotoUrl={perfil?.fotoUrl ? `${SERVER_URL}${perfil.fotoUrl}` : null}
            efectos={efectos}
          />
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.inputFotoOculto}
            onChange={manejarSeleccionFoto}
          />
          <Boton type="button" onClick={() => inputFotoRef.current?.click()} disabled={subiendoFoto}>
            {subiendoFoto ? 'Subiendo…' : 'Subir foto'}
          </Boton>
          {errorFoto && <p className={styles.errorFoto}>{errorFoto}</p>}
        </div>

        <form onSubmit={guardar} className={styles.formulario}>
        <div className={styles.campo}>
          <label className={styles.etiqueta}>Nombre completo</label>
          <input
            type="text"
            value={datos.nombreCompleto}
            onChange={(evento) => actualizarCampo('nombreCompleto', evento.target.value)}
            placeholder={perfil?.nombre}
            className={styles.input}
          />
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Fecha de nacimiento</label>
          <input
            type="date"
            value={datos.fechaNacimiento}
            onChange={(evento) => actualizarCampo('fechaNacimiento', evento.target.value)}
            className={styles.inputFecha}
          />
        </div>

        <div className={styles.grillaPosiciones}>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Posición principal</label>
            <select
              value={datos.posicionPrincipal}
              onChange={(evento) => actualizarCampo('posicionPrincipal', evento.target.value)}
              className={styles.select}
            >
              <option value="" disabled className={styles.opcion}>
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className={styles.opcion}>
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Posición secundaria</label>
            <select
              value={datos.posicionSecundaria}
              onChange={(evento) => actualizarCampo('posicionSecundaria', evento.target.value)}
              className={styles.select}
            >
              <option value="" disabled className={styles.opcion}>
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className={styles.opcion}>
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Pierna hábil</label>
          <div className={styles.filaRadios}>
            <label className={styles.labelRadio}>
              <input
                type="radio"
                name="piernaHabil"
                value="diestro"
                checked={datos.piernaHabil === 'diestro'}
                onChange={(evento) => actualizarCampo('piernaHabil', evento.target.value)}
                className={styles.inputRadio}
              />
              <span className={styles.textoRadio}>Diestro</span>
            </label>
            <label className={styles.labelRadio}>
              <input
                type="radio"
                name="piernaHabil"
                value="zurdo"
                checked={datos.piernaHabil === 'zurdo'}
                onChange={(evento) => actualizarCampo('piernaHabil', evento.target.value)}
                className={styles.inputRadio}
              />
              <span className={styles.textoRadio}>Zurdo</span>
            </label>
          </div>
        </div>
        {posicionesIguales && (
          <p className={styles.mensajeError}>La secundaria tiene que ser distinta de la principal.</p>
        )}
        {posicionesSinElegir && (
          <p className={styles.mensajeError}>Elegí posición principal y secundaria para poder guardar.</p>
        )}

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Resistencia</label>
          <select
            value={datos.resistencia}
            onChange={(evento) => actualizarCampo('resistencia', evento.target.value)}
            className={styles.select}
          >
            <option value="" className={styles.opcion}>
              Sin especificar
            </option>
            {RESISTENCIA.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className={styles.opcion}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Ritmo de juego</label>
          <select
            value={datos.ritmoJuego}
            onChange={(evento) => actualizarCampo('ritmoJuego', evento.target.value)}
            className={styles.select}
          >
            <option value="" className={styles.opcion}>
              Sin especificar
            </option>
            {RITMO_JUEGO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className={styles.opcion}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.grupoHabilidades}>
          <h2 className={styles.tituloHabilidades}>Habilidades</h2>
          {habilidadesBloqueadas && (
            <p className={styles.avisoHabilidadesBloqueadas}>
              Ya cargaste tus habilidades una vez, no se pueden volver a editar.
            </p>
          )}
          {HABILIDADES.map(({ campo, etiqueta }) => (
            <div key={campo} className={styles.filaHabilidad}>
              <div className={styles.encabezadoHabilidad}>
                <span>{etiqueta}</span>
                <span className={styles.valorHabilidad}>{datos[campo]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={datos[campo]}
                onChange={(evento) => actualizarHabilidad(campo, evento.target.value)}
                disabled={habilidadesBloqueadas}
                className={styles.sliderHabilidad}
              />
            </div>
          ))}
        </div>

        {efectosPersonalizables.length > 0 && (
          <div className={styles.grupoEfectos}>
            <h2 className={styles.tituloEfectos}>✨ Efectos personalizables</h2>
            <p className={styles.descripcionEfectos}>
              Tienes efectos activos que puedes personalizar. Selecciona tus preferencias:
            </p>
            {efectosPersonalizables.map((efecto) => {
              const valorActual = efectosPersonalizados[efecto.id] || '';
              const NOMBRES_EFECTOS = {
                color_nombre: 'Color del nombre',
                fondo_carta: 'Fondo de la carta',
                emoji_personalizado: 'Emoji personalizado',
                titulo_personalizado: 'Título personalizado',
                badge: 'Insignia (Badge)',
              };

              if (efecto.tipo === 'color_nombre') {
                const metadata = efecto.metadata || {};
                const colorActual = metadata.color || '#FFD700';
                const tieneColorActivo = metadata.color && metadata.color !== '#FFD700';
                const tieneCompraDisponible = premiosDisponibles.some(p => p.clave === 'color_nombre');
                // Si tiene compra disponible, habilitar dropdown; si no y ya tiene color activo, bloquear
                const colorBloqueado = !tieneCompraDisponible && tieneColorActivo;

                return (
                  <div key={efecto.id} className={styles.campoEfecto}>
                    <label className={styles.etiquetaEfecto}>{NOMBRES_EFECTOS[efecto.tipo]}</label>
                    {colorBloqueado ? (
                      <>
                        <div className={styles.colorBloqueado}>
                          <div className={styles.colorSwatchGrande} style={{ backgroundColor: colorActual }} />
                          <span className={styles.colorLockLabel}>🔒 Color fijado - compra otro para cambiarlo</span>
                        </div>
                        <input type="hidden" value={colorActual} />
                      </>
                    ) : (
                      <>
                        <select
                          value={valorActual || colorActual}
                          onChange={(evento) => handleCambioEfecto(efecto, evento.target.value)}
                          className={styles.selectEfecto}
                        >
                          {OPCIONES_COLORES.map((color) => (
                            <option key={color.valor} value={color.valor} style={{ backgroundColor: color.valor, color: color.valor === '#000000' ? '#FFFFFF' : '#000000' }}>
                              {color.nombre}
                            </option>
                          ))}
                        </select>
                        <div className={styles.colorPreview} style={{ backgroundColor: valorActual || colorActual }} />
                        {tieneCompraDisponible && <span className={styles.purchaseHint}>✨ Tienes un cambio de color disponible</span>}
                      </>
                    )}
                  </div>
                );
              }

              if (efecto.tipo === 'fondo_carta') {
                const metadata = efecto.metadata || {};
                const fondoActual = metadata.fondo || 'degradado_oro';
                const tieneFondoActivo = metadata.fondo && metadata.fondo !== 'degradado_oro';
                const tieneCompraDisponible = premiosDisponibles.some(p => p.clave === 'fondo_carta');
                const fondoBloqueado = !tieneCompraDisponible && tieneFondoActivo;

                return (
                  <div key={efecto.id} className={styles.campoEfecto}>
                    <label className={styles.etiquetaEfecto}>{NOMBRES_EFECTOS[efecto.tipo]}</label>
                    {fondoBloqueado ? (
                      <>
                        <div className={styles.fondoBloqueado}>
                          <span className={styles.fondoLockLabel}>🔒 Fondo fijado - compra otro para cambiarlo</span>
                        </div>
                        <input type="hidden" value={fondoActual} />
                      </>
                    ) : (
                      <>
                        <select
                          value={valorActual || fondoActual}
                          onChange={(evento) => handleCambioEfecto(efecto, evento.target.value)}
                          className={styles.selectEfecto}
                        >
                          {OPCIONES_FONDOS.map((fondo) => (
                            <option key={fondo.valor} value={fondo.valor}>{fondo.nombre}</option>
                          ))}
                        </select>
                        {tieneCompraDisponible && <span className={styles.purchaseHint}>✨ Tienes un cambio de fondo disponible</span>}
                      </>
                    )}
                  </div>
                );
              }

              if (efecto.tipo === 'emoji_personalizado') {
                const metadata = efecto.metadata || {};
                const emojiActual = metadata.emoji || '😀';
                const tieneEmojiActivo = metadata.emoji && metadata.emoji !== '😀';
                const tieneCompraDisponible = premiosDisponibles.some(p => p.clave === 'emoji_personalizado');
                const emojiBloqueado = !tieneCompraDisponible && tieneEmojiActivo;

                return (
                  <div key={efecto.id} className={styles.campoEfecto}>
                    <label className={styles.etiquetaEfecto}>{NOMBRES_EFECTOS[efecto.tipo]}</label>
                    {emojiBloqueado ? (
                      <>
                        <div className={styles.emojiBloqueado}>
                          <span className={styles.emojiPreviewGrande}>{emojiActual}</span>
                          <span className={styles.emojiLockLabel}>🔒 Emoji fijado - compra otro para cambiarlo</span>
                        </div>
                        <input type="hidden" value={emojiActual} />
                      </>
                    ) : (
                      <>
                        <select
                          value={valorActual || emojiActual}
                          onChange={(evento) => handleCambioEfecto(efecto, evento.target.value)}
                          className={styles.selectEfecto}
                        >
                          {OPCIONES_EMOJIS.map((emoji) => (
                            <option key={emoji} value={emoji}>{emoji}</option>
                          ))}
                        </select>
                        <span className={styles.emojiPreview}>{valorActual || emojiActual}</span>
                        {tieneCompraDisponible && <span className={styles.purchaseHint}>✨ Tienes un cambio de emoji disponible</span>}
                      </>
                    )}
                  </div>
                );
              }

              if (efecto.tipo === 'titulo_personalizado') {
                const metadata = efecto.metadata || {};
                const tituloActual = metadata.titulo || '';
                const tieneTituloActivo = metadata.titulo && metadata.titulo.trim() !== '';
                const tieneCompraDisponible = premiosDisponibles.some(p => p.clave === 'titulo_personalizado');
                const tituloBloqueado = !tieneCompraDisponible && tieneTituloActivo;

                return (
                  <div key={efecto.id} className={styles.campoEfecto}>
                    <label className={styles.etiquetaEfecto}>{NOMBRES_EFECTOS[efecto.tipo]}</label>
                    {tituloBloqueado ? (
                      <>
                        <div className={styles.tituloBloqueado}>
                          <span className={styles.tituloLockLabel}>🔒 Título fijado: "{tituloActual}" - compra otro para cambiarlo</span>
                        </div>
                        <input type="hidden" value={tituloActual} />
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={valorActual || tituloActual}
                          onChange={(evento) => handleCambioEfecto(efecto, evento.target.value)}
                          className={styles.input}
                          placeholder="Ej: El 10, El Capitán, La Bestia..."
                          maxLength={30}
                        />
                        {tieneCompraDisponible && <span className={styles.purchaseHint}>✨ Tienes un cambio de título disponible</span>}
                      </>
                    )}
                  </div>
                );
              }

              if (efecto.tipo === 'badge') {
                // Badges se renderizan en sección agrupada aparte
                return null;
              }

              return null;
            })}
          </div>
        )}

        {/* Sección agrupada: Badges (acumulativos, máx 5 visibles) */}
        {badgesDelUsuario.length > 0 && (
          <div className={styles.grupoEfectos}>
            <h2 className={styles.tituloEfectos}>🏅 Badges (acumulativos)</h2>
            <p className={styles.descripcionEfectos}>
              Selecciona hasta 5 badges para mostrar junto a tu nombre. Tienes {badgesDelUsuario.length} badge{ badgesDelUsuario.length !== 1 ? 's' : '' } disponible{ badgesDelUsuario.length !== 1 ? 's' : '' }.
            </p>
            <div className={styles.badgesGrid}>
              {badgesDelUsuario.map((badge) => {
                const badgeInfo = OPCIONES_BADGES.find(b => b.valor === badge.badgeId);
                const enabled = badgesSeleccionados.includes(badge.badgeId);
                const badgeEmoji = obtenerBadgeEmoji(badge.badgeId);
                return (
                  <label key={badge.id} className={clsx(styles.badgeCheckbox, enabled && styles.badgeCheckboxActivo)}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => handleToggleBadge(badge.badgeId, e.target.checked)}
                      disabled={!enabled && badgesSeleccionados.length >= 5}
                    />
                    <span className={styles.badgeEmoji}>{badgeEmoji}</span>
                    <span className={styles.badgeNombre}>{badgeInfo?.nombre || badge.badgeId}</span>
                    {!enabled && badgesSeleccionados.length >= 5 && (
                      <span className={styles.badgeLimitHint}>Límite: 5</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {guardado && !error && <p className={styles.exito}>Perfil guardado.</p>}

        <Boton type="submit" disabled={habilidadesBloqueadas || !puedeGuardar}>
          {habilidadesBloqueadas ? 'Perfil guardado' : guardando ? 'Guardando…' : 'Guardar perfil'}
        </Boton>
        </form>
      </div>
    </div>
  );
}

export default function Perfil() {
  const { perfil, actualizarMiPerfil, subirFotoPerfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [pestanaActiva, setPestanaActiva] = useState('datos');
  const [efectos, setEfectos] = useState([]);
  const [cargandoEfectos, setCargandoEfectos] = useState(true);
  const [premiosDisponibles, setPremiosDisponibles] = useState([]);

  const cargarEfectos = useCallback(() => {
    if (!grupoActivo) {
      setEfectos([]);
      setCargandoEfectos(false);
      return;
    }
    let activo = true;
    setCargandoEfectos(true);
    obtenerEfectosActivos(grupoActivo.id)
      .then((data) => {
        if (activo) {
          setEfectos(data || []);
          // Invalidar cache del hook para que NombreConEfectos y otros componentes vean los cambios
          invalidateEfectosCache(perfil.uid, grupoActivo.id);
        }
      })
      .catch((err) => {
        console.error('Error fetching effects:', err);
        if (activo) setEfectos([]);
      })
      .finally(() => {
        if (activo) setCargandoEfectos(false);
      });
    return () => {
      activo = false;
    };
  }, [grupoActivo, perfil.uid]);

  const cargarPremiosDisponibles = useCallback(() => {
    if (!grupoActivo) {
      setPremiosDisponibles([]);
      return;
    }
    let activo = true;
    obtenerMisPremios(grupoActivo.id)
      .then((data) => {
        if (activo) {
          // Filtrar solo los que están disponibles (estado === 'disponible')
          const disponibles = (data || []).filter(p => p.estado === 'disponible');
          setPremiosDisponibles(disponibles);
        }
      })
      .catch((err) => {
        console.error('Error fetching available prizes:', err);
        if (activo) setPremiosDisponibles([]);
      });
  }, [grupoActivo]);

  useEffect(() => {
    cargarEfectos();
    cargarPremiosDisponibles();
  }, [cargarEfectos, cargarPremiosDisponibles]);

  // Subscribe to cache invalidation to re-fetch effects when a badge is used
  useEffect(() => {
    const unsubscribe = subscribeToCacheInvalidation(() => {
      if (grupoActivo) {
        cargarEfectos();
        cargarPremiosDisponibles();
      }
    });
    return unsubscribe;
  }, [cargarEfectos, cargarPremiosDisponibles, grupoActivo]);

  return (
    <div className={styles.pagina}>
      <div className={styles.pestanas}>
        <button
          className={clsx(styles.pestana, pestanaActiva === 'datos' && styles.pestanaActiva)}
          onClick={() => setPestanaActiva('datos')}
        >
          Datos
        </button>
        <button
          className={clsx(styles.pestana, pestanaActiva === 'premios' && styles.pestanaActiva)}
          onClick={() => setPestanaActiva('premios')}
        >
          🏆 Premios
        </button>
        <button
          className={clsx(styles.pestana, pestanaActiva === 'editar' && styles.pestanaActiva)}
          onClick={() => setPestanaActiva('editar')}
        >
          Editar
        </button>
      </div>

      {pestanaActiva === 'datos' && (
        <PerfilDatos perfil={perfil} grupoActivo={grupoActivo} efectos={efectos} />
      )}
      {pestanaActiva === 'premios' && (
        <PerfilPremios perfil={perfil} grupoActivo={grupoActivo} efectos={efectos} cargando={cargandoEfectos} />
      )}
      {pestanaActiva === 'editar' && (
        <PerfilEditar
          perfil={perfil}
          actualizarMiPerfil={actualizarMiPerfil}
          subirFotoPerfil={subirFotoPerfil}
          efectos={efectos}
          grupoActivo={grupoActivo}
          premiosDisponibles={premiosDisponibles}
        />
      )}
    </div>
  );
}