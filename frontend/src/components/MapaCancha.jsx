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

function Asiento({ equipo, linea, ordenLinea, jugador, draggable }) {
  const { setNodeRef, isOver } = useDroppable({
    id: claveUbicacion(equipo, linea, ordenLinea),
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
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

function Columna({ equipo, linea, cupo, jugadores, draggable }) {
  const jugadorPorOrden = new Map(jugadores.map((jugador) => [jugador.ordenLinea, jugador]));
  // Nunca menos asientos que jugadores ya ubicados en esta columna: si por alguna razón
  // hay más jugadores que el cupo de la formación, igual deben poder renderizarse.
  const cupoEfectivo = Math.max(cupo, jugadores.length);
  const asientos = Array.from({ length: cupoEfectivo }, (_, ordenLinea) => jugadorPorOrden.get(ordenLinea) || null);

  return (
    <div className={styles.columna}>
      {asientos.map((jugador, ordenLinea) => (
        <Asiento
          key={ordenLinea}
          equipo={equipo}
          linea={linea}
          ordenLinea={ordenLinea}
          jugador={jugador}
          draggable={draggable}
        />
      ))}
    </div>
  );
}

function MitadCancha({ equipo, estructura, ubicaciones, draggable }) {
  const columnas = [{ key: 'arquero', cantidad: 1 }, ...estructura];
  const ordenadas = equipo === 'A' ? columnas : [...columnas].reverse();

  const hayArqueroUbicado = ubicaciones.some((u) => u.equipo === equipo && u.linea === 'arquero');

  if (estructura.length === 0 && !hayArqueroUbicado) {
    return (
      <div className={styles.mitadVacia}>
        Elegí una formación para armar este equipo.
      </div>
    );
  }

  return (
    <div className={styles.mitad}>
      {ordenadas.map(({ key, cantidad }) => {
        const jugadoresLinea = ubicaciones.filter((u) => u.equipo === equipo && u.linea === key);
        return (
          <Columna key={key} equipo={equipo} linea={key} cupo={cantidad} jugadores={jugadoresLinea} draggable={draggable} />
        );
      })}
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
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
  const [seleccionA, setSeleccionA] = useState({ codigo: CODIGO_AUTOMATICO, lineas: [] });
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

  if (!formacion || !formacion.habilitado) {
    return (
      <div className={styles.avisoDeshabilitado}>
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

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
    return listarFormaciones(formacion.cupoPorEquipo[equipo]).find((f) => f.codigo === codigoVisual)?.lineas || [];
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
          : ordenarLineas(normalizarAutomatico(formacion.cupoPorEquipo.A))
        : seleccionA.codigo === CODIGO_LIBRE
          ? ordenarLineas(seleccionA.lineas)
          : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.A).find((f) => f.codigo === seleccionA.codigo)?.lineas || []);
  const estructuraB = modoPreview
    ? estructuraDesdeUbicaciones(ubicacionesMostradas, 'B')
    : votacionCerrada
      ? lineasVisualB
        ? ordenarLineas(lineasVisualB)
        : estructuraDesdeUbicaciones(ubicaciones, 'B')
      : seleccionB.codigo === CODIGO_AUTOMATICO
        ? ubicaciones.some((j) => j.equipo === 'B')
          ? estructuraDesdeUbicaciones(ubicaciones, 'B')
          : ordenarLineas(normalizarAutomatico(formacion.cupoPorEquipo.B))
        : seleccionB.codigo === CODIGO_LIBRE
          ? ordenarLineas(seleccionB.lineas)
          : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.B).find((f) => f.codigo === seleccionB.codigo)?.lineas || []);

  const sinUbicar = ubicaciones.filter((jugador) => !jugador.equipo);

  const jugadoresDeCampoA = formacion.cupoPorEquipo.A - 1;
  const jugadoresDeCampoB = formacion.cupoPorEquipo.B - 1;
  const seleccionInvalida =
    seleccionLibreEsInvalida(seleccionA, jugadoresDeCampoA) || seleccionLibreEsInvalida(seleccionB, jugadoresDeCampoB);

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
      const body = {
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
      const { data } = await api.put(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion`), { asignaciones });
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

  const totalCupoTitulares = formacion.cupoPorEquipo.A + formacion.cupoPorEquipo.B;
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
        <MitadCancha
          equipo="A"
          estructura={estructuraA}
          ubicaciones={ubicacionesMostradas}
          draggable={esAdmin && !modoPreview && !votacionCerrada}
        />
        <div className={styles.divisor} />
        <MitadCancha
          equipo="B"
          estructura={estructuraB}
          ubicaciones={ubicacionesMostradas}
          draggable={esAdmin && !modoPreview && !votacionCerrada}
        />
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
              {generando ? 'Generando…' : 'Generar equipos automáticos'}
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
          {!votacionCerrada && (
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
