import { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../services/api';
import Boton from './Boton';
import { LINEAS } from '../utils/formacion';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';

const ETIQUETAS_LINEA = {
  arquero: 'POR',
  defensa: 'DEF',
  medio: 'MED',
  delantero: 'ATA',
};

function claveUbicacion(equipo, linea, ordenLinea) {
  return `${equipo}-${linea}-${ordenLinea}`;
}

const CUPO_LINEA = { arquero: 1, defensa: 4, medio: 4, delantero: 4 };

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

function Columna({ equipo, linea, jugadores, draggable }) {
  const jugadorPorOrden = new Map(jugadores.map((jugador) => [jugador.ordenLinea, jugador]));
  const cupo = draggable ? Math.max(CUPO_LINEA[linea], jugadores.length) : jugadores.length;
  const asientos = Array.from({ length: cupo }, (_, ordenLinea) => jugadorPorOrden.get(ordenLinea) || null);

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

const LINEAS_POR_EQUIPO = {
  A: LINEAS,
  B: [...LINEAS].reverse(),
};

function MitadCancha({ equipo, ubicaciones, draggable }) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1 px-2 py-4">
      {LINEAS_POR_EQUIPO[equipo].map((linea) => {
        const jugadoresLinea = ubicaciones.filter((u) => u.equipo === equipo && u.linea === linea);
        return (
          <Columna key={linea} equipo={equipo} linea={linea} jugadores={jugadoresLinea} draggable={draggable} />
        );
      })}
    </div>
  );
}

export default function MapaCancha({ partidoId, formacion, esAdmin, onGuardado }) {
  const { grupoActivo } = useGrupo();
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
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

  const sinUbicar = ubicaciones.filter((jugador) => !jugador.equipo);

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
      const { data } = await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/formacion/auto`));
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
      <div
        className="flex aspect-[1.83] w-full overflow-hidden rounded-lg border border-white/10 bg-cover bg-center shadow-inner"
        style={{ backgroundImage: "url('/layout-cancha-futbol.jpeg')" }}
      >
        <MitadCancha equipo="A" ubicaciones={ubicaciones} draggable={esAdmin} />
        <div className="w-px bg-white/20" />
        <MitadCancha equipo="B" ubicaciones={ubicaciones} draggable={esAdmin} />
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
            disabled={generando || guardando}
          >
            {generando ? 'Generando…' : 'Generar equipos automáticos'}
          </Boton>
          <Boton variante="primario" className="mt-2 w-full" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
        </>
      )}
    </div>
  );

  if (!esAdmin) return contenido;

  return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;
}
