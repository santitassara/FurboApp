import ListaJugadores from './ListaJugadores';

export default function ListaConvocadosScroll(props) {
  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
        <span aria-hidden="true">👥</span> Convocados
      </h3>
      <div className="max-h-80 overflow-y-auto pr-1">
        <ListaJugadores {...props} />
      </div>
    </div>
  );
}
