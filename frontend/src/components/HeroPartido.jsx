import Boton from './Boton';
import { tituloHeroPartido } from '../utils/fecha';

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

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-4xl leading-none text-white">{tituloHeroPartido(partido.fecha)}</h2>
        {inscripcionUsuario && (
          <span className="w-fit rounded-full bg-pasto-600/20 px-3 py-1 text-xs font-bold uppercase text-pasto-500">
            {inscripcionUsuario.tipo === 'titular' ? 'Sos titular' : 'Sos suplente'}
          </span>
        )}
      </div>

      {inscripcionUsuario ? (
        <Boton variante="peligro" onClick={onSolicitarBaja} disabled={procesando}>
          {procesando ? 'Procesando…' : 'Darme de baja'}
        </Boton>
      ) : (
        <Boton variante="primario" onClick={onAnotarse} disabled={estaSancionado || partidoCompleto || procesando}>
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
