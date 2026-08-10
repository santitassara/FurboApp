import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TarjetaPartido from '../components/TarjetaPartido';
import ModalConfirmacionSancion from '../components/ModalConfirmacionSancion';
import Boton from '../components/Boton';
import BadgeSancion from '../components/BadgeSancion';

export default function Home() {
  const { perfil, estaSancionado, cerrarSesion } = useAuth();
  const [partidos, setPartidos] = useState([]);
  const [inscripcionesPorPartido, setInscripcionesPorPartido] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [partidoParaBaja, setPartidoParaBaja] = useState(null);
  const [partidoEnProceso, setPartidoEnProceso] = useState(null);

  const cargarPartidos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const { data: partidosAbiertos } = await api.get('/partidos');
      setPartidos(partidosAbiertos);

      const entradas = await Promise.all(
        partidosAbiertos.map(async (partido) => {
          const { data: jugadores } = await api.get(`/partidos/${partido.id}/inscripciones`);
          return [partido.id, jugadores];
        })
      );
      setInscripcionesPorPartido(Object.fromEntries(entradas));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarPartidos();
  }, [cargarPartidos]);

  function inscripcionDelUsuario(partidoId) {
    const jugadores = inscripcionesPorPartido[partidoId] || [];
    return jugadores.find((jugador) => jugador.usuarioId === perfil?.uid) || null;
  }

  async function anotarse(partidoId) {
    setError('');
    setPartidoEnProceso(partidoId);
    try {
      await api.post(`/partidos/${partidoId}/anotarse`);
      await cargarPartidos();
    } catch (err) {
      setError(err.message);
    } finally {
      setPartidoEnProceso(null);
    }
  }

  async function confirmarBaja(partidoId) {
    setError('');
    setPartidoEnProceso(partidoId);
    try {
      await api.post(`/partidos/${partidoId}/bajarse`);
      await cargarPartidos();
    } catch (err) {
      setError(err.message);
    } finally {
      setPartidoParaBaja(null);
      setPartidoEnProceso(null);
    }
  }

  function solicitarBaja(partido) {
    const inscripcion = inscripcionDelUsuario(partido.id);
    if (inscripcion?.tipo === 'titular') {
      setPartidoParaBaja(partido.id);
    } else {
      confirmarBaja(partido.id);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-pasto-500">FurboApp</h1>
          <p className="text-sm text-white/60">Hola, {perfil?.nombre}</p>
        </div>
        <div className="flex items-center gap-3">
          <BadgeSancion sancionado={estaSancionado} />
          <Boton variante="ghost" onClick={cerrarSesion}>
            Salir
          </Boton>
        </div>
      </header>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {cargando ? (
        <p className="text-white/60">Cargando partidos…</p>
      ) : partidos.length === 0 ? (
        <p className="text-white/60">No hay partidos abiertos por ahora.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {partidos.map((partido) => (
            <TarjetaPartido
              key={partido.id}
              partido={partido}
              inscripcionUsuario={inscripcionDelUsuario(partido.id)}
              estaSancionado={estaSancionado}
              procesando={partidoEnProceso === partido.id}
              onAnotarse={() => anotarse(partido.id)}
              onSolicitarBaja={() => solicitarBaja(partido)}
            />
          ))}
        </div>
      )}

      <ModalConfirmacionSancion
        abierto={Boolean(partidoParaBaja)}
        procesando={partidoEnProceso === partidoParaBaja}
        onConfirmar={() => confirmarBaja(partidoParaBaja)}
        onCancelar={() => setPartidoParaBaja(null)}
      />
    </div>
  );
}
