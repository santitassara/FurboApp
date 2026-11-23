import { useEfectosVisuales } from '../hooks/useEfectosVisuales';
import styles from './NombreConEfectos.module.css';

const BADGE_DESCRIPCIONES = {
  apostador_pro: 'Apostador Pro - Ventajas en apuestas',
  mvp_hunter: 'Cazador MVP - Especialista en valoraciones',
  goleador: 'Goleador - Máximo anotador',
  estratega: 'Estratega - Experto en formaciones',
  ballena: 'Ballena - Gran apostador',
  // Con prefijo 'badge_' por si viene así desde el backend
  badge_apostador_pro: 'Apostador Pro - Ventajas en apuestas',
  badge_mvp_hunter: 'Cazador MVP - Especialista en valoraciones',
  badge_goleador: 'Goleador - Máximo anotador',
  badge_estratega: 'Estratega - Experto en formaciones',
  badge_ballena: 'Ballena - Gran apostador',
};

function getBadgeDescripcion(badgeId) {
  return BADGE_DESCRIPCIONES[badgeId] || BADGE_DESCRIPCIONES[badgeId.replace('badge_', '')] || badgeId;
}

function NombreConEfectos({
  nombre,
  usuarioId,
  grupoId,
  className = '',
  showBadge = true,
  showEmoji = true,
  showTitulo = false,
  showEmojiPersonalizado = true,
  children,
}) {
  const { badges, badgeEmojis, colorNombre, emoji, titulo, cargando } = useEfectosVisuales(usuarioId, grupoId);

  const colorStyle = colorNombre ? { color: colorNombre } : {};

  if (!nombre && !children) return null;

  return (
    <span className={styles.nombre} style={colorStyle}>
      {showTitulo && titulo && <span className={styles.titulo}>{titulo}</span>}
      {children || nombre}
      {showBadge && badgeEmojis.length > 0 && (
        <span className={styles.badgesContainer} aria-label="Badges">
          {badges.slice(0, 5).map((badgeId, index) => (
            <span key={index} className={styles.badgeWrapper} data-tooltip={getBadgeDescripcion(badgeId)}>
              <span className={styles.badgeEmoji}>
                {badgeEmojis[index]}
              </span>
            </span>
          ))}
          {badges.length > 5 && (
            <span className={styles.badgeMore}>+{badges.length - 5}</span>
          )}
        </span>
      )}
      {showEmojiPersonalizado && emoji && <span className={styles.emojiPersonalizado} aria-label="Emoji personalizado">{emoji}</span>}
    </span>
  );
}

export default NombreConEfectos;