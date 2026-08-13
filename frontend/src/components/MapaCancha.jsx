import { useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import api from '../services/api';
import Boton from './Boton';
import { LINEAS } from '../utils/formacion';

const ETIQUETAS_LINEA = {
  arquero: 'Arquero',
  defensa: 'Defensa',
  medio: 'Medio',
  delantero: 'Delantero',
};

function idSlot(equipo, linea, ordenLinea) {
  return `${equipo}-${linea}-${ordenLinea}`;
}

function Jugador({ usuarioId, nombre, draggable }) {
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
      className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-cancha-700 p-1 text-center text-[11px] text-white/90 ${
        draggable ? 'cursor-grab touch-none active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {nombre}
    </div>
  );
}

function Slot({ equipo, linea, ordenLinea, jugador, draggable }) {
  const { setNodeRef, isOver } = useDroppable({ id: idSlot(equipo, linea, ordenLinea), disabled: !draggable });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/20 ${
        isOver ? 'bg-pasto-600/30' : ''
      }`}
    >
      {jugador ? <Jugador usuarioId={jugador.usuarioId} nombre={jugador.nombre} draggable={draggable} /> : null}
    </div>
  );
}

function MitadCancha({ equipo, lineasEsperadas, ubicaciones, draggable }) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg bg-pasto-600/10 p-3">
      <h5 className="text-center text-xs font-bold uppercase tracking-wide text-white/70">Equipo {equipo}</h5>
      {LINEAS.map((linea) => {
        const cantidad = lineasEsperadas[linea];
        if (cantidad === 0) return null;
        return (
          <div key={linea} className="flex flex-col gap-1">
            <p className="text-[10px] uppercase text-white/40">{ETIQUETAS_LINEA[linea]}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: cantidad }, (_, ordenLinea) => (
                <Slot
                  key={ordenLinea}
                  equipo={equipo}
                  linea={linea}
                  ordenLinea={ordenLinea}
                  jugador={ubicaciones.find(
                    (u) => u.equipo === equipo && u.linea === linea && u.ordenLinea === ordenLinea
                  )}
                  draggable={draggable}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MapaCancha({ partidoId, formacion, esAdmin, onGuardado }) {
  const jugadoresIniciales = useMemo(() => formacion?.jugadores || [], [formacion]);
  const [ubicaciones, setUbicaciones] = useState(jugadoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

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
    const [equipo, linea, ordenTexto] = over.id.split('-');
    const ordenLinea = Number(ordenTexto);
    const activoId = active.id;

    setUbicaciones((anterior) => {
      const activo = anterior.find((jugador) => jugador.usuarioId === activoId);
      if (!activo) return anterior;
      const ubicacionAnteriorActivo = { equipo: activo.equipo, linea: activo.linea, ordenLinea: activo.ordenLinea };
      const ocupante = anterior.find(
        (jugador) =>
          jugador.equipo === equipo &&
          jugador.linea === linea &&
          jugador.ordenLinea === ordenLinea &&
          jugador.usuarioId !== activoId
      );

      return anterior.map((jugador) => {
        if (jugador.usuarioId === activoId) return { ...jugador, equipo, linea, ordenLinea };
        if (ocupante && jugador.usuarioId === ocupante.usuarioId) return { ...jugador, ...ubicacionAnteriorActivo };
        return jugador;
      });
    });
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
      const { data } = await api.put(`/partidos/${partidoId}/formacion`, { asignaciones });
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
      <div className="flex gap-3">
        <MitadCancha
          equipo="A"
          lineasEsperadas={formacion.lineasEsperadas.A}
          ubicaciones={ubicaciones}
          draggable={esAdmin}
        />
        <MitadCancha
          equipo="B"
          lineasEsperadas={formacion.lineasEsperadas.B}
          ubicaciones={ubicaciones}
          draggable={esAdmin}
        />
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
          <Boton variante="primario" className="mt-4 w-full" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar formación'}
          </Boton>
        </>
      )}
    </div>
  );

  if (!esAdmin) return contenido;

  return <DndContext onDragEnd={manejarDragEnd}>{contenido}</DndContext>;
}
