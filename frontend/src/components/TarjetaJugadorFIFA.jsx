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

const ANCHO = 300;
const ALTO = 420;

// Marco de la carta (PNG con centro transparente). Poné el archivo en frontend/public/tarjeta-marco.png
const MARCO_CARTA = '/tarjeta-marco.png';

const MASCARA_FOTO = 'linear-gradient(to bottom, black 65%, transparent 100%)';

// Redondeo a entero: el decimal solo sube si supera 0.5 (80.5 -> 80, 80.6 -> 81).
function redondearEntero(valor) {
  const base = Math.floor(valor);
  const decimal = valor - base;
  return decimal > 0.5 ? base + 1 : base;
}

export function calcularRating(habilidades) {
  const valores = ATRIBUTOS.map(({ campo }) => habilidades[campo]).filter(
    (valor) => valor !== null && valor !== undefined
  );
  if (valores.length === 0) return null;
  return redondearEntero(valores.reduce((suma, valor) => suma + Number(valor), 0) / valores.length);
}

function formatearAtributo(valor) {
  if (valor === null || valor === undefined) return '–';
  return redondearEntero(Number(valor));
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

export default function TarjetaJugadorFIFA({ nombre, posicion, habilidades = {}, fotoUrl }) {
  const rating = calcularRating(habilidades);

  return (
    <div
      className="relative mx-auto transition-transform duration-300 hover:scale-105"
      style={{
        width: ANCHO,
        height: ALTO,
        backgroundImage: `url('${MARCO_CARTA}')`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="relative h-full w-full text-[#e9d290]">
        <div className="absolute left-[15%] top-[18%] z-20 flex flex-col items-center drop-shadow-md">
          <p className="font-display text-5xl font-bold leading-none tracking-tighter">{rating ?? '–'}</p>
          <p className="mt-3 font-display text-xl font-bold uppercase tracking-widest">
            {ABREVIATURA_POSICION[posicion] || '—'}
          </p>
        </div>

        <div className="absolute right-[10%] top-[12%] z-10 flex h-[45%] w-[65%] justify-center">
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt={nombre || 'Jugador'}
              className="h-full object-cover object-bottom"
              style={{ maskImage: MASCARA_FOTO, WebkitMaskImage: MASCARA_FOTO }}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center font-display text-7xl font-bold text-black/20"
              style={{ maskImage: MASCARA_FOTO, WebkitMaskImage: MASCARA_FOTO }}
            >
              {iniciales(nombre)}
            </div>
          )}
        </div>

        <div className="absolute top-[55%] z-20 flex w-full flex-col items-center">
          <p className="max-w-[85%] overflow-hidden truncate px-4 text-center font-display font-bold uppercase tracking-widest drop-shadow-md">
            {nombre || 'Sin nombre'}
          </p>
        </div>

        <div className="absolute bottom-[16%] z-20 w-full px-[15%]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex flex-col gap-1 pr-2">
              {ATRIBUTOS.slice(0, 3).map(({ campo, etiqueta }) => (
                <div key={campo} className="flex items-center justify-between font-display text-lg drop-shadow-sm">
                  <span className="w-1/2 pr-2 text-right font-bold">{formatearAtributo(habilidades[campo])}</span>
                  <span className="w-1/2 text-left font-normal">{etiqueta}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1 pl-2">
              {ATRIBUTOS.slice(3, 6).map(({ campo, etiqueta }) => (
                <div key={campo} className="flex items-center justify-between font-display text-lg drop-shadow-sm">
                  <span className="w-1/2 pr-2 text-right font-bold">{formatearAtributo(habilidades[campo])}</span>
                  <span className="w-1/2 text-left font-normal">{etiqueta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
