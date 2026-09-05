import { useEffect, useRef, useState } from 'react';
import Boton from './Boton';

const DURACION_JUGADA_MS = 60 * 1000;

function construirUrlConTiempo(beelupUrl, minuto) {
  const segundos = minuto * 60;
  const url = new URL(beelupUrl);
  url.searchParams.set('t', segundos);
  return url.toString();
}

export default function ModalVerGol({ abierto, beelupUrl, gol, onCerrar }) {
  const [finalizado, setFinalizado] = useState(false);
  const [src, setSrc] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;

    setFinalizado(false);
    setSrc(construirUrlConTiempo(beelupUrl, gol.minuto));
    timeoutRef.current = setTimeout(() => setFinalizado(true), DURACION_JUGADA_MS);

    return () => clearTimeout(timeoutRef.current);
  }, [abierto, beelupUrl, gol]);

  if (!abierto) return null;

  function verDeNuevo() {
    setFinalizado(false);
    setSrc(construirUrlConTiempo(beelupUrl, gol.minuto));
    timeoutRef.current = setTimeout(() => setFinalizado(true), DURACION_JUGADA_MS);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8">
      <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-cancha-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">
            Gol de {gol.nombre} — {gol.minuto}&apos;
          </h2>
          <button type="button" onClick={onCerrar} className="text-sm text-white/60 hover:text-white">
            ✕ Cerrar
          </button>
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          {finalizado ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <p className="text-sm text-white/70">Jugada finalizada</p>
              <Boton variante="primario" onClick={verDeNuevo}>
                Ver de nuevo
              </Boton>
            </div>
          ) : (
            <iframe
              key={src}
              src={src}
              title={`Gol de ${gol.nombre}`}
              className="h-full w-full"
              frameBorder="0"
              allowFullScreen
            />
          )}
        </div>
      </div>
    </div>
  );
}
