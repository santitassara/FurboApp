import { useEffect, useState } from 'react';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import ItemHistorialPartido from '../components/ItemHistorialPartido';

export default function UltimosPartidos() {
  const { grupoActivo } = useGrupo();
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!grupoActivo) return;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const { data } = await api.get(rutaGrupo(grupoActivo.id, '/partidos/historial'));
        setPartidos(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [grupoActivo]);

  return (
    <div className="mx-auto flex flex-col gap-6">
      <header>
        <h1 className="font-display text-4xl leading-none text-white">Últimos partidos</h1>
      </header>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {cargando ? (
        <p className="text-white/60">Cargando…</p>
      ) : partidos.length === 0 ? (
        <p className="text-white/60">Todavía no hay partidos jugados.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {partidos.map((partido) => (
            <ItemHistorialPartido key={partido.id} partido={partido} />
          ))}
        </div>
      )}
    </div>
  );
}
