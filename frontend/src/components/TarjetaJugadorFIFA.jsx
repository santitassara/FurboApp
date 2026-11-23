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

const BADGE_DESCRIPCIONES = {
  apostador_pro: 'Apostador Pro - Ventajas en apuestas',
  mvp_hunter: 'Cazador MVP - Especialista en valoraciones',
  goleador: 'Goleador - Máximo anotador',
  estratega: 'Estratega - Experto en formaciones',
  ballena: 'Ballena - Gran apostador',
  badge_apostador_pro: 'Apostador Pro - Ventajas en apuestas',
  badge_mvp_hunter: 'Cazador MVP - Especialista en valoraciones',
  badge_goleador: 'Goleador - Máximo anotador',
  badge_estratega: 'Estratega - Experto en formaciones',
  badge_ballena: 'Ballena - Gran apostador',
};

function getBadgeDescripcion(badgeId) {
  return BADGE_DESCRIPCIONES[badgeId] || BADGE_DESCRIPCIONES[badgeId.replace('badge_', '')] || badgeId;
}

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

// Extraer efectos visuales de la lista de efectos activos
function extraerEfectosVisuales(efectos) {
  if (!efectos || !efectos.length) return {};
  const visuales = { badges: [] };
  efectos.forEach((efecto) => {
    try {
      const metadata = typeof efecto.metadata === 'string' ? JSON.parse(efecto.metadata) : efecto.metadata;
      switch (efecto.tipo) {
        case 'badge':
          if (metadata?.badgeId) visuales.badges.push(metadata.badgeId);
          break;
        case 'color_nombre':
          visuales.colorNombre = metadata?.color;
          break;
        case 'emoji_personalizado':
          visuales.emoji = metadata?.emoji;
          break;
        case 'titulo_personalizado':
          visuales.titulo = metadata?.titulo;
          break;
        case 'fondo_carta':
          visuales.fondo = metadata?.fondo;
          break;
      }
    } catch (e) {
      console.warn('Error parsing efecto metadata:', e);
    }
  });
  return visuales;
}

// Mapear badgeId a emoji/icono visible
function obtenerBadgeEmoji(badgeId) {
  const badges = {
    apostador_pro: '🏅',
    mvp_hunter: '🏆',
    goleador: '⚽',
    estratega: '🧠',
    ballena: '🐋',
  };
  // Handle both formats: with and without 'badge_' prefix
  const normalizedId = badgeId.replace('badge_', '');
  return badges[normalizedId] || '🏅';
}

// Fondos de carta disponibles
const FONDOS_CARTA = {
  degradado_oro: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
  degradado_fuego: 'linear-gradient(135deg, #FF4500 0%, #FFD700 100%)',
  patron_rombos: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)',
  brillo_neon: 'linear-gradient(135deg, #00FFFF 0%, #FF00FF 100%)',
};

export default function TarjetaJugadorFIFA({ nombre, posicion, habilidades = {}, fotoUrl, efectos = [] }) {
  const rating = calcularRating(habilidades);
  const { badges, colorNombre, emoji, titulo, fondo } = extraerEfectosVisuales(efectos);
  const badgeEmojis = (badges || []).map(obtenerBadgeEmoji);
  const fondoEstilo = fondo && FONDOS_CARTA[fondo] ? FONDOS_CARTA[fondo] : null;
  const colorEstilo = colorNombre ? { color: colorNombre } : {};

  return (
    <div
      className={styles.carta}
      style={{
        width: ANCHO,
        height: ALTO,
        backgroundImage: fondoEstilo ? `url('${MARCO_CARTA}')` : `url('${MARCO_CARTA}')`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        ...(fondoEstilo && { background: fondoEstilo, backgroundSize: 'cover' }),
      }}
    >
      <div className={styles.contenido} style={{ ...(fondoEstilo && { background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '8px' }) }}>
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

        {titulo && (
          <div className={styles.bloqueTitulo} style={colorEstilo}>
            <p className={styles.tituloTexto}>{titulo}</p>
          </div>
        )}

        <div className={styles.bloqueNombre} style={colorEstilo}>
          <p className={styles.nombreTexto}>
            {nombre || 'Sin nombre'}
            {badgeEmojis.length > 0 && (
              <span className={styles.badgesContainer} aria-label="Badges">
                {badges.map((badgeId, index) => (
                  <span key={index} className={styles.badgeWrapper} data-tooltip={getBadgeDescripcion(badgeId)}>
                    <span className={styles.badgeEmoji}>
                      {badgeEmojis[index]}
                    </span>
                  </span>
                ))}
              </span>
            )}
            {emoji && <span className={styles.emojiPersonalizado} aria-label="Emoji personalizado">{emoji}</span>}
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