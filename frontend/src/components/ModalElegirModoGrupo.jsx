import styles from './ModalElegirModoGrupo.module.css';

const MODOS = [
  {
    id: 'convocatoria',
    icono: '⚽',
    titulo: 'Modo Convocatoria',
    descripcion:
      'Picaditos entre amigos: los anotados se dividen en dos equipos cada partido y todos juegan juntos.',
  },
  {
    id: 'plantel',
    icono: '🛡️',
    titulo: 'Modo Plantel',
    descripcion:
      'Tu equipo y su táctica: pizarra de 11 titulares con esquema, fixture del torneo y resultados con MVP.',
  },
];

export default function ModalElegirModoGrupo({ nombreGrupo, onElegir, onCancelar, deshabilitado }) {
  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => {
        if (!deshabilitado) onCancelar();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modo-grupo"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className={styles.contenido}>
          <h2 id="titulo-modo-grupo" className={styles.titulo}>
            ¿Qué tipo de grupo querés crear?
          </h2>
          <p className={styles.subtitulo}>
            El modo define cómo se organizan los partidos de &quot;{nombreGrupo}&quot; y no se puede cambiar después.
          </p>
          <div className={styles.listaModos}>
            {MODOS.map((modo) => (
              <button
                key={modo.id}
                type="button"
                disabled={deshabilitado}
                onClick={() => onElegir(modo.id)}
                className={styles.opcionModo}
              >
                <span className={styles.iconoModo} aria-hidden="true">
                  {modo.icono}
                </span>
                <span className={styles.textoModo}>
                  <span className={styles.nombreModo}>{modo.titulo}</span>
                  <span className={styles.descripcionModo}>{modo.descripcion}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
