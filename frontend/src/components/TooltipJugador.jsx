import { useJugadorDestacado } from '../context/JugadorDestacadoContext';
import NombreConEfectos from './NombreConEfectos';

// Tooltip global con el nombre del jugador. Se renderiza con position: fixed
// directamente en el <main> (fuera del contenedor .cancha que tiene
// overflow-hidden), por lo que nunca se recorta aunque el círculo esté cerca
// del borde de la cancha.
export default function TooltipJugador() {
  const { jugadorTooltip, ocultarJugadorTooltip } = useJugadorDestacado();

  if (!jugadorTooltip) return null;

  const { id, nombre, usuarioId, grupoId, x, y } = jugadorTooltip;

  return (
    <div
      key={`tooltip-${id}`}
      onMouseLeave={ocultarJugadorTooltip}
      className="fixed z-[60] pointer-events-none -translate-x-1/2 -translate-y-full mb-1.5 whitespace-nowrap rounded bg-black px-2 py-1 text-xs font-semibold text-white shadow opacity-100 transition-opacity duration-150"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <NombreConEfectos nombre={nombre} usuarioId={usuarioId} grupoId={grupoId} showBadge={false} showEmojiPersonalizado={false} showTitulo={false} />
    </div>
  );
}
