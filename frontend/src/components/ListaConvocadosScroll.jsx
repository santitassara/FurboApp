import ListaJugadores from './ListaJugadores';

export default function ListaConvocadosScroll(props) {
  return (
    <div className="max-h-80 overflow-y-auto pr-1">
      <ListaJugadores {...props} />
    </div>
  );
}
