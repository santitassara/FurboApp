import { useEffect, useState } from 'react';
import Boton from './Boton';
import { POSICIONES } from '../constants/posiciones';

export default function ModalPosicion({
  abierto,
  procesando,
  permitirCancelar,
  posicionPrincipalInicial,
  posicionSecundariaInicial,
  onConfirmar,
  onCancelar,
}) {
  const [posicionPrincipal, setPosicionPrincipal] = useState(posicionPrincipalInicial || '');
  const [posicionSecundaria, setPosicionSecundaria] = useState(posicionSecundariaInicial || '');

  useEffect(() => {
    if (abierto) {
      setPosicionPrincipal(posicionPrincipalInicial || '');
      setPosicionSecundaria(posicionSecundariaInicial || '');
    }
  }, [abierto, posicionPrincipalInicial, posicionSecundariaInicial]);

  if (!abierto) return null;

  const posicionesIguales = posicionPrincipal && posicionSecundaria && posicionPrincipal === posicionSecundaria;
  const puedeConfirmar = posicionPrincipal && posicionSecundaria && !posicionesIguales && !procesando;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-cancha-800 p-6">
        <h2 className="mb-2 text-lg font-bold text-tarjeta">¿En qué posición jugás?</h2>
        <p className="mb-4 text-sm text-white/70">
          Elegí tu posición principal y una secundaria, por si en algún momento hace falta rotar.
        </p>

        <div className="mb-3 flex flex-col gap-1 text-left">
          <label className="text-xs uppercase text-white/50">Posición principal</label>
          <select
            value={posicionPrincipal}
            onChange={(evento) => setPosicionPrincipal(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" disabled>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-2 flex flex-col gap-1 text-left">
          <label className="text-xs uppercase text-white/50">Posición secundaria</label>
          <select
            value={posicionSecundaria}
            onChange={(evento) => setPosicionSecundaria(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" disabled>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {posicionesIguales && (
          <p className="mb-2 text-sm text-sancion">La secundaria tiene que ser distinta de la principal.</p>
        )}

        <div className="mt-4 flex justify-center gap-3">
          {permitirCancelar && (
            <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
              Cancelar
            </Boton>
          )}
          <Boton
            variante="primario"
            onClick={() => onConfirmar(posicionPrincipal, posicionSecundaria)}
            disabled={!puedeConfirmar}
          >
            {procesando ? 'Guardando…' : 'Confirmar'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
