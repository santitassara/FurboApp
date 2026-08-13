import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

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

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-pasto-500">Perfil del jugador</h1>
        <Link to="/inicio" className="text-sm font-semibold text-albiceleste hover:underline">
          Volver
        </Link>
      </header>

      {cargando && <p className="text-white/60">Cargando…</p>}
      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {perfil && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-lg font-bold text-white">{perfil.nombreCompleto || perfil.nombre}</p>
            <p className="text-sm text-white/60">
              {perfil.edad != null ? `${perfil.edad} años` : 'Edad no informada'}
            </p>
          </div>

          <div className="text-sm text-white/80">
            <p>
              Posición: {etiquetaPosicion(perfil.posicionPrincipal)}
              {perfil.posicionSecundaria && ` / ${etiquetaPosicion(perfil.posicionSecundaria)}`}
            </p>
            <p>Resistencia: {etiquetaResistencia(perfil.resistencia)}</p>
            <p>Ritmo de juego: {etiquetaRitmoJuego(perfil.ritmoJuego)}</p>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-pasto-500">Habilidades</h2>
            {HABILIDADES.map(({ campo, etiqueta }) => (
              <div key={campo} className="flex items-center justify-between text-sm text-white/80">
                <span>{etiqueta}</span>
                <span>{perfil[campo] ?? 'Sin dato'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
