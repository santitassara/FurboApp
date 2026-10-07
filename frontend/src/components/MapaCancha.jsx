import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaComment } from 'react-icons/fa';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import api from '../services/api';
import Boton from './Boton';
import styles from './MapaCancha.module.css';
import {
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  ETIQUETAS_LINEA,
  ORDEN_LINEAS_CAMPO,
  listarFormaciones,
  normalizarAutomatico,
} from '../utils/formaciones';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';

function claveUbicacion(equipo, linea, ordenLinea) {
  return `${equipo}-${linea}-${ordenLinea}`;
}

// Identidad de asiento: un jugador real o un invitado, nunca ambos.
function claveJugador(jugador) {
  return jugador.usuarioId || jugador.invitadoId;
}

function ordenarLineas(lineas) {
  return [...lineas].sort((a, b) => ORDEN_LINEAS_CAMPO.indexOf(a.key) - ORDEN_LINEAS_CAMPO.indexOf(b.key));
}

// Forma canónica de un arreglo de líneas, para comparar si dos selecciones representan
// la misma forma (mismas keys y cantidades) más allá del orden de referencia de objetos.
function serializarLineas(lineas) {
  return JSON.stringify((lineas || []).map(({ key, cantidad }) => ({ key, cantidad })));
}

// Deriva la forma del equipo a partir de lo que ya está ubicado en el mapa
// (usado cuando la selección es "Automático": no hay preview antes de generar).
function estructuraDesdeUbicaciones(ubicaciones, equipo) {
  const conteo = new Map();
  for (const jugador of ubicaciones) {
    if (jugador.equipo !== equipo || !jugador.linea || jugador.linea === 'arquero') continue;
    conteo.set(jugador.linea, (conteo.get(jugador.linea) || 0) + 1);
  }
  return ordenarLineas(Array.from(conteo.entries()).map(([key, cantidad]) => ({ key, cantidad })));
}

function obtenerIniciales(nombre) {
  const palabras = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

function Jugador({ usuarioId, invitadoId, nombre, linea, draggable }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: usuarioId || invitadoId,
    disabled: !draggable,
  });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={clsx(styles.jugador, 'group', draggable && styles.jugadorDraggable, isDragging && styles.jugadorDragging)}
    >
      <span className={styles.jugadorTooltip}>
        {nombre}
      </span>
      <div className={styles.jugadorAvatar}>
        {obtenerIniciales(nombre)}
      </div>
      <div className={styles.jugadorEtiqueta}>
        {linea ? ETIQUETAS_LINEA[linea] : ''}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geometría de la cancha: el área jugable NO llena todo el contenedor, porque
// la imagen de fondo (layout-cancha-futbol.jpeg) incluye los márgenes fuera de
// cancha. Son las líneas del campo medidas en % del contenedor:
//   línea de gol izquierda  x = 13.8%    línea de gol derecha  x = 86.9%
//   línea de banda superior y = 10.2%    línea de banda inferior y = 89.1%
//   línea de medio campo     x = 50%
// Cada equipo juega sobre una caja .mitad que cubre exactamente la porción de
// cancha que ocupa; los asientos usan coordenadas en % propias de esa caja
// (x: 0 = línea de gol propia → 1 = línea de gol rival; y: 0 = banda de
// arriba → 1 = banda de abajo), siempre clamped para no salir del campo.
const CAMPO_JUGABLE = { izq: 13.8, der: 86.9, arri: 10.2, abaj: 89.1 };
const ANCHO_CAMPO = CAMPO_JUGABLE.der - CAMPO_JUGABLE.izq; // 73.1
const ALTO_CAMPO = CAMPO_JUGABLE.abaj - CAMPO_JUGABLE.arri; // 78.9
// En modo partido cada equipo defiende su arco y juega sobre 45% de la cancha
// (5% más allá de la línea de medio campo hacia el lado rival), para que los
// dos equipos nunca se choquen alrededor del círculo central. En modo plantel
// el único equipo se reparte sobre la cancha entera.
const FRACCION_CAMPO_POR_EQUIPO = 0.45;
// Tamaño del asiento en cqw de la cancha (.asiento usa min(56px, 6.5cqw)):
// se usa para el clamp de coordenadas y garantizar que ningún asiento se
// salga de los bordes del área jugable.
const ASIENTO_CQW = 6.5;
const ASPECTO_CANCHA = 1.83; // aspect-[1.83] de .cancha

// Profundidad de cada línea sobre el eje de ataque del equipo
// (0 = gol propio, 1 = gol rival), siguiendo los patrones tácticos estándar:
// el arquero en su arco, la defensa delante de su área, el mediocampo en
// torno a la línea de medio campo y el ataque profundo en el campo rival.
const PROFUNDIDAD_LINEA = {
  arquero: 0.05,
  defensa: 0.22,
  medioContencion: 0.4,
  medio: 0.5,
  medioOfensivo: 0.6,
  delantero: 0.82,
};

// Abanico lateral de una línea según su cantidad de jugadores: a más
// jugadores, más se abren hacia las bandas (laterales, extremos).
const AMPLITUD_POR_JUGADORES = { 2: 0.34, 3: 0.58, 4: 0.82, 5: 0.9 };
const AMPLITUD_RELATIVA_LINEA = {
  defensa: 1,
  delantero: 1,
  medioOfensivo: 0.9,
  medio: 0.85,
  medioContencion: 0.75,
};

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

// Posiciones laterales (0..1) de los n jugadores de una línea: repartidas en
// torno al centro del campo con el abanico que le corresponde a la línea.
function dispersaLinea(linea, n) {
  if (n <= 1) return [0.5];
  const amplitud = AMPLITUD_POR_JUGADORES[Math.min(n, 5)] * (AMPLITUD_RELATIVA_LINEA[linea] ?? 0.85);
  const desde = 0.5 - amplitud / 2;
  const hasta = 0.5 + amplitud / 2;
  return Array.from({ length: n }, (_, i) => desde + ((hasta - desde) * i) / (n - 1));
}

// Porción de cancha (en % del contenedor) que ocupa el tablero de un equipo.
function espacioEquipo(equipo, esPlantel) {
  const span = esPlantel ? ANCHO_CAMPO : ANCHO_CAMPO * FRACCION_CAMPO_POR_EQUIPO;
  const izq = esPlantel || equipo === 'A' ? CAMPO_JUGABLE.izq : CAMPO_JUGABLE.der - span;
  return { izq, span };
}

// Coordenada (fx, fy) del asiento número n de cada línea, en el espacio del
// equipo, con clamp por el medio asiento para que nada se salga del campo.
function coordenadasDeLinea({ equipo, esPlantel, linea, cupo }) {
  const { span } = espacioEquipo(equipo, esPlantel);
  const margenX = ASIENTO_CQW / 2 / span; // medio asiento, en la escala de la línea
  const margenY = (ASIENTO_CQW / 2 * ASPECTO_CANCHA) / ALTO_CAMPO; // idem, en vertical
  let fx = PROFUNDIDAD_LINEA[linea] ?? 0.5;
  if (equipo === 'B' && !esPlantel) fx = 1 - fx; // el equipo B espeja la formación
  fx = limitar(fx, margenX, 1 - margenX);
  return dispersaLinea(linea, Math.max(1, cupo)).map((fyCruda) => ({
    fx,
    fy: limitar(fyCruda, margenY, 1 - margenY),
  }));
}

function Asiento({ equipo, linea, ordenLinea, jugador, draggable, estilo }) {
  const { setNodeRef, isOver } = useDroppable({
    id: claveUbicacion(equipo, linea, ordenLinea),
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      className={clsx(styles.asiento, !jugador && styles.asientoVacio, isOver && styles.asientoOver)}
    >
      {jugador && (
        <Jugador
          usuarioId={jugador.usuarioId}
          invitadoId={jugador.invitadoId}
          nombre={jugador.nombre}
          linea={linea}
          draggable={draggable}
        />
      )}
    </div>
  );
}

function MitadCancha({ equipo, esPlantel, estructura, ubicaciones, draggable }) {
  const columnas = [{ key: 'arquero', cantidad: 1 }, ...estructura];
  const hayArqueroUbicado = ubicaciones.some((u) => u.equipo === equipo && u.linea === 'arquero');
  const { izq, span } = espacioEquipo(equipo, esPlantel);
  // El tablero del equipo: caja absoluta que cubre la porción de cancha jugable
  // que ocupa este equipo (los asientos se posicionan en % propios de esta caja).
  const estilo = {
    left: `${izq}%`,
    top: `${CAMPO_JUGABLE.arri}%`,
    width: `${span}%`,
    height: `${ALTO_CAMPO}%`,
  };

  if (estructura.length === 0 && !hayArqueroUbicado) {
    return (
      <div className={styles.mitad} style={estilo}>
        <div className={styles.mitadVacia}>Elegí una formación para armar este equipo.</div>
      </div>
    );
  }

  // Asiento por asiento: cada línea se dibuja en su profundidad táctica y sus
  // jugadores se reparten lateralmente (ver coordenadasDeLinea).
  const asientos = [];
  for (const { key, cantidad } of columnas) {
    const jugadoresLinea = ubicaciones.filter((u) => u.equipo === equipo && u.linea === key);
    // Nunca menos asientos que jugadores ya ubicados en esta línea: si por alguna
    // razón hay más jugadores que el cupo de la formación, igual deben renderizarse.
    const cupoEfectivo = Math.max(cantidad, jugadoresLinea.length);
    const jugadorPorOrden = new Map(jugadoresLinea.map((jugador) => [jugador.ordenLinea, jugador]));
    coordenadasDeLinea({ equipo, esPlantel, linea: key, cupo: cupoEfectivo }).forEach(({ fx, fy }, ordenLinea) => {
      asientos.push(
        <Asiento
          key={`${key}-${ordenLinea}`}
          equipo={equipo}
          linea={key}
          ordenLinea={ordenLinea}
          jugador={jugadorPorOrden.get(ordenLinea) || null}
          draggable={draggable}
          estilo={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
        />
      );
    });
  }

  return (
    <div className={styles.mitad} style={estilo}>
      {asientos}
    </div>
  );
}

// Dado el conjunto de keys ya usadas por OTRAS líneas, devuelve las keys que una línea
// puede tomar sin duplicar ninguna y sin mezclar "medio" con "medioContencion"/"medioOfensivo".
function keysCompatibles(keysDeOtrasLineas) {
  const tieneMedio = keysDeOtrasLineas.includes('medio');
  const tieneSplit = keysDeOtrasLineas.some((k) => k === 'medioContencion' || k === 'medioOfensivo');
  return ORDEN_LINEAS_CAMPO.filter((key) => {
    if (keysDeOtrasLineas.includes(key)) return false;
    if (key === 'medio' && tieneSplit) return false;
    if ((key === 'medioContencion' || key === 'medioOfensivo') && tieneMedio) return false;
    return true;
  });
}

// Una selección "Libre" es inválida sólo cuando la suma de sus líneas no cubre
// exactamente los jugadores de campo del equipo. Automático y catálogo siempre son válidos.
function seleccionLibreEsInvalida(seleccion, jugadoresDeCampo) {
  if (seleccion.codigo !== CODIGO_LIBRE) return false;
  const suma = (seleccion.lineas || []).reduce((acc, l) => acc + l.cantidad, 0);
  return suma !== jugadoresDeCampo;
}

function SelectorFormacion({ etiqueta, cantidadJugadores, seleccion, onCambiar, disabled }) {
  const opciones = listarFormaciones(cantidadJugadores);
  const jugadoresDeCampo = cantidadJugadores - 1;
  const sumaLibre = (seleccion.lineas || []).reduce((acc, l) => acc + l.cantidad, 0);
  const puedeAgregarLinea =
    seleccion.lineas.length < 4 && keysCompatibles(seleccion.lineas.map((l) => l.key)).length > 0;

  function actualizarLineaLibre(indice, delta) {
    const lineas = [...seleccion.lineas];
    lineas[indice] = { ...lineas[indice], cantidad: Math.max(1, lineas[indice].cantidad + delta) };
    onCambiar({ codigo: CODIGO_LIBRE, lineas });
  }

  function cambiarKeyLinea(indice, nuevaKey) {
    const lineas = seleccion.lineas.map((l, i) => (i === indice ? { ...l, key: nuevaKey } : l));
    onCambiar({ codigo: CODIGO_LIBRE, lineas });
  }

  function agregarLineaLibre() {
    if (seleccion.lineas.length >= 4) return;
    const disponibles = keysCompatibles(seleccion.lineas.map((l) => l.key));
    if (disponibles.length === 0) return;
    onCambiar({ codigo: CODIGO_LIBRE, lineas: [...seleccion.lineas, { key: disponibles[0], cantidad: 1 }] });
  }

  function quitarLineaLibre(indice) {
    if (seleccion.lineas.length <= 2) return;
    onCambiar({ codigo: CODIGO_LIBRE, lineas: seleccion.lineas.filter((_, i) => i !== indice) });
  }

  return (
    <div className={styles.selectorWrapper}>
      <label className={styles.selectorLabel}>{etiqueta}</label>
      <select
        className={styles.selectFormacion}
        value={seleccion.codigo}
        disabled={disabled}
        onChange={(evento) => {
          const codigo = evento.target.value;
          if (codigo === CODIGO_LIBRE) {
            onCambiar({ codigo: CODIGO_LIBRE, lineas: [{ key: 'defensa', cantidad: 1 }, { key: 'delantero', cantidad: Math.max(1, jugadoresDeCampo - 1) }] });
          } else {
            onCambiar({ codigo, lineas: [] });
          }
        }}
      >
        <option value={CODIGO_AUTOMATICO}>Automático (parejo)</option>
        {opciones.map((formacion) => (
          <option key={formacion.codigo} value={formacion.codigo}>
            {formacion.codigo} — {formacion.nombre}
          </option>
        ))}
        {jugadoresDeCampo >= 2 && <option value={CODIGO_LIBRE}>Libre</option>}
      </select>

      {seleccion.codigo === CODIGO_LIBRE && (
        <div className={styles.panelLibre}>
          {seleccion.lineas.map((linea, indice) => {
            const opcionesLinea = keysCompatibles(
              seleccion.lineas.filter((_, i) => i !== indice).map((l) => l.key)
            );
            return (
              <div key={indice} className={styles.filaLinea}>
                <select
                  className={styles.selectLinea}
                  value={linea.key}
                  disabled={disabled}
                  onChange={(evento) => cambiarKeyLinea(indice, evento.target.value)}
                >
                  {opcionesLinea.map((key) => (
                    <option key={key} value={key}>
                      {ETIQUETAS_LINEA[key]}
                    </option>
                  ))}
                </select>
                <div className={styles.controlesLinea}>
                  <button type="button" disabled={disabled} onClick={() => actualizarLineaLibre(indice, -1)}>
                    -
                  </button>
                  <span>{linea.cantidad}</span>
                  <button type="button" disabled={disabled} onClick={() => actualizarLineaLibre(indice, 1)}>
                    +
                  </button>
                  <button
                    type="button"
                    disabled={disabled || seleccion.lineas.length <= 2}
                    onClick={() => quitarLineaLibre(indice)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
          <div className={styles.filaResumenLibre}>
            <button
              type="button"
              disabled={disabled || !puedeAgregarLinea}
              onClick={agregarLineaLibre}
              className={styles.enlaceSubrayado}
            >
              + línea
            </button>
            <span className={sumaLibre === jugadoresDeCampo ? styles.contadorOk : styles.contadorError}>
              {sumaLibre}/{jugadoresDeCampo} jugadores de campo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const CODIGO_ACTUAL = 'actual';

// Dropdown puramente visual: no cambia la formación real (ya definida por la votación),
// sólo reagrupa a los mismos jugadores en las líneas de la formación elegida para mostrarla.
function SelectorFormacionVisual({ etiqueta, cantidadJugadores, valor, onCambiar }) {
  const opciones = listarFormaciones(cantidadJugadores);
  return (
    <div className={styles.selectorWrapper}>
      <label className={styles.selectorLabel}>{etiqueta}</label>
      <select
        className={styles.selectFormacion}
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value)}
      >
        <option value={CODIGO_ACTUAL}>Como quedó</option>
        {opciones.map((formacion) => (
          <option key={formacion.codigo} value={formacion.codigo}>
            {formacion.codigo} — {formacion.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

// Reordena los jugadores de campo de un equipo (ya fijados por la votación) en las líneas
// de la formación visual elegida. Sólo cambia linea/ordenLinea para el render; no toca equipo.
function reflowVisual(jugadoresDeCampoOrdenados, lineasNuevas) {
  const resultado = [];
  let indice = 0;
  for (const { key, cantidad } of ordenarLineas(lineasNuevas)) {
    for (let i = 0; i < cantidad; i += 1) {
      const jugador = jugadoresDeCampoOrdenados[indice];
      if (!jugador) break;
      resultado.push({ ...jugador, linea: key, ordenLinea: i });
      indice += 1;
    }
  }
  return resultado;
}

export default function MapaCancha({
  partidoId,
  formacion,
  esAdmin,
  onGuardado,
  propuestasInfo,
  previewPropuesta,
  onPropuesto,
  onSalirPreview,
  jugadores,
  onPromovido,
}) {
  const { grupoActivo } = useGrupo();
  const { perfil } = useAuth();
  const navigate = useNavigate();
  // Modo plantel: un solo equipo, y el esquema elegido queda persistido en el
  // partido (formacionCodigo), así que la selección se restaura de ahí.
  const esPlantel = formacion?.modo === 'plantel';
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
  const [seleccionA, setSeleccionA] = useState(() =>
    formacion?.modo === 'plantel'
      ? {
          codigo: formacion.formacionCodigo || CODIGO_AUTOMATICO,
          lineas:
            formacion.formacionCodigo === CODIGO_LIBRE
              ? estructuraDesdeUbicaciones(formacion.jugadores || [], 'A')
              : [],
        }
      : { codigo: CODIGO_AUTOMATICO, lineas: [] }
  );
  const [seleccionB, setSeleccionB] = useState({ codigo: CODIGO_AUTOMATICO, lineas: [] });
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [proponiendo, setProponiendo] = useState(false);
  const [promoviendoId, setPromoviendoId] = useState(null);
  const [formacionVisualA, setFormacionVisualA] = useState(CODIGO_ACTUAL);
  const [formacionVisualB, setFormacionVisualB] = useState(CODIGO_ACTUAL);
  const modoPreview = Boolean(previewPropuesta);
  const votacionCerrada = Boolean(propuestasInfo?.votacionEquiposCerrada);

  useEffect(() => {
    const jugadoresActuales = formacion?.jugadores || [];
    setUbicaciones((anterior) => {
      const anteriorPorId = new Map(anterior.map((jugador) => [claveJugador(jugador), jugador]));
      const fusionados = jugadoresActuales.map((jugador) => anteriorPorId.get(claveJugador(jugador)) || jugador);

      const ubicacionesVistas = new Set();
      return fusionados.map((jugador) => {
        if (!jugador.equipo) return jugador;
        const clave = claveUbicacion(jugador.equipo, jugador.linea, jugador.ordenLinea);
        if (ubicacionesVistas.has(clave)) {
          return { ...jugador, equipo: null, linea: null, ordenLinea: null };
        }
        ubicacionesVistas.add(clave);
        return jugador;
      });
    });
  }, [formacion]);

  // Modo plantel: si el estado del servidor cambió (otro admin guardó otro esquema),
  // sincronizar la selección local con el formacionCodigo persistido.
  useEffect(() => {
    if (!formacion || formacion.modo !== 'plantel') return;
    const codigo = formacion.formacionCodigo || CODIGO_AUTOMATICO;
    setSeleccionA((actual) => {
      if (actual.codigo === codigo) return actual;
      return {
        codigo,
        lineas: codigo === CODIGO_LIBRE ? estructuraDesdeUbicaciones(formacion.jugadores || [], 'A') : [],
      };
    });
  }, [formacion]);

  if (!formacion || !formacion.habilitado) {
    return (
      <div className={styles.avisoDeshabilitado}>
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

  // En modo plantel existe un solo equipo y su cupo es el total de titulares del partido.
  const cupoEquipo = (equipo) => (esPlantel ? formacion.cupo : formacion.cupoPorEquipo[equipo]);

  // Una vez cerrada la votación, el equipo real ya no se edita: el dropdown de formación
  // pasa a ser meramente visual (reordena a los mismos jugadores en otras líneas para mostrar).
  function jugadoresDeCampoOrdenados(equipo) {
    return ubicaciones
      .filter((j) => j.equipo === equipo && j.linea && j.linea !== 'arquero')
      .sort(
        (a, b) =>
          ORDEN_LINEAS_CAMPO.indexOf(a.linea) - ORDEN_LINEAS_CAMPO.indexOf(b.linea) || a.ordenLinea - b.ordenLinea
      );
  }

  function lineasVisual(equipo, codigoVisual) {
    if (codigoVisual === CODIGO_ACTUAL) return null;
    return listarFormaciones(cupoEquipo(equipo)).find((f) => f.codigo === codigoVisual)?.lineas || [];
  }

  const lineasVisualA = votacionCerrada && !modoPreview ? lineasVisual('A', formacionVisualA) : null;
  const lineasVisualB = votacionCerrada && !modoPreview ? lineasVisual('B', formacionVisualB) : null;
  const reflowA = lineasVisualA ? reflowVisual(jugadoresDeCampoOrdenados('A'), lineasVisualA) : null;
  const reflowB = lineasVisualB ? reflowVisual(jugadoresDeCampoOrdenados('B'), lineasVisualB) : null;

  const ubicacionesMostradas = modoPreview
    ? previewPropuesta
    : reflowA || reflowB
      ? ubicaciones.map((jugador) => {
          if (jugador.equipo === 'A' && reflowA) return reflowA.find((r) => claveJugador(r) === claveJugador(jugador)) || jugador;
          if (jugador.equipo === 'B' && reflowB) return reflowB.find((r) => claveJugador(r) === claveJugador(jugador)) || jugador;
          return jugador;
        })
      : ubicaciones;

  // En modo preview (viendo una propuesta ajena) la estructura se deriva directo de los
  // asientos de la propuesta, ignorando por completo seleccionA/B y el cupo de la formación.
  // "Automático" no tiene preview antes de generar: si el equipo ya tiene jugadores ubicados
  // (p.ej. tras recargar la página con una formación guardada), se preserva ese layout real.
  // Si no tiene ninguno (p.ej. justo después de cambiar la selección a Automático), se usa un
  // reparto parejo sintético como preview/borrador para que el tablero no quede sin asientos.
  const estructuraA = modoPreview
    ? estructuraDesdeUbicaciones(ubicacionesMostradas, 'A')
    : votacionCerrada
      ? lineasVisualA
        ? ordenarLineas(lineasVisualA)
        : estructuraDesdeUbicaciones(ubicaciones, 'A')
      : seleccionA.codigo === CODIGO_AUTOMATICO
        ? ubicaciones.some((j) => j.equipo === 'A')
          ? estructuraDesdeUbicaciones(ubicaciones, 'A')
          : ordenarLineas(normalizarAutomatico(cupoEquipo('A')))
        : seleccionA.codigo === CODIGO_LIBRE
          ? ordenarLineas(seleccionA.lineas)
          : ordenarLineas(listarFormaciones(cupoEquipo('A')).find((f) => f.codigo === seleccionA.codigo)?.lineas || []);
  const estructuraB = modoPreview
    ? estructuraDesdeUbicaciones(ubicacionesMostradas, 'B')
    : votacionCerrada
      ? lineasVisualB
        ? ordenarLineas(lineasVisualB)
        : estructuraDesdeUbicaciones(ubicaciones, 'B')
      : seleccionB.codigo === CODIGO_AUTOMATICO
        ? ubicaciones.some((j) => j.equipo === 'B')
          ? estructuraDesdeUbicaciones(ubicaciones, 'B')
          : ordenarLineas(normalizarAutomatico(cupoEquipo('B')))
        : seleccionB.codigo === CODIGO_LIBRE
          ? ordenarLineas(seleccionB.lineas)
          : ordenarLineas(listarFormaciones(cupoEquipo('B')).find((f) => f.codigo === seleccionB.codigo)?.lineas || []);

  const sinUbicar = ubicaciones.filter((jugador) => !jugador.equipo);

  const jugadoresDeCampoA = cupoEquipo('A') - 1;
  const jugadoresDeCampoB = esPlantel ? 0 : cupoEquipo('B') - 1;
  const seleccionInvalida =
    seleccionLibreEsInvalida(seleccionA, jugadoresDeCampoA) ||
    (!esPlantel && seleccionLibreEsInvalida(seleccionB, jugadoresDeCampoB));

  function cambiarSeleccion(equipo, nuevaSeleccion) {
    const seleccionAnterior = equipo === 'A' ? seleccionA : seleccionB;
    const setSeleccion = equipo === 'A' ? setSeleccionA : setSeleccionB;
    setSeleccion(nuevaSeleccion);

    // Sólo se limpian las ubicaciones del equipo si la forma realmente cambió: un +/- de Libre
    // que no modifica ninguna cantidad (p.ej. "-" en una línea ya en su piso de 1) no debe
    // desarmar lo que el admin ya acomodó. Cambiar de código (Automático/catálogo/Libre)
    // siempre se considera un cambio real de forma.
    const mismaForma =
      seleccionAnterior.codigo === nuevaSeleccion.codigo &&
      serializarLineas(seleccionAnterior.lineas) === serializarLineas(nuevaSeleccion.lineas);
    if (mismaForma) return;

    setUbicaciones((anterior) =>
      anterior.map((jugador) =>
        jugador.equipo === equipo ? { ...jugador, equipo: null, linea: null, ordenLinea: null } : jugador
      )
    );
  }

  function manejarDragEnd(evento) {
    const { active, over } = evento;
    if (!over) return;
    const [equipo, linea, ordenLineaTexto] = over.id.split('-');
    const ordenLinea = Number(ordenLineaTexto);
    const activoId = active.id;

    setUbicaciones((anterior) => {
      const activo = anterior.find((jugador) => claveJugador(jugador) === activoId);
      if (!activo) return anterior;
      if (activo.equipo === equipo && activo.linea === linea && activo.ordenLinea === ordenLinea) return anterior;

      const ocupante = anterior.find(
        (jugador) => jugador.equipo === equipo && jugador.linea === linea && jugador.ordenLinea === ordenLinea
      );
      const posicionAnterior = { equipo: activo.equipo, linea: activo.linea, ordenLinea: activo.ordenLinea };

      return anterior.map((jugador) => {
        if (claveJugador(jugador) === activoId) return { ...jugador, equipo, linea, ordenLinea };
        if (ocupante && claveJugador(jugador) === claveJugador(ocupante)) return { ...jugador, ...posicionAnterior };
        return jugador;
      });
    });
  }

  async function generarAutomaticamente() {
    setError('');
    setGenerando(true);
    try {
      // En modo plantel solo existe el equipo A; el backend también acepta la
      // selección sin el prefijo de equipo (seleccion.A || seleccion).
      const body = esPlantel
        ? { A: { codigo: seleccionA.codigo, lineas: seleccionA.lineas } }
        : {
            A: { codigo: seleccionA.codigo, lineas: seleccionA.lineas },
            B: { codigo: seleccionB.codigo, lineas: seleccionB.lineas },
          };
      const { data } = await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion/auto`), body);
      setUbicaciones(data.jugadores);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerando(false);
    }
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      const asignaciones = ubicaciones
        .filter((jugador) => jugador.equipo)
        .map((jugador) => ({
          usuarioId: jugador.usuarioId ?? null,
          invitadoId: jugador.invitadoId ?? null,
          equipo: jugador.equipo,
          linea: jugador.linea,
          ordenLinea: jugador.ordenLinea,
          lado: jugador.lado ?? null,
        }));
      // En modo plantel se persiste además el esquema elegido en el partido
      // (formacionCodigo) y, si es libre, las líneas exactas.
      const payload = { asignaciones };
      if (esPlantel) {
        payload.formacionCodigo = seleccionA.codigo;
        if (seleccionA.codigo === CODIGO_LIBRE) payload.lineasLibres = seleccionA.lineas;
      }
      const { data } = await api.put(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion`), payload);
      setUbicaciones(data.jugadores);
      onGuardado?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function proponerParaVotacion() {
    setError('');
    setProponiendo(true);
    try {
      // El backend construye la propuesta a partir de las Inscripciones ya guardadas,
      // no de lo que está arrastrado en pantalla: hay que guardar primero para que la
      // propuesta coincida con lo que el admin ve en el tablero.
      const asignaciones = ubicaciones
        .filter((jugador) => jugador.equipo)
        .map((jugador) => ({
          usuarioId: jugador.usuarioId ?? null,
          invitadoId: jugador.invitadoId ?? null,
          equipo: jugador.equipo,
          linea: jugador.linea,
          ordenLinea: jugador.ordenLinea,
          lado: jugador.lado ?? null,
        }));
      await api.put(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion`), { asignaciones });
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formaciones-propuestas`));
      await onPropuesto?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProponiendo(false);
    }
  }

  const totalCupoTitulares = esPlantel ? formacion.cupo : formacion.cupoPorEquipo.A + formacion.cupoPorEquipo.B;
  const haySlotDeTitularLibre = ubicaciones.length < totalCupoTitulares;
  const suplentes = (jugadores || []).filter((jugador) => jugador.tipo === 'suplente');

  async function promoverSuplente(usuarioId) {
    setError('');
    setPromoviendoId(usuarioId);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/promover/${usuarioId}`));
      await onPromovido?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setPromoviendoId(null);
    }
  }

  const miEquipo = formacion.jugadores.find((jugador) => jugador.usuarioId === perfil?.uid)?.equipo;
  const puedeVerMiEquipo = Boolean(propuestasInfo?.votacionEquiposCerrada && miEquipo && !modoPreview);

  const contenido = (
    <div className={styles.contenedor}>
      <div className={styles.headerFila}>
        <h4 className={styles.titulo}>Formación</h4>
        {puedeVerMiEquipo && (
          <button
            type="button"
            onClick={() => navigate(`/mi-equipo/${partidoId}`)}
            className={styles.botonMiEquipo}
          >
            <FaComment />
            Mi equipo
          </button>
        )}
      </div>

      {modoPreview && (
        <div className={styles.bannerPreview}>
          <span>Vista previa de una propuesta</span>
          <button type="button" className={styles.enlaceSubrayado} onClick={onSalirPreview}>
            Volver a formación oficial
          </button>
        </div>
      )}

      {esAdmin && !modoPreview && !votacionCerrada && (
        <div className={styles.gridSelectores}>
          {esPlantel ? (
            <SelectorFormacion
              etiqueta="Formación del equipo"
              cantidadJugadores={formacion.cupo}
              seleccion={seleccionA}
              onCambiar={(nueva) => cambiarSeleccion('A', nueva)}
              disabled={generando || guardando}
            />
          ) : (
            <>
              <SelectorFormacion
                etiqueta="Equipo 1"
                cantidadJugadores={formacion.cupoPorEquipo.A}
                seleccion={seleccionA}
                onCambiar={(nueva) => cambiarSeleccion('A', nueva)}
                disabled={generando || guardando}
              />
              <SelectorFormacion
                etiqueta="Equipo 2"
                cantidadJugadores={formacion.cupoPorEquipo.B}
                seleccion={seleccionB}
                onCambiar={(nueva) => cambiarSeleccion('B', nueva)}
                disabled={generando || guardando}
              />
            </>
          )}
        </div>
      )}

      {!modoPreview && votacionCerrada && (
        <div className={styles.gridSelectores}>
          <SelectorFormacionVisual
            etiqueta="Equipo 1"
            cantidadJugadores={formacion.cupoPorEquipo.A}
            valor={formacionVisualA}
            onCambiar={setFormacionVisualA}
          />
          <SelectorFormacionVisual
            etiqueta="Equipo 2"
            cantidadJugadores={formacion.cupoPorEquipo.B}
            valor={formacionVisualB}
            onCambiar={setFormacionVisualB}
          />
        </div>
      )}

      <div
        className={styles.cancha}
        style={{ backgroundImage: "url('/layout-cancha-futbol.jpeg')" }}
      >
        {esPlantel ? (
          <MitadCancha
            equipo="A"
            esPlantel
            estructura={estructuraA}
            ubicaciones={ubicacionesMostradas}
            draggable={esAdmin && !modoPreview && !votacionCerrada}
          />
        ) : (
          <>
            <MitadCancha
              equipo="A"
              esPlantel={false}
              estructura={estructuraA}
              ubicaciones={ubicacionesMostradas}
              draggable={esAdmin && !modoPreview && !votacionCerrada}
            />
            <div className={styles.divisor} />
            <MitadCancha
              equipo="B"
              esPlantel={false}
              estructura={estructuraB}
              ubicaciones={ubicacionesMostradas}
              draggable={esAdmin && !modoPreview && !votacionCerrada}
            />
          </>
        )}
      </div>

      {esAdmin && !modoPreview && !votacionCerrada && sinUbicar.length > 0 && (
        <div className={styles.bloque}>
          <p className={styles.seccionLabel}>Sin ubicar</p>
          <div className={styles.listaSinUbicar}>
            {sinUbicar.map((jugador) => (
              <Jugador
                key={claveJugador(jugador)}
                usuarioId={jugador.usuarioId}
                invitadoId={jugador.invitadoId}
                nombre={jugador.nombre}
                draggable
              />
            ))}
          </div>
        </div>
      )}

      {esAdmin && !modoPreview && !votacionCerrada && suplentes.length > 0 && (
        <div className={styles.bloque}>
          <p className={styles.seccionLabel}>Suplentes</p>
          <ul className={styles.listaSuplentes}>
            {suplentes.map((suplente) => (
              <li
                key={suplente.usuarioId || suplente.invitadoId}
                className={styles.itemSuplente}
              >
                <span className={styles.nombreSuplente}>{suplente.nombre}</span>
                {!suplente.esInvitado && (
                  <Boton
                    variante="ghost"
                    className={styles.botonPromover}
                    onClick={() => promoverSuplente(suplente.usuarioId)}
                    disabled={!haySlotDeTitularLibre || promoviendoId === suplente.usuarioId}
                  >
                    {promoviendoId === suplente.usuarioId ? 'Poniendo…' : 'Poner de titular'}
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {esAdmin && !modoPreview && (
        <>
          {error && <p className={styles.mensajeError}>{error}</p>}
          {!votacionCerrada && (
            <Boton
              variante="ghost"
              className={styles.botonMt4Full}
              onClick={generarAutomaticamente}
              disabled={generando || guardando || seleccionInvalida}
            >
              {generando
                ? 'Generando…'
                : esPlantel
                  ? 'Generar formación automática'
                  : 'Generar equipos automáticos'}
            </Boton>
          )}
          <Boton
            variante="primario"
            className={styles.botonMt2Full}
            onClick={guardar}
            disabled={guardando || seleccionInvalida || votacionCerrada}
          >
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
          {!esPlantel && !votacionCerrada && (
            <Boton
              variante="ghost"
              className={styles.botonMt2Full}
              onClick={proponerParaVotacion}
              disabled={proponiendo || guardando || seleccionInvalida || (propuestasInfo?.propuestas?.length || 0) >= 5}
            >
              {proponiendo ? 'Proponiendo…' : 'Proponer para votación'}
            </Boton>
          )}
        </>
      )}
    </div>
  );

  if (!esAdmin || modoPreview || votacionCerrada) return contenido;

  return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;
}
