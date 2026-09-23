import Boton from './Boton';
import { partesHeroPartido } from '../utils/fecha';
import styles from './HeroPartido.module.css';

export default function HeroPartido({
  partido,
  inscripcionUsuario,
  estaSancionado,
  procesando,
  onAnotarse,
  onSolicitarBaja,
}) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const partidoCompleto = ocupados.titulares >= partido.cupoTitulares && ocupados.suplentes >= partido.cupoSuplentes;
  const { prefijo, hora } = partesHeroPartido(partido.fecha);

  return (
    <div className={styles.container}>
      <div className={styles.infoWrapper}>
        <h2 className={styles.titulo}>
          {prefijo} <span className={styles.horaDestacada}>{hora}</span>
        </h2>
        {inscripcionUsuario && (
          <span className={styles.badgeInscripcion}>
            {inscripcionUsuario.tipo === 'titular' ? 'Sos titular' : 'Sos suplente'}
          </span>
        )}
      </div>

      {inscripcionUsuario ? (
        <Boton variante="peligro" className={styles.botonAncho} onClick={onSolicitarBaja} disabled={procesando}>
          {procesando ? 'Procesando…' : 'Darme de baja'}
        </Boton>
      ) : (
        <Boton
          variante="primario"
          className={styles.botonAncho}
          onClick={onAnotarse}
          disabled={estaSancionado || partidoCompleto || procesando}
        >
          {procesando
            ? 'Procesando…'
            : estaSancionado
            ? 'Estás sancionado'
            : partidoCompleto
            ? 'Partido completo'
            : 'Anotarme'}
        </Boton>
      )}
    </div>
  );
}
