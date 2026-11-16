import { useState, useCallback } from 'react';
import Boton from './Boton';
import styles from './ModalCategoriaPremios.module.css';

const ICONOS_CATEGORIA = {
  formacion: '⚽',
  informacion: '👁️',
  social: '👥',
  estetica: '✨',
  apuestas: '🎲',
  rating: '📊',
  exotico: '🎪',
};

const NOMBRES_CATEGORIA = {
  formacion: 'Formaciones',
  informacion: 'Información y Votación',
  social: 'Sociales y Sanciones',
  estetica: 'Personalización y Estética',
  apuestas: 'Ventajas de Apuestas',
  rating: 'Rating y MVP',
  exotico: 'Exóticos / Divertidos',
};

const ICONOS_METADATA = {
  duracionHoras: '⏱️',
  maxPorPartido: '🎯',
  maxPorUsuario: '👤',
  maxPorGrupo: '👥',
  monto: '💰',
  bonus: '📈',
  cobertura: '🛡️',
  badgeId: '🏅',
  color: '🎨',
  fondo: '🖼️',
  emoji: '😀',
  titulo: '📛',
  ocultarHastaHorasAntes: '🔒',
  rivalNuevo: '🔄',
};

export default function ModalCategoriaPremios({
  abierto,
  onCerrar,
  categoria,
  premios,
  saldo,
  cargando,
  onComprar,
}) {
  const [error, setError] = useState('');

  const nombreCategoria = NOMBRES_CATEGORIA[categoria] || categoria;
  const iconoCategoria = ICONOS_CATEGORIA[categoria] || '🎁';

  const handleComprar = useCallback(async (premioId) => {
    if (cargando) return;
    try {
      setError('');
      await onComprar(premioId);
      onCerrar();
    } catch (err) {
      setError(err.message || 'Error al canjear el premio');
    }
  }, [cargando, onComprar, onCerrar]);

  const METADATA_INTERNA = new Set(['creaEfecto', 'requierePartidoId', 'requiereGrupoId', 'maxPorUsuario', 'maxPorGrupo', 'maxPorPartido', 'maxPorApuesta', 'minHorasAntes', 'requiereAdmin', 'duracionDias', 'maxLongitud', 'permanente']);

  const formatearMetadata = (metadata) => {
    if (!metadata) return [];
    const clavesConOpciones = new Set(['colores', 'fondos', 'emojis', 'titulos']);
    return Object.entries(metadata)
      .filter(([key]) => !METADATA_INTERNA.has(key))
      .map(([key, value]) => {
        const icono = ICONOS_METADATA[key] || 'ℹ️';
        let label = '';
        switch (key) {
          case 'duracionHoras':
            label = `${value}h`;
            break;
          case 'maxPorPartido':
            label = `Máx ${value}/partido`;
            break;
          case 'maxPorUsuario':
            label = `Máx ${value}/usuario`;
            break;
          case 'maxPorGrupo':
            label = `Máx ${value}/grupo`;
            break;
          case 'monto':
            label = `${value} pts`;
            break;
          case 'bonus':
            label = `+${Math.round(value * 100)}%`;
            break;
          case 'cobertura':
            label = `${Math.round(value * 100)}%`;
            break;
          case 'badgeId':
            label = value;
            break;
          case 'color':
            label = value;
            break;
          case 'fondo':
            label = value;
            break;
          case 'emoji':
            label = value;
            break;
          case 'titulo':
            label = value;
            break;
          case 'ocultarHastaHorasAntes':
            label = `${value}h antes`;
            break;
          case 'rivalNuevo':
            label = value;
            break;
          default:
            if (clavesConOpciones.has(key) && Array.isArray(value)) {
              label = `${value.length} opciones`;
            } else {
              label = `${key}: ${value}`;
              if (label.length > 30) {
                label = label.slice(0, 27) + '...';
              }
            }
        }
        return { icono, label };
      });
  };

  const puedeComprar = (premio) => {
    if (cargando) return false;
    return saldo >= premio.costo;
  };

  if (!abierto || !categoria) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.tituloContenedor}>
            <span className={styles.icono}>{iconoCategoria}</span>
            <h2 className={styles.titulo}>{nombreCategoria}</h2>
          </div>
          <button className={styles.botonCerrar} onClick={onCerrar} disabled={cargando}>
            ✕
          </button>
        </header>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.contenido}>
          {premios.length === 0 ? (
            <p className={styles.sinPremios}>No hay premios disponibles en esta categoría</p>
          ) : (
            <div className={styles.listaPremios}>
              {premios.map((premio) => {
                const metadataItems = formatearMetadata(premio.metadata);
                return (
                  <article key={premio.id} className={styles.premioCard}>
                    <div className={styles.premioInfo}>
                      <h3 className={styles.premioNombre}>{premio.nombre}</h3>
                      <p className={styles.premioDescripcion}>{premio.descripcion}</p>
                      {metadataItems.length > 0 && (
                        <div className={styles.premioMeta}>
                          {metadataItems.map((item, idx) => (
                            <span key={idx} className={styles.metaItem}>
                              {item.icono} {item.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.premioAccion}>
                      <span className={styles.premioCosto}>{premio.costo} pts</span>
                      <Boton
                        className={styles.botonCanjear}
                        onClick={() => handleComprar(premio.id)}
                        disabled={!puedeComprar(premio) || cargando}
                        variante={puedeComprar(premio) ? 'primary' : 'secondary'}
                      >
                        Canjear
                      </Boton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}