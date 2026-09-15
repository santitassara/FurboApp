import { formatearFechaPartido } from '../utils/fecha';

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(valor);
}

function urlMaps(direccion) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

export default function TarjetaInfoPartido({ partido }) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const totalConfirmados = ocupados.titulares + ocupados.suplentes;
  const totalCupo = partido.cupoTitulares + partido.cupoSuplentes;
  const porcentaje = totalCupo > 0 ? Math.min(100, Math.round((totalConfirmados / totalCupo) * 100)) : 0;
  const faltan = Math.max(0, totalCupo - totalConfirmados);
  const esHoy = new Date(partido.fecha).toDateString() === new Date().toDateString();
  const hora = new Date(partido.fecha).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-pasto-600/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-pasto-500">
          <span className="h-1.5 w-1.5 rounded-full bg-pasto-500" />
          {esHoy ? `Hoy ${hora} hs` : formatearFechaPartido(partido.fecha)}
        </span>
        {partido.numero && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/60">
            Fecha #{partido.numero}
          </span>
        )}
      </div>

      {(partido.estadio || partido.tipoSuelo || partido.direccion) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1 text-sm text-white/70">
            {partido.estadio && <span>🏟️ {partido.estadio}</span>}
            {partido.tipoSuelo && <span className="text-white/50">👟 {partido.tipoSuelo}</span>}
            {partido.direccion && <span>📍 {partido.direccion}</span>}
          </div>
          {partido.direccion && (
            <a
              href={urlMaps(partido.direccion)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white/80 transition hover:bg-white/10"
            >
              Ver en Maps
            </a>
          )}
        </div>
      )}

      {partido.clima && (
        <div className="mb-4 text-sm text-white/70">
          {partido.clima.disponible ? (
            <span>☀️ {Math.round(partido.clima.temp)}°C, {partido.clima.descripcion}</span>
          ) : (
            <span className="text-white/40">Pronóstico no disponible aún</span>
          )}
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-white/70">
          <span>
            {totalConfirmados}/{totalCupo} confirmados
          </span>
          {faltan > 0 && <span className="text-white/50">Faltan {faltan} para cerrar</span>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-pasto-500 transition-all" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>

      {typeof partido.valorCuota === 'number' && (
        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/50">Cuota x jugador</p>
            <p className="text-lg font-bold text-white">{formatearMoneda(partido.valorCuota)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-white/50">Total</p>
            <p className="text-lg font-bold text-pasto-500">{formatearMoneda(partido.valorCuota * totalCupo)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
