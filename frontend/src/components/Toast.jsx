import { useEffect } from 'react';

export default function Toast({ mensaje, onClick, onCerrar }) {
  useEffect(() => {
    const temporizador = setTimeout(onCerrar, 6000);
    return () => clearTimeout(temporizador);
  }, [onCerrar]);

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-4">
      <button
        type="button"
        onClick={onClick}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-cancha-800 px-4 py-3 text-left text-sm font-semibold text-white shadow-lg transition hover:bg-cancha-700"
      >
        {mensaje}
      </button>
    </div>
  );
}
