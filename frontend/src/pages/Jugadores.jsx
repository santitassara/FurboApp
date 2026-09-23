import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './Jugadores.module.css';

const OPCIONES_ORDEN = [
  { valor: 'alfabetico', etiqueta: 'Orden alfabético' },
  { valor: 'edad', etiqueta: 'Edad' },
  { valor: 'mejorPromedio', etiqueta: 'Mejor promedio de habilidades' },
  { valor: 'peorPromedio', etiqueta: 'Peor promedio de habilidades' },
];

export default function Jugadores() {
  const { grupoActivo } = useGrupo();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('alfabetico');

  useEffect(() => {
    if (!grupoActivo) {
      setUsuarios([]);
      setCargando(false);
      return;
    }
    let activo = true;
    setCargando(true);
    setError('');
    api
      .get(rutaGrupo(grupoActivo.id, '/usuarios'))
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
  }, [grupoActivo]);

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
    <div className={styles.contenedor}>
      <header>
        <h1 className={styles.titulo}>Jugadores</h1>
      </header>

      <div className={styles.filtros}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          className={styles.inputBusqueda}
        />
        <select value={orden} onChange={(e) => setOrden(e.target.value)} className={styles.select}>
          {OPCIONES_ORDEN.map(({ valor, etiqueta }) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </div>

      {error && <p className={styles.mensajeError}>{error}</p>}

      {cargando ? (
        <p className={styles.cargando}>Cargando jugadores…</p>
      ) : usuariosFiltrados.length === 0 ? (
        <p className={styles.sinResultados}>No se encontraron jugadores.</p>
      ) : (
        <div className={styles.lista}>
          {usuariosFiltrados.map((usuario) => (
            <Link key={usuario.uid} to={`/jugadores/${usuario.uid}`} className={styles.itemJugador}>
              <span className={styles.nombreJugador}>{usuario.nombre}</span>
              <span className={styles.infoJugador}>
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
