export default function BarraCupos({ etiqueta, ocupados, cupo }) {
  const porcentaje = cupo > 0 ? Math.min(100, Math.round((ocupados / cupo) * 100)) : 0;
  const lleno = ocupados >= cupo;

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-white/70">
        <span>{etiqueta}</span>
        <span>{ocupados}/{cupo}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${lleno ? 'bg-tarjeta' : 'bg-pasto-500'}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
