import Boton from './Boton';

export default function ModalConfirmacionSancion({ abierto, procesando, onConfirmar, onCancelar }) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-cancha-800 p-6 text-center">
        <h2 className="mb-2 text-lg font-bold text-tarjeta">¿Seguro que te querés bajar?</h2>
        <p className="mb-6 text-sm text-white/70">
          Sos titular en este partido. Si te das de baja ahora vas a quedar sancionado y no vas a poder anotarte
          al próximo partido hasta que un admin te perdone.
        </p>
        <div className="flex justify-center gap-3">
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Sí, darme de baja'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
