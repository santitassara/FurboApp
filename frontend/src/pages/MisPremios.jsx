import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import {
  obtenerCatalogoPremios,
  comprarPremio,
  obtenerMisPremios,
  usarPremio,
  obtenerEfectosActivos,
  obtenerSaldo,
  listarPartidosApostables,
} from '../services/apuestasApi';
import { invalidateEfectosCache } from '../hooks/useEfectosVisuales';
import Boton from '../components/Boton';
import ModalCategoriaPremios from '../components/ModalCategoriaPremios';
import styles from './MisPremios.module.css';

const ICONOS_CATEGORIA = {
  formacion: '⚽',
  informacion: '👁️',
  social: '👥',
  estetica: '✨',
  apuestas: '🎲',
  rating: '📊',
  exotico: '🎪',
};

const NOMBRES_CATEGORIA = {
  formacion: 'Formaciones',
  informacion: 'Información y Votación',
  social: 'Sociales y Sanciones',
  estetica: 'Personalización y Estética',
  apuestas: 'Ventajas de Apuestas',
  rating: 'Rating y MVP',
  exotico: 'Exóticos / Divertidos',
};

const ICONOS_ESTADO = {
  disponible: '🟢',
  usado: '✅',
  expirado: '❌',
};

const ICONOS_TIPO_EFECTO = {
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
  color_nombre: '🎨',
  fondo_carta: '🖼️',
  emoji_personalizado: '😀',
  titulo_personalizado: '📛',
  badge: '🏅',
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

function formatearEfectoMetadata(tipo, metadata) {
  if (!metadata || Object.keys(metadata).length === 0) return [];

  const items = [];

  switch (tipo) {
    case 'cambiar_jugador_equipo':
      if (metadata.jugadorNombre && metadata.jugadorDestinoNombre) {
        items.push({ type: 'text', content: `🔄 Intercambia: ${metadata.jugadorNombre} ↔ ${metadata.jugadorDestinoNombre}` });
      } else if (metadata.jugadorId && metadata.jugadorDestinoId) {
        items.push({ type: 'text', content: `🔄 Intercambia: ${metadata.jugadorId.slice(0, 8)}... ↔ ${metadata.jugadorDestinoId.slice(0, 8)}...` });
      } else if (metadata.jugadorId && metadata.equipoDestino) {
        items.push({ type: 'text', content: `🔄 Mueve ${metadata.jugadorNombre || metadata.jugadorId.slice(0, 8)}... → Equipo ${metadata.equipoDestino}` });
      }
      if (metadata.ejecutado) items.push({ type: 'text', content: '✅ Ejecutado' });
      break;

    case 'elegir_equipo':
      if (metadata.equipo) items.push({ type: 'text', content: `⚽ Equipo elegido: ${metadata.equipo === 'A' ? 'Equipo A' : 'Equipo B'}` });
      if (metadata.ejecutado) items.push({ type: 'text', content: '✅ Ejecutado' });
      break;

    case 'armar_equipo_completo':
      if (metadata.ejecutado) items.push({ type: 'text', content: '✅ Ejecutado' });
      break;

    case 'bloquear_formacion':
      if (metadata.ejecutado) items.push({ type: 'text', content: '🔒 Formación bloqueada' });
      break;

    case 'color_nombre':
      if (metadata.color) items.push({ type: 'color', color: metadata.color });
      break;

    case 'fondo_carta':
      if (metadata.fondo) items.push(`🖼️ Fondo: ${metadata.fondo}`);
      break;

    case 'emoji_personalizado':
      if (metadata.emoji) items.push(`😀 Emoji: ${metadata.emoji}`);
      break;

    case 'titulo_personalizado':
      if (metadata.titulo) items.push(`📛 Título: ${metadata.titulo}`);
      break;

    case 'badge':
      if (metadata.badgeId) items.push(`🏅 Insignia: ${metadata.badgeId}`);
      break;

    case 'admin_temporal':
      items.push('👑 Admin temporal');
      break;

    case 'voto_doble_formacion':
      items.push('🗳️ Voto doble en formaciones');
      break;

    case 'ver_votos_formacion':
      items.push('👁️ Ver votos de formaciones');
      break;

    case 'ver_faltan_votar':
      items.push('📋 Ver quién falta por votar');
      break;

    case 'cancelar_apuesta':
      items.push('↩️ Cancelar apuesta');
      break;

    case 'perdonar_propia_sancion':
      items.push('🎫 Perdonar propia sanción');
      break;

    case 'perdonar_sancion_otro':
      if (metadata.usuarioId) items.push(`🤝 Perdonar sanción a ${metadata.usuarioId.slice(0, 8)}...`);
      break;

    case 'freebet_50':
      if (metadata.monto) items.push(`🎁 Freebet: ${metadata.monto} pts`);
      break;

    case 'cuota_mejorada':
      if (metadata.bonus) items.push(`📈 Cuota mejorada +${Math.round(metadata.bonus * 100)}%`);
      break;

    case 'seguro_apuesta':
      if (metadata.cobertura) items.push(`🛡️ Seguro apuesta ${Math.round(metadata.cobertura * 100)}%`);
      break;

    case 'ver_pool_apuestas':
      items.push('💰 Ver pool de apuestas');
      break;

    case 'voto_valoracion_doble':
      items.push('⭐ Voto doble en valoraciones');
      break;

    case 'elegir_mvp_directo':
      items.push('🏆 Elegir MVP directo');
      break;

    case 'ver_votos_valoracion':
      items.push('👁️ Ver votos de valoración');
      break;

    case 'cambiar_rival':
      if (metadata.rivalNuevo) items.push(`🔄 Cambiar rival a ${metadata.rivalNuevo}`);
      break;

    case 'dios_del_partido':
      items.push('⚡ Dios del partido');
      break;

    default:
      Object.entries(metadata).forEach(([key, value]) => {
        if (key !== 'ejecutado') {
          items.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
        }
      });
  }

  return items;
}

export default function MisPremios() {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const navigate = useNavigate();

  const [saldo, setSaldo] = useState(0);
  const [pestañaActiva, setPestañaActiva] = useState('catalogo');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Catálogo
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);

  // Mis Premios
  const [misPremios, setMisPremios] = useState([]);
  const [cargandoMisPremios, setCargandoMisPremios] = useState(true);

  // Efectos Activos
  const [efectosActivos, setEfectosActivos] = useState([]);
  const [cargandoEfectos, setCargandoEfectos] = useState(true);

  // Modal
  const [modalAbierto, setModalAbierto] = useState(false);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);
  const [premiosCategoria, setPremiosCategoria] = useState([]);
  const [modalCargando, setModalCargando] = useState(false);

  // Match selector modal para premios de formación
  const [matchSelectorAbierto, setMatchSelectorAbierto] = useState(false);
  const [partidosDisponibles, setPartidosDisponibles] = useState([]);
  const [partidosCargando, setPartidosCargando] = useState(false);
  const [compraSeleccionada, setCompraSeleccionada] = useState(null);

  const cargarSaldo = useCallback(async () => {
    if (!grupoActivo) return;
    try {
      const data = await obtenerSaldo(grupoActivo.id);
      setSaldo(data.saldo || 0);
    } catch (err) {
      console.error('Error al cargar saldo:', err);
    }
  }, [grupoActivo]);

  const cargarCategorias = useCallback(async () => {
    if (!grupoActivo) return;
    try {
      const data = await obtenerCatalogoPremios(grupoActivo.id);
      const categoriasMap = {};
      data.forEach((premio) => {
        if (!categoriasMap[premio.categoria]) {
          categoriasMap[premio.categoria] = [];
        }
        categoriasMap[premio.categoria].push(premio);
      });
      setCategorias(Object.keys(categoriasMap).sort());
    } catch (err) {
      console.error('Error al cargar categorías:', err);
    } finally {
      setCargandoCategorias(false);
    }
  }, [grupoActivo]);

  const cargarMisPremios = useCallback(async () => {
    if (!grupoActivo) return;
    setCargandoMisPremios(true);
    try {
      const data = await obtenerMisPremios(grupoActivo.id);
      setMisPremios(data);
    } catch (err) {
      console.error('Error al cargar mis premios:', err);
    } finally {
      setCargandoMisPremios(false);
    }
  }, [grupoActivo]);

  const cargarEfectosActivos = useCallback(async () => {
    if (!grupoActivo) return;
    setCargandoEfectos(true);
    try {
      const data = await obtenerEfectosActivos(grupoActivo.id);
      setEfectosActivos(data);
    } catch (err) {
      console.error('Error al cargar efectos activos:', err);
    } finally {
      setCargandoEfectos(false);
    }
  }, [grupoActivo]);

  const cargarTodo = useCallback(async () => {
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      await Promise.all([cargarSaldo(), cargarCategorias(), cargarMisPremios(), cargarEfectosActivos()]);
    } catch (err) {
      setError(err.message || 'Error al cargar los datos');
    } finally {
      setCargando(false);
    }
  }, [grupoActivo, cargarSaldo, cargarCategorias, cargarMisPremios, cargarEfectosActivos]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  const handleAbrirCategoria = useCallback(async (categoria) => {
    setCategoriaSeleccionada(categoria);
    setModalCargando(true);
    try {
      const catalogo = await obtenerCatalogoPremios(grupoActivo.id);
      const premios = catalogo.filter((p) => p.categoria === categoria);
      setPremiosCategoria(premios);
      setModalAbierto(true);
    } catch (err) {
      console.error('Error al cargar premios:', err);
    } finally {
      setModalCargando(false);
    }
  }, [grupoActivo]);

  const handleComprarPremio = useCallback(
    async (premioId) => {
      setModalCargando(true);
      try {
        await comprarPremio(grupoActivo.id, premioId);
        // Recargar todo
        await cargarTodo();
      } catch (err) {
        throw err;
      } finally {
        setModalCargando(false);
      }
    },
    [grupoActivo, cargarTodo]
  );

  // Match selector functions - must be before handleUsarPremio
  const cargarPartidosDisponibles = useCallback(async () => {
    if (!grupoActivo) return;
    setPartidosCargando(true);
    try {
      const data = await listarPartidosApostables(grupoActivo.id);
      setPartidosDisponibles(data);
    } catch (err) {
      console.error('Error al cargar partidos:', err);
      setPartidosDisponibles([]);
    } finally {
      setPartidosCargando(false);
    }
  }, [grupoActivo]);

  const handleAbrirMatchSelector = useCallback(async (compraId) => {
    setCompraSeleccionada(compraId);
    await cargarPartidosDisponibles();
    setMatchSelectorAbierto(true);
  }, [cargarPartidosDisponibles]);

  const handleCerrarMatchSelector = useCallback(() => {
    setMatchSelectorAbierto(false);
    setCompraSeleccionada(null);
    setPartidosDisponibles([]);
  }, []);

  const handleUsarPremioConPartido = useCallback(
    async (compraId, partidoId) => {
      try {
        await usarPremio(grupoActivo.id, compraId, { partidoId });
        invalidateEfectosCache(grupoActivo.id);
        await cargarTodo();
        handleCerrarMatchSelector();
      } catch (err) {
        alert(err.message || 'Error al usar el premio');
      }
    },
    [grupoActivo, cargarTodo]
  );

  const handleUsarPremio = useCallback(
    async (compraId, metadata = {}) => {
      // Check if this is a formation prize that needs a match
      const premio = misPremios.find(p => p.id === compraId);
      if (premio) {
        const premioMetadata = premio.premioMetadata || {};
        const necesitaPartido = premioMetadata.requierePartidoId && !premio.partidoId;

        if (necesitaPartido) {
          // Show match selector instead of using directly
          handleAbrirMatchSelector(compraId);
          return;
        }
      }

      try {
        await usarPremio(grupoActivo.id, compraId, metadata);
        invalidateEfectosCache(grupoActivo.id);
        await cargarTodo();
      } catch (err) {
        alert(err.message || 'Error al usar el premio');
      }
    },
    [grupoActivo, cargarTodo, misPremios, handleAbrirMatchSelector]
  );

  const handleCerrarModal = useCallback(() => {
    setModalAbierto(false);
    setCategoriaSeleccionada(null);
    setPremiosCategoria([]);
  }, []);

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

  const formatearFechaCorta = (fechaISO) => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (cargando) {
    return (
      <div className={styles.contenedorCargando}>
        <div className={styles.spinner} />
        <p className={styles.cargandoTexto}>Cargando tus premios...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.contenedorError}>
        <p className={styles.mensajeError}>{error}</p>
        <Boton variante="primario" onClick={cargarTodo}>
          Reintentar
        </Boton>
      </div>
    );
  }

  return (
    <div className={clsx(styles.misPremios, 'pageEnter')}>
      <header className={styles.header}>
        <div className={styles.headerIzquierda}>
          <h1 className={styles.titulo}>Mis Premios</h1>
          <p className={styles.subtitulo}>Canjea, activa y gestiona tus premios</p>
        </div>
        <div className={styles.saldoContenedor}>
          <span className={styles.saldoEtiqueta}>Saldo disponible</span>
          <span className={styles.saldoValor}>{saldo.toLocaleString()} <span className={styles.saldoUnidad}>pts</span></span>
        </div>
      </header>

      <nav className={styles.pestañas} role="tablist">
        <button
          role="tab"
          aria-selected={pestañaActiva === 'catalogo'}
          className={clsx(styles.pestaña, pestañaActiva === 'catalogo' && styles.pestañaActiva)}
          onClick={() => setPestañaActiva('catalogo')}
        >
          🏪 Catálogo
        </button>
        <button
          role="tab"
          aria-selected={pestañaActiva === 'mis-premios'}
          className={clsx(styles.pestaña, pestañaActiva === 'mis-premios' && styles.pestañaActiva)}
          onClick={() => setPestañaActiva('mis-premios')}
        >
          🎁 Mis Premios
        </button>
        <button
          role="tab"
          aria-selected={pestañaActiva === 'efectos-activos'}
          className={clsx(styles.pestaña, pestañaActiva === 'efectos-activos' && styles.pestañaActiva)}
          onClick={() => setPestañaActiva('efectos-activos')}
        >
          ⚡ Efectos Activos
        </button>
      </nav>

      {pestañaActiva === 'catalogo' && (
        <section className={styles.seccion} aria-labelledby="catalogo-titulo">
          <h2 id="catalogo-titulo" className={styles.seccionTitulo}>
            Tienda de Premios
          </h2>
          <p className={styles.seccionSubtitulo}>Canjea tus puntos por ventajas exclusivas</p>

          {cargandoCategorias ? (
            <div className={styles.categoriasCargando}>
              <div className={styles.spinnerChico} />
              <span>Cargando categorías...</span>
            </div>
          ) : categorias.length === 0 ? (
            <p className={styles.sinCategorias}>No hay premios disponibles</p>
          ) : (
            <ul className={styles.listaCategorias}>
              {categorias.map((categoria) => (
                <li key={categoria} className={styles.categoriaItem}>
                  <button
                    className={clsx(styles.categoriaBoton, 'w-full')}
                    onClick={() => handleAbrirCategoria(categoria)}
                    disabled={modalCargando}
                  >
                    <span className={styles.categoriaIcono}>{ICONOS_CATEGORIA[categoria] || '🎁'}</span>
                    <span className={styles.categoriaNombre}>{NOMBRES_CATEGORIA[categoria] || categoria}</span>
                    <span className={styles.categoriaFlecha}>›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pestañaActiva === 'mis-premios' && (
        <section className={styles.seccion} aria-labelledby="mis-premios-titulo">
          <h2 id="mis-premios-titulo" className={styles.seccionTitulo}>
            Mis Premios
          </h2>
          <p className={styles.seccionSubtitulo}>Premios canjeados y disponibles para activar</p>

          {cargandoMisPremios ? (
            <div className={styles.categoriasCargando}>
              <div className={styles.spinnerChico} />
              <span>Cargando tus premios...</span>
            </div>
          ) : misPremios.length === 0 ? (
            <div className={styles.sinPremios}>
              <div className={styles.sinPremiosIcono}>🎁</div>
              <p className={styles.sinPremiosTitulo}>No tienes premios aún</p>
              <p className={styles.sinPremiosDescripcion}>
                Ve a la pestaña Catálogo para canjear tus puntos por premios.
              </p>
            </div>
          ) : (
            <div className={styles.listaPremios}>
              {misPremios.map((premio) => {
                const metadata = premio.premioMetadata || {};
                const estadoIcono = ICONOS_ESTADO[premio.estado] || '❓';
                const puedeUsar = premio.estado === 'disponible';

                return (
                  <article key={premio.id} className={clsx(styles.premioCard, premio.estado === 'usado' && styles.premioUsado, premio.estado === 'expirado' && styles.premioExpirado)}>
                    <div className={styles.premioInfo}>
                      <div className={styles.premioHeader}>
                        <h3 className={styles.premioNombre}>{premio.nombre}</h3>
                        <span className={clsx(styles.estadoBadge, styles[`estado${premio.estado.charAt(0).toUpperCase() + premio.estado.slice(1)}`])}>
                          {estadoIcono} {premio.estado === 'disponible' ? 'Disponible' : premio.estado === 'usado' ? 'Usado' : 'Expirado'}
                        </span>
                      </div>
                      <p className={styles.premioDescripcion}>{premio.descripcion}</p>
                      <div className={styles.premioMeta}>
                        <span className={styles.metaItem}>💰 {premio.costo} pts</span>
                        <span className={styles.metaItem}>📅 {formatearFechaCorta(premio.fechaCompra)}</span>
                        {premio.partidoId && <span className={styles.metaItem}>🎯 Partido asignado</span>}
                        {metadata.badgeId && <span className={styles.metaItem}>🏅 {metadata.badgeId}</span>}
                        {metadata.monto && <span className={styles.metaItem}>💰 {metadata.monto} pts</span>}
                        {metadata.bonus && <span className={styles.metaItem}>📈 +{Math.round(metadata.bonus * 100)}%</span>}
                        {metadata.cobertura && <span className={styles.metaItem}>🛡️ {Math.round(metadata.cobertura * 100)}%</span>}
                        {metadata.duracionHoras && <span className={styles.metaItem}>⏱️ {metadata.duracionHoras}h</span>}
                      </div>
                    </div>
                    <div className={styles.premioAccion}>
                      {puedeUsar && (
                        <Boton
                          className={styles.botonUsar}
                          onClick={() => handleUsarPremio(premio.id)}
                          variante="primario"
                        >
                          Usar
                        </Boton>
                      )}
                      {premio.estado === 'usado' && (
                        <span className={styles.yaUsado}>✅ Ya usado</span>
                      )}
                      {premio.estado === 'expirado' && (
                        <span className={styles.expirado}>❌ Expirado</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {pestañaActiva === 'efectos-activos' && (
        <section className={styles.seccion} aria-labelledby="efectos-titulo">
          <h2 id="efectos-titulo" className={styles.seccionTitulo}>
            Efectos Activos
          </h2>
          <p className={styles.seccionSubtitulo}>Ventajas activas en este momento</p>

          {cargandoEfectos ? (
            <div className={styles.categoriasCargando}>
              <div className={styles.spinnerChico} />
              <span>Cargando efectos...</span>
            </div>
          ) : efectosActivos.length === 0 ? (
            <div className={styles.sinPremios}>
              <div className={styles.sinPremiosIcono}>⚡</div>
              <p className={styles.sinPremiosTitulo}>No tienes efectos activos</p>
              <p className={styles.sinPremiosDescripcion}>
                Usa tus premios disponibles para activar efectos.
              </p>
            </div>
          ) : (
            <div className={styles.listaEfectos}>
              {efectosActivos.map((efecto) => {
                const icono = ICONOS_TIPO_EFECTO[efecto.tipo] || '⚡';
                const expiraEn = new Date(efecto.expiraEn);
                const ahora = new Date();
                const esPermanente = expiraEn.getFullYear() > 2090;
                const tiempoRestante = esPermanente ? 'Permanente' : Math.max(0, Math.ceil((expiraEn - ahora) / (1000 * 60 * 60 * 24))) + ' días';

                return (
                  <article key={efecto.id} className={styles.efectoCard}>
                    <div className={styles.efectoHeader}>
                      <div className={styles.efectoIcono}>{icono}</div>
                      <div className={styles.efectoInfo}>
                        <h3 className={styles.efectoNombre}>{efecto.tipo.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</h3>
                        <p className={styles.efectoExpira}>
                          {esPermanente ? '🔮 Permanente' : `⏳ Expira en ${tiempoRestante}`}
                        </p>
                      </div>
                    </div>
                    {efecto.metadata && Object.keys(efecto.metadata).length > 0 && (
                      <div className={styles.efectoMeta}>
                        {formatearEfectoMetadata(efecto.tipo, efecto.metadata).map((item, idx) => (
                          item.type === 'color' ? (
                            <span key={idx} className={styles.metaItem} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className={styles.colorSwatch} style={{ backgroundColor: item.color }} />
                              <span>🎨 {item.color}</span>
                            </span>
                          ) : (
                            <span key={idx} className={styles.metaItem}>
                              {item.content || item}
                            </span>
                          )
                        ))}
                      </div>
                    )}
                    {efecto.partidoId && (
                      <div className={styles.efectoPartido}>
                        🎯 Partido: {efecto.partidoId.slice(0, 8)}...
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Match Selector Modal para premios de formación */}
      {matchSelectorAbierto && (
        <div className={styles.modalOverlay} onClick={handleCerrarMatchSelector} role="dialog" aria-modal="true" aria-labelledby="match-selector-title">
          <div className={styles.modalPartido} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3 id="match-selector-title" className={styles.modalTitulo}>Seleccionar Partido</h3>
              <button className={styles.modalCerrar} onClick={handleCerrarMatchSelector} aria-label="Cerrar">✕</button>
            </header>
            <div className={styles.modalContenido}>
              {partidosCargando ? (
                <div className={styles.categoriasCargando}>
                  <div className={styles.spinnerChico} />
                  <span>Cargando partidos disponibles...</span>
                </div>
              ) : partidosDisponibles.length === 0 ? (
                <div className={styles.sinPremios}>
                  <div className={styles.sinPremiosIcono}>🎯</div>
                  <p className={styles.sinPremiosTitulo}>No hay partidos disponibles</p>
                  <p className={styles.sinPremiosDescripcion}>
                    No hay partidos con formaciones definidas para usar este premio.
                  </p>
                </div>
              ) : (
                <ul className={styles.listaPartidos}>
                  {partidosDisponibles.map((partido) => (
                    <li key={partido.id} className={styles.partidoItem}>
                      <button
                        className={styles.partidoBoton}
                        onClick={() => handleUsarPremioConPartido(compraSeleccionada, partido.id)}
                        disabled={modalCargando}
                      >
                        <div className={styles.partidoInfo}>
                          <span className={styles.partidoFecha}>
                            {new Date(partido.fecha).toLocaleDateString('es-ES', {
                              weekday: 'long',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className={styles.partidoCupo}>
                            {partido.cupoTitulares} titulares / {partido.cupoSuplentes} suplentes
                          </span>
                        </div>
                        <span className={styles.partidoSeleccionar}>Seleccionar</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ModalCategoriaPremios
        abierto={modalAbierto}
        onCerrar={handleCerrarModal}
        categoria={categoriaSeleccionada}
        premios={premiosCategoria}
        saldo={saldo}
        cargando={modalCargando}
        onComprar={handleComprarPremio}
      />
    </div>
  );
}