import { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../services/api';
import Boton from './Boton';
import {
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  ETIQUETAS_LINEA,
  ORDEN_LINEAS_CAMPO,
  listarFormaciones,
  normalizarAutomatico,
} from '../utils/formaciones';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';

function claveUbicacion(equipo, linea, ordenLinea) {
  return `${equipo}-${linea}-${ordenLinea}`;
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

function Jugador({ usuarioId, nombre, linea, draggable }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: usuarioId,
    disabled: !draggable,
  });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`group relative flex flex-col items-center gap-0.5 ${draggable ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs font-semibold text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100">
        {nombre}
      </span>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-cancha-700 text-sm font-bold text-white shadow">
        {obtenerIniciales(nombre)}
      </div>
      <div className="whitespace-nowrap rounded bg-cancha-800 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase text-white/80 shadow">
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
      className={`flex min-h-7 w-7 items-center justify-center rounded-lg sm:min-h-14 sm:w-14 ${
        jugador ? '' : 'border border-dashed border-white/20'
      } ${isOver ? 'bg-pasto-600/20' : ''}`}
    >
      {jugador && (
        <Jugador usuarioId={jugador.usuarioId} nombre={jugador.nombre} linea={linea} draggable={draggable} />
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
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 self-stretch py-3 sm:gap-3">
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
      <div className="flex min-w-0 flex-1 items-center justify-center px-2 py-4 text-center text-xs text-white/40">
        Elegí una formación para armar este equipo.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1 px-2 py-4">
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
    <div className="mb-2 flex flex-col gap-2">
      <label className="text-xs uppercase text-white/40">{etiqueta}</label>
      <select
        className="rounded-lg bg-cancha-700 px-2 py-1 text-sm text-white"
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
        <div className="rounded-lg bg-cancha-800 p-2 text-xs text-white/80">
          {seleccion.lineas.map((linea, indice) => {
            const opcionesLinea = keysCompatibles(
              seleccion.lineas.filter((_, i) => i !== indice).map((l) => l.key)
            );
            return (
              <div key={indice} className="mb-1 flex items-center justify-between gap-2">
                <select
                  className="rounded bg-cancha-700 px-1 py-0.5 text-xs text-white"
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
                <div className="flex items-center gap-2">
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
          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              disabled={disabled || !puedeAgregarLinea}
              onClick={agregarLineaLibre}
              className="underline"
            >
              + línea
            </button>
            <span className={sumaLibre === jugadoresDeCampo ? 'text-pasto-500' : 'text-sancion'}>
              {sumaLibre}/{jugadoresDeCampo} jugadores de campo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapaCancha({ partidoId, formacion, esAdmin, onGuardado }) {
  const { grupoActivo } = useGrupo();
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
  const [seleccionA, setSeleccionA] = useState({ codigo: CODIGO_AUTOMATICO, lineas: [] });
  const [seleccionB, setSeleccionB] = useState({ codigo: CODIGO_AUTOMATICO, lineas: [] });
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const jugadoresActuales = formacion?.jugadores || [];
    setUbicaciones((anterior) => {
      const anteriorPorId = new Map(anterior.map((jugador) => [jugador.usuarioId, jugador]));
      const fusionados = jugadoresActuales.map((jugador) => anteriorPorId.get(jugador.usuarioId) || jugador);

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
      <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 text-sm text-white/50 shadow-lg">
        El mapa se habilita cuando se complete el cupo de titulares.
      </div>
    );
  }

  // "Automático" no tiene preview antes de generar: si el equipo ya tiene jugadores ubicados
  // (p.ej. tras recargar la página con una formación guardada), se preserva ese layout real.
  // Si no tiene ninguno (p.ej. justo después de cambiar la selección a Automático), se usa un
  // reparto parejo sintético como preview/borrador para que el tablero no quede sin asientos.
  const estructuraA =
    seleccionA.codigo === CODIGO_AUTOMATICO
      ? ubicaciones.some((j) => j.equipo === 'A')
        ? estructuraDesdeUbicaciones(ubicaciones, 'A')
        : ordenarLineas(normalizarAutomatico(formacion.cupoPorEquipo.A))
      : seleccionA.codigo === CODIGO_LIBRE
        ? ordenarLineas(seleccionA.lineas)
        : ordenarLineas(listarFormaciones(formacion.cupoPorEquipo.A).find((f) => f.codigo === seleccionA.codigo)?.lineas || []);
  const estructuraB =
    seleccionB.codigo === CODIGO_AUTOMATICO
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
      const activo = anterior.find((jugador) => jugador.usuarioId === activoId);
      if (!activo) return anterior;
      if (activo.equipo === equipo && activo.linea === linea && activo.ordenLinea === ordenLinea) return anterior;

      const ocupante = anterior.find(
        (jugador) => jugador.equipo === equipo && jugador.linea === linea && jugador.ordenLinea === ordenLinea
      );
      const posicionAnterior = { equipo: activo.equipo, linea: activo.linea, ordenLinea: activo.ordenLinea };

      return anterior.map((jugador) => {
        if (jugador.usuarioId === activoId) return { ...jugador, equipo, linea, ordenLinea };
        if (ocupante && jugador.usuarioId === ocupante.usuarioId) return { ...jugador, ...posicionAnterior };
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
          usuarioId: jugador.usuarioId,
          equipo: jugador.equipo,
          linea: jugador.linea,
          ordenLinea: jugador.ordenLinea,
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

  const contenido = (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-pasto-500">Formación</h4>

      {esAdmin && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <div
        className="flex aspect-[1.83] w-full overflow-hidden rounded-lg border border-white/10 bg-cover bg-center shadow-inner"
        style={{ backgroundImage: "url('/layout-cancha-futbol.jpeg')" }}
      >
        <MitadCancha equipo="A" estructura={estructuraA} ubicaciones={ubicaciones} draggable={esAdmin} />
        <div className="w-px bg-white/20" />
        <MitadCancha equipo="B" estructura={estructuraB} ubicaciones={ubicaciones} draggable={esAdmin} />
      </div>

      {esAdmin && sinUbicar.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase text-white/40">Sin ubicar</p>
          <div className="flex flex-wrap gap-2">
            {sinUbicar.map((jugador) => (
              <Jugador key={jugador.usuarioId} usuarioId={jugador.usuarioId} nombre={jugador.nombre} draggable />
            ))}
          </div>
        </div>
      )}

      {esAdmin && (
        <>
          {error && <p className="mt-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
          <Boton
            variante="ghost"
            className="mt-4 w-full"
            onClick={generarAutomaticamente}
            disabled={generando || guardando || seleccionInvalida}
          >
            {generando ? 'Generando…' : 'Generar equipos automáticos'}
          </Boton>
          <Boton
            variante="primario"
            className="mt-2 w-full"
            onClick={guardar}
            disabled={guardando || seleccionInvalida}
          >
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
        </>
      )}
    </div>
  );

  if (!esAdmin) return contenido;

  return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;
}
