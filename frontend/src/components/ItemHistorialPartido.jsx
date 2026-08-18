import { useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import { formatearFechaPartido } from '../utils/fecha';
import ResultadoPartido from './ResultadoPartido';
import ModalVotarValoraciones from './ModalVotarValoraciones';

export default function ItemHistorialPartido({ partido }) {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [expandido, setExpandido] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [elegibles, setElegibles] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [votoAbierto, setVotoAbierto] = useState(false);
  const [votosPropios, setVotosPropios] = useState({ valoraciones: [], mvpId: null });
  const [votando, setVotando] = useState(false);
  const [errorVoto, setErrorVoto] = useState('');

  const cantidadJugadores = (partido.ocupados?.titulares || 0) + (partido.ocupados?.suplentes || 0);
  const soyElegible = elegibles.some((j) => j.usuarioId === perfil?.uid);
  const elegiblesParaVotar = useMemo(
    () => elegibles.filter((j) => j.usuarioId !== perfil?.uid),
    [elegibles, perfil?.uid],
  );

  async function alternar() {
    const nuevoExpandido = !expandido;
    setExpandido(nuevoExpandido);
    if (nuevoExpandido && !resultado) {
      setCargando(true);
      setError('');
      try {
        const [{ data: datosResultado }, { data: datosFormacion }] = await Promise.all([
          api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/resultado`)),
          api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`)),
        ]);
        setResultado(datosResultado);
        setElegibles((datosFormacion.jugadores || []).filter((j) => j.equipo));
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
  }

  async function abrirVotacion() {
    setErrorVoto('');
    try {
      const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/votos/mios`));
      setVotosPropios(data);
      setVotoAbierto(true);
    } catch (err) {
      setErrorVoto(err.message);
    }
  }

  async function confirmarVoto(payload) {
    setVotando(true);
    setErrorVoto('');
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/votos`), payload);
      setVotoAbierto(false);
      const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/resultado`));
      setResultado(data);
    } catch (err) {
      setErrorVoto(err.message);
    } finally {
      setVotando(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 shadow-lg">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="font-bold capitalize text-white">{formatearFechaPartido(partido.fecha)}</p>
          <p className="text-xs text-white/50">{cantidadJugadores} jugadores</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${expandido ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expandido && (
        <div className="border-t border-white/10 p-4">
          {cargando ? (
            <p className="text-sm text-white/50">Cargando resultado…</p>
          ) : error ? (
            <p className="text-sm text-sancion">{error}</p>
          ) : (
            <>
              <ResultadoPartido partido={partido} resultado={resultado} />
              {soyElegible && (
                <button
                  type="button"
                  onClick={abrirVotacion}
                  className="mt-3 w-full rounded-lg bg-pasto-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pasto-500"
                >
                  Calificar jugadores
                </button>
              )}
              {errorVoto && !votoAbierto && <p className="mt-2 text-sm text-sancion">{errorVoto}</p>}
            </>
          )}
        </div>
      )}

      <ModalVotarValoraciones
        abierto={votoAbierto}
        partido={partido}
        elegibles={elegiblesParaVotar}
        votosPropios={votosPropios}
        procesando={votando}
        error={errorVoto}
        onConfirmar={confirmarVoto}
        onCancelar={() => {
          setVotoAbierto(false);
          setErrorVoto('');
        }}
      />
    </div>
  );
}
