const ABREVIATURA_POSICION = {
  arquero: 'ARQ',
  defensor: 'DEF',
  mediocampista: 'MED',
  delantero: 'DEL',
};

const ATRIBUTOS = [
  { campo: 'velocidad', etiqueta: 'VEL' },
  { campo: 'pegada', etiqueta: 'PEG' },
  { campo: 'tocaPase', etiqueta: 'PAS' },
  { campo: 'gambeta', etiqueta: 'GAM' },
  { campo: 'marcaDefensa', etiqueta: 'DEF' },
  { campo: 'fisico', etiqueta: 'FIS' },
];

function calcularRating(habilidades) {
  const valores = ATRIBUTOS.map(({ campo }) => habilidades[campo]).filter(
    (valor) => valor !== null && valor !== undefined
  );
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((suma, valor) => suma + Number(valor), 0) / valores.length);
}

function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase())
    .join('');
}

export default function TarjetaJugadorFIFA({ nombre, posicion, habilidades = {} }) {
  const rating = calcularRating(habilidades);

  return (
    <div className="relative w-full max-w-[260px] overflow-hidden rounded-2xl border-2 border-tarjeta bg-gradient-to-br from-cancha-700 via-cancha-800 to-cancha-900 p-5 shadow-[0_0_50px_-12px_rgba(234,179,8,0.35)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-tarjeta/10 via-transparent to-transparent"
      />

      <div className="relative flex items-start justify-between">
        <div className="leading-none">
          <p className="font-display text-6xl text-tarjeta">{rating ?? '–'}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/70">
            {ABREVIATURA_POSICION[posicion] || '—'}
          </p>
        </div>
      </div>

      <div className="relative mx-auto -mt-4 flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-cancha-900 font-display text-3xl text-white">
        {iniciales(nombre)}
      </div>

      <p className="relative mt-3 truncate border-t border-white/10 pt-3 text-center font-display text-2xl uppercase tracking-wide text-white">
        {nombre || 'Sin nombre'}
      </p>

      <div className="relative mt-4 grid grid-cols-3 gap-y-3 border-t border-white/10 pt-4">
        {ATRIBUTOS.map(({ campo, etiqueta }) => (
          <div key={campo} className="text-center">
            <p className="font-display text-2xl text-white">{habilidades[campo] ?? '–'}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-tarjeta">{etiqueta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
