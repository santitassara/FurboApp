import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGrupo } from '../context/GrupoContext';
import api, { SERVER_URL } from '../services/api';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';
import RadarHabilidades from '../components/RadarHabilidades';

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
          valor: [etiquetaPosicion(perfil.posicionPrincipal), etiquetaPosicion(perfil.posicionSecundaria)]
            .filter((p) => p !== 'Sin posición')
            .join(' / ') || 'Sin dato',
        },
        { etiqueta: 'Resistencia', valor: etiquetaResistencia(perfil.resistencia) },
        { etiqueta: 'Ritmo de juego', valor: etiquetaRitmoJuego(perfil.ritmoJuego) },
      ]
    : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-display text-4xl leading-none text-white">Perfil del jugador</h1>

      {cargando && <p className="text-white/60">Cargando…</p>}
      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {perfil && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <div className="flex justify-center lg:justify-start">
            <TarjetaJugadorFIFA
              nombre={perfil.nombreCompleto || perfil.nombre}
              posicion={perfil.posicionPrincipal}
              habilidades={perfil}
              fotoUrl={perfil.fotoUrl ? `${SERVER_URL}${perfil.fotoUrl}` : null}
            />
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-white/10 bg-cancha-800/60 p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-pasto-500">Resumen</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {tiles.map((tile) => (
                  <div key={tile.etiqueta} className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">{tile.etiqueta}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{tile.valor}</p>
                  </div>
                ))}
              </div>
            </div>

            {estadisticas && (
              <div className="rounded-2xl border border-white/10 bg-cancha-800/60 p-6">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-pasto-500">
                  Estadísticas en grupo {grupoActivo?.nombre}
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Partidos Jugados</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{estadisticas.pj}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Goles</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{estadisticas.goles}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Asistencias</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{estadisticas.asistencias}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Valoración</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{estadisticas.valoracion}</p>
                  </div>
                </div>
              </div>
            )}

            {estadisticasTotales && (
              <div className="rounded-2xl border border-white/10 bg-cancha-800/60 p-6">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-pasto-500">Goles Totales</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">
                      Goles en grupo {grupoActivo?.nombre}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-white">{estadisticas?.goles || 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-cancha-900 p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Goles Totales</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{estadisticasTotales.goles}</p>
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
