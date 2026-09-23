import BarraCupos from './BarraCupos';
import Boton from './Boton';
import ListaJugadores from './ListaJugadores';
import { formatearFechaPartido } from '../utils/fecha';
import styles from './TarjetaPartido.module.css';

export default function TarjetaPartido({
  partido,
  inscripcionUsuario,
  estaSancionado,
  procesando,
  onAnotarse,
  onSolicitarBaja,
  jugadores,
  formacion,
  equiposDefinidos,
  grupoId,
}) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const partidoCompleto = ocupados.titulares >= partido.cupoTitulares && ocupados.suplentes >= partido.cupoSuplentes;

  return (
    <div className={styles.card}>
      <div className={styles.headerFila}>
        <h3 className={styles.titulo}>{formatearFechaPartido(partido.fecha)}</h3>
        {inscripcionUsuario && (
          <span className={styles.badgeInscripcion}>
            {inscripcionUsuario.tipo === 'titular' ? 'Sos titular' : 'Sos suplente'}
          </span>
        )}
      </div>

      <div className={styles.barrasWrapper}>
        <BarraCupos etiqueta="Titulares" ocupados={ocupados.titulares} cupo={partido.cupoTitulares} />
        <BarraCupos etiqueta="Suplentes" ocupados={ocupados.suplentes} cupo={partido.cupoSuplentes} />
      </div>

      {jugadores && (
        <div className={styles.listaJugadoresWrapper}>
          <ListaJugadores
            jugadores={jugadores}
            formacion={formacion}
            equiposDefinidos={equiposDefinidos}
            grupoId={grupoId}
          />
        </div>
      )}

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
          {procesando ? 'Procesando…' : estaSancionado ? 'Estás sancionado' : partidoCompleto ? 'Partido completo' : 'Anotarme'}
        </Boton>
      )}
    </div>
  );
}
