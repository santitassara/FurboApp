import { formatearFechaPartido } from '../utils/fecha';

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(valor);
}

export default function TarjetaInfoPartido({ partido }) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const totalConfirmados = ocupados.titulares + ocupados.suplentes;
  const totalCupo = partido.cupoTitulares + partido.cupoSuplentes;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/60">
        <span className="capitalize">{formatearFechaPartido(partido.fecha)}</span>
        {partido.numero && <span className="rounded-full bg-white/10 px-2 py-1">Fecha #{partido.numero}</span>}
      </div>

      {(partido.estadio || partido.tipoSuelo || partido.direccion) && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
          {partido.estadio && <span>🏟️ {partido.estadio}</span>}
          {partido.tipoSuelo && <span>🌱 {partido.tipoSuelo}</span>}
          {partido.direccion && <span>📍 {partido.direccion}</span>}
        </div>
      )}

      {partido.clima && (
        <div className="mb-3 text-sm text-white/70">
          {partido.clima.disponible ? (
            <span>☀️ {Math.round(partido.clima.temp)}°C, {partido.clima.descripcion}</span>
          ) : (
            <span className="text-white/40">Pronóstico no disponible aún</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-white/70">
          {totalConfirmados}/{totalCupo} confirmados
        </span>
        {typeof partido.valorCuota === 'number' && (
          <span className="text-sm font-bold text-pasto-500">Cuota: {formatearMoneda(partido.valorCuota)}</span>
        )}
      </div>
    </div>
  );
}
