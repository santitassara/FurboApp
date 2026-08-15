import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { SERVER_URL } from '../services/api';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';

export default function PerfilJugador() {
  const { uid } = useParams();
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    api
      .get(`/usuarios/${uid}/perfil`)
      .then(({ data }) => {
        if (activo) setPerfil(data);
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
  }, [uid]);

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
        </div>
      )}
    </div>
  );
}
