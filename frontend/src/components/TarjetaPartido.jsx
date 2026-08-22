import BarraCupos from './BarraCupos';
import Boton from './Boton';
import ListaJugadores from './ListaJugadores';
import { formatearFechaPartido } from '../utils/fecha';

export default function TarjetaPartido({
  partido,
  inscripcionUsuario,
  estaSancionado,
  procesando,
  onAnotarse,
  onSolicitarBaja,
  jugadores,
  formacion,
  grupoId,
}) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const partidoCompleto = ocupados.titulares >= partido.cupoTitulares && ocupados.suplentes >= partido.cupoSuplentes;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</h3>
        {inscripcionUsuario && (
          <span className="rounded-full bg-pasto-600/20 px-3 py-1 text-xs font-bold uppercase text-pasto-500">
            {inscripcionUsuario.tipo === 'titular' ? 'Sos titular' : 'Sos suplente'}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <BarraCupos etiqueta="Titulares" ocupados={ocupados.titulares} cupo={partido.cupoTitulares} />
        <BarraCupos etiqueta="Suplentes" ocupados={ocupados.suplentes} cupo={partido.cupoSuplentes} />
      </div>

      {jugadores && (
        <div className="mb-4">
          <ListaJugadores jugadores={jugadores} formacion={formacion} grupoId={grupoId} />
        </div>
      )}

      {inscripcionUsuario ? (
        <Boton variante="peligro" className="w-full" onClick={onSolicitarBaja} disabled={procesando}>
          {procesando ? 'Procesando…' : 'Darme de baja'}
        </Boton>
      ) : (
        <Boton
          variante="primario"
          className="w-full"
          onClick={onAnotarse}
          disabled={estaSancionado || partidoCompleto || procesando}
        >
          {procesando ? 'Procesando…' : estaSancionado ? 'Estás sancionado' : partidoCompleto ? 'Partido completo' : 'Anotarme'}
        </Boton>
      )}
    </div>
  );
}
