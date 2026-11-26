import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './Jugadores.module.css';
import NombreConEfectos from '../components/NombreConEfectos';

const OPCIONES_ORDEN = [
  { valor: 'alfabetico', etiqueta: 'Orden alfabético' },
  { valor: 'edad', etiqueta: 'Edad' },
  { valor: 'mejorPromedio', etiqueta: 'Mejor promedio de habilidades' },
  { valor: 'peorPromedio', etiqueta: 'Peor promedio de habilidades' },
];

const ESTADISTICAS = [
  { key: 'goleadores', titulo: 'Top 10 Goleadores', valorKey: 'goles', sufijo: 'G' },
  { key: 'mvps', titulo: 'Top 5 MVPs', valorKey: 'mvps', sufijo: 'MVP' },
  { key: 'asistidores', titulo: 'Top 10 Asistidores', valorKey: 'asistencias', sufijo: 'A' },
  { key: 'promedioGol', titulo: 'Top 10 Prom. Gol/Partido', valorKey: 'goles', auxKey: 'pj', sufijo: 'G', formato: 'promedio' },
  { key: 'mejoresValorados', titulo: 'Top 5 Mejor Valorados', valorKey: 'ovr', sufijo: 'OVR', formato: 'decimal' },
];

export default function Jugadores() {
  const { grupoActivo } = useGrupo();
  const [usuarios, setUsuarios] = useState([]);
  const [estadisticas, setEstadisticas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [cargandoStats, setCargandoStats] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('alfabetico');

  useEffect(() => {
    if (!grupoActivo) {
      setUsuarios([]);
      setEstadisticas({});
      setCargando(false);
      setCargandoStats(false);
      return;
    }
    let activo = true;
    setCargando(true);
    setCargandoStats(true);
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
    api
      .get(rutaGrupo(grupoActivo.id, '/usuarios/lideres'))
      .then(({ data }) => {
        if (activo) setEstadisticas(data);
      })
      .catch(() => {
        if (activo) setEstadisticas({});
      })
      .finally(() => {
        if (activo) setCargandoStats(false);
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

  const renderEstadistica = (stat) => {
    const datos = estadisticas[stat.key] || [];
    if (datos.length === 0) return null;

    return (
      <div key={stat.key} className={styles.statCard}>
        <h3 className={styles.statTitulo}>{stat.titulo}</h3>
        <ul className={styles.statLista}>
          {datos.map((item, idx) => {
            let valor;
            if (stat.formato === 'promedio') {
              const pj = item[stat.auxKey] || 1;
              valor = (item[stat.valorKey] / pj).toFixed(2);
            } else if (stat.formato === 'decimal') {
              valor = item[stat.valorKey]?.toFixed(1) ?? '0.0';
            } else {
              valor = item[stat.valorKey] ?? 0;
            }
            return (
              <li key={item.usuarioId} className={styles.statItem}>
                <span className={styles.statPosicion}>#{idx + 1}</span>
                <span className={styles.statNombre}>{item.nombre}</span>
                <span className={styles.statValor}>{valor} {stat.sufijo}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

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

      <div className={styles.grid}>
        <div className={styles.columnaLista}>
          {cargando ? (
            <p className={styles.cargando}>Cargando jugadores…</p>
          ) : usuariosFiltrados.length === 0 ? (
            <p className={styles.sinResultados}>No se encontraron jugadores.</p>
          ) : (
            <div className={styles.lista}>
              {usuariosFiltrados.map((usuario) => (
                <Link key={usuario.uid} to={`/jugadores/${usuario.uid}`} className={styles.itemJugador}>
                  <span className={styles.nombreJugador}><NombreConEfectos nombre={usuario.nombre} usuarioId={usuario.uid} grupoId={grupoActivo.id} /></span>
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

        <aside className={styles.columnaStats}>
          {cargandoStats ? (
            <p className={styles.cargando}>Cargando estadísticas…</p>
          ) : (
            ESTADISTICAS.map(renderEstadistica)
          )}
        </aside>
      </div>
    </div>
  );
}
