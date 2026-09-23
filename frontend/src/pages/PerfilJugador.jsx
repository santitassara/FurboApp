import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useParams } from 'react-router-dom';
import { useGrupo } from '../context/GrupoContext';
import api, { SERVER_URL } from '../services/api';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';
import { etiquetaPiernaHabil } from '../constants/piernaHabil';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';
import RadarHabilidades from '../components/RadarHabilidades';
import styles from './PerfilJugador.module.css';

export default function PerfilJugador() {
  const { uid } = useParams();
  const { grupoActivo } = useGrupo();
  const [perfil, setPerfil] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [estadisticasTotales, setEstadisticasTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    setEstadisticas(null);
    setEstadisticasTotales(null);

    Promise.all([
      api.get(`/usuarios/${uid}/perfil`),
      grupoActivo ? api.get(`/usuarios/${uid}/estadisticas/${grupoActivo.id}`) : Promise.resolve(null),
      api.get(`/usuarios/${uid}/estadisticas`),
    ])
      .then(([perfilRes, statsRes, statsTotalesRes]) => {
        if (activo) {
          setPerfil(perfilRes.data);
          if (statsRes) setEstadisticas(statsRes.data);
          setEstadisticasTotales(statsTotalesRes.data);
        }
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
  }, [uid, grupoActivo]);

  const tiles = perfil
    ? [
        { etiqueta: 'Edad', valor: perfil.edad != null ? `${perfil.edad} años` : 'Sin dato' },
        {
          etiqueta: 'Posición',
          valor:
            [etiquetaPosicion(perfil.posicionPrincipal), etiquetaPosicion(perfil.posicionSecundaria)]
              .filter((p) => p !== 'Sin posición')
              .join(' / ') || 'Sin dato',
          ancha: Boolean(perfil.posicionPrincipal && perfil.posicionSecundaria),
        },
        { etiqueta: 'Pierna hábil', valor: etiquetaPiernaHabil(perfil.piernaHabil) },
        { etiqueta: 'Resistencia', valor: etiquetaResistencia(perfil.resistencia) },
        { etiqueta: 'Ritmo de juego', valor: etiquetaRitmoJuego(perfil.ritmoJuego) },
      ]
    : [];

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Perfil del jugador</h1>

      {cargando && <p className={styles.cargando}>Cargando…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {perfil && (
        <div className={styles.grid}>
          <div className={styles.tarjetaWrap}>
            <TarjetaJugadorFIFA
              nombre={perfil.nombreCompleto || perfil.nombre}
              posicion={perfil.posicionPrincipal}
              habilidades={perfil}
              fotoUrl={perfil.fotoUrl ? `${SERVER_URL}${perfil.fotoUrl}` : null}
            />
          </div>

          <div className={styles.columnaDerecha}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitulo}>Resumen</h2>
              <div className={styles.tilesGrid}>
                {tiles.map((tile) => (
                  <div
                    key={tile.etiqueta}
                    className={clsx(styles.tile, tile.ancha && styles.tileAncha)}
                  >
                    <p className={styles.tileLabel}>{tile.etiqueta}</p>
                    <p className={styles.tileValor}>{tile.valor}</p>
                  </div>
                ))}
              </div>
            </div>

            {estadisticas && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitulo}>
                  Estadísticas en grupo {grupoActivo?.nombre}
                </h2>
                <div className={styles.tilesGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Partidos Jugados</p>
                    <p className={styles.statValor}>{estadisticas.pj}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Goles</p>
                    <p className={styles.statValor}>{estadisticas.goles}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Asistencias</p>
                    <p className={styles.statValor}>{estadisticas.asistencias}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Valoración</p>
                    <p className={styles.statValor}>{estadisticas.valoracion}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>MVPs</p>
                    <p className={styles.statValor}>{estadisticas.mvps}</p>
                  </div>
                </div>
              </div>
            )}

            {estadisticasTotales && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitulo}>Totales</h2>
                <div className={styles.tilesGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>
                      Goles en grupo {grupoActivo?.nombre}
                    </p>
                    <p className={styles.statValor}>{estadisticas?.goles || 0}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Goles Totales</p>
                    <p className={styles.statValor}>{estadisticasTotales.goles}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>
                      MVPs en grupo {grupoActivo?.nombre}
                    </p>
                    <p className={styles.statValor}>{estadisticas?.mvps || 0}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>MVPs Totales</p>
                    <p className={styles.statValor}>{estadisticasTotales.mvps}</p>
                  </div>
                </div>
              </div>
            )}

            <RadarHabilidades perfil={perfil} />
          </div>
        </div>
      )}
    </div>
  );
}
