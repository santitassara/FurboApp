import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const OPCIONES_ORDEN = [
  { valor: 'alfabetico', etiqueta: 'Orden alfabético' },
  { valor: 'edad', etiqueta: 'Edad' },
  { valor: 'mejorPromedio', etiqueta: 'Mejor promedio de habilidades' },
  { valor: 'peorPromedio', etiqueta: 'Peor promedio de habilidades' },
];

export default function Jugadores() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('alfabetico');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    api
      .get('/usuarios')
      .then(({ data }) => {
        if (activo) setUsuarios(data);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const filtrados = texto
      ? usuarios.filter((usuario) => usuario.nombre.toLowerCase().includes(texto))
      : usuarios;

    const conValor = (usuario, campo) => (usuario[campo] == null ? Infinity : usuario[campo]);

    const ordenados = [...filtrados];
    switch (orden) {
      case 'edad':
        ordenados.sort((a, b) => conValor(a, 'edad') - conValor(b, 'edad'));
        break;
      case 'mejorPromedio':
        ordenados.sort(
          (a, b) => (b.promedioHabilidades ?? -Infinity) - (a.promedioHabilidades ?? -Infinity)
        );
        break;
      case 'peorPromedio':
        ordenados.sort((a, b) => conValor(a, 'promedioHabilidades') - conValor(b, 'promedioHabilidades'));
        break;
      default:
        ordenados.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    return ordenados;
  }, [usuarios, busqueda, orden]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-pasto-500">Jugadores</h1>
        <Link to="/inicio" className="text-sm font-semibold text-albiceleste hover:underline">
          Volver
        </Link>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          className="flex-1 rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white placeholder:text-white/40"
        />
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
        >
          {OPCIONES_ORDEN.map(({ valor, etiqueta }) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {cargando ? (
        <p className="text-white/60">Cargando jugadores…</p>
      ) : usuariosFiltrados.length === 0 ? (
        <p className="text-white/60">No se encontraron jugadores.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {usuariosFiltrados.map((usuario) => (
            <Link
              key={usuario.uid}
              to={`/jugadores/${usuario.uid}`}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-cancha-800 px-4 py-3 hover:border-white/30"
            >
              <span className="font-semibold text-albiceleste hover:underline">{usuario.nombre}</span>
              <span className="text-sm text-white/60">
                {usuario.edad != null ? `${usuario.edad} años` : 'Edad no informada'}
                {' · '}
                {usuario.promedioHabilidades != null
                  ? `Promedio ${usuario.promedioHabilidades.toFixed(1)}`
                  : 'Sin habilidades cargadas'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
