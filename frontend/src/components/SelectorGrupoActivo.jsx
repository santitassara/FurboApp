import { useState } from 'react';
import { useGrupo } from '../context/GrupoContext';

export default function SelectorGrupoActivo() {
  const { misGrupos, grupoActivo, seleccionarGrupo } = useGrupo();
  const [abierto, setAbierto] = useState(false);

  if (!grupoActivo) return null;

  return (
    <div className="relative px-2">
      <button
        onClick={() => setAbierto((valor) => !valor)}
        className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-left text-sm font-semibold text-white"
      >
        <span className="truncate">{grupoActivo.nombre}</span>
        <span className="text-white/50">▾</span>
      </button>
      {abierto && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-cancha-900 py-1 shadow-lg">
          {misGrupos.map((grupo) => (
            <li key={grupo.id}>
              <button
                onClick={() => {
                  seleccionarGrupo(grupo.id);
                  setAbierto(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  grupo.id === grupoActivo.id ? 'text-pasto-500' : 'text-white/80 hover:bg-white/5'
                }`}
              >
                {grupo.nombre}
              </button>
            </li>
          ))}
          <li>
            <a
              href="/grupos"
              className="block w-full px-3 py-2 text-left text-sm text-white/60 hover:bg-white/5"
            >
              Crear o unirme a otro grupo
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
