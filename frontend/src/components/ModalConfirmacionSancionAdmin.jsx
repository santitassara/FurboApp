import Boton from './Boton';

export default function ModalConfirmacionSancionAdmin({ abierto, nombre, procesando, error, onConfirmar, onCancelar }) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-cancha-800 p-6 text-center">
        <h2 className="mb-2 text-lg font-bold text-tarjeta">¿Seguro que querés sancionar a {nombre}?</h2>
        <p className="mb-6 text-sm text-white/70">
          Va a quedar dado de baja de este partido y sancionado: no va a poder anotarse al próximo partido hasta que
          lo perdones.
        </p>
        {error && <p className="mb-4 text-sm text-sancion">{error}</p>}
        <div className="flex justify-center gap-3">
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Sí, sancionar'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
