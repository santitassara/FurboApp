import styles from './TarjetaJugadorFIFA.module.css';

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
      className={styles.carta}
      style={{
        width: ANCHO,
        height: ALTO,
        backgroundImage: `url('${MARCO_CARTA}')`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className={styles.contenido}>
        <div className={styles.bloqueRating}>
          <p className={styles.rating}>{rating ?? '–'}</p>
          <p className={styles.posicionAbrev}>
            {ABREVIATURA_POSICION[posicion] || '—'}
          </p>
        </div>

        <div className={styles.bloqueFoto}>
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt={nombre || 'Jugador'}
              className={styles.foto}
              style={{ maskImage: MASCARA_FOTO, WebkitMaskImage: MASCARA_FOTO }}
            />
          ) : (
            <div
              className={styles.fotoPlaceholder}
              style={{ maskImage: MASCARA_FOTO, WebkitMaskImage: MASCARA_FOTO }}
            >
              {iniciales(nombre)}
            </div>
          )}
        </div>

        <div className={styles.bloqueNombre}>
          <p className={styles.nombreTexto}>
            {nombre || 'Sin nombre'}
          </p>
        </div>

        <div className={styles.bloqueAtributos}>
          <div className={styles.gridAtributos}>
            <div className={styles.columnaIzquierda}>
              {ATRIBUTOS.slice(0, 3).map(({ campo, etiqueta }) => (
                <div key={campo} className={styles.filaAtributo}>
                  <span className={styles.valorAtributo}>{formatearAtributo(habilidades[campo])}</span>
                  <span className={styles.etiquetaAtributo}>{etiqueta}</span>
                </div>
              ))}
            </div>

            <div className={styles.columnaDerecha}>
              {ATRIBUTOS.slice(3, 6).map(({ campo, etiqueta }) => (
                <div key={campo} className={styles.filaAtributo}>
                  <span className={styles.valorAtributo}>{formatearAtributo(habilidades[campo])}</span>
                  <span className={styles.etiquetaAtributo}>{etiqueta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
