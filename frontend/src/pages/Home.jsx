import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TarjetaPartido from '../components/TarjetaPartido';
import MapaCancha from '../components/MapaCancha';
import ModalConfirmacionSancion from '../components/ModalConfirmacionSancion';
import ModalPosicion from '../components/ModalPosicion';

export default function Home() {
  const { perfil, estaSancionado, esAdmin, refrescarPerfil, actualizarPosicionesPerfil } = useAuth();
  const [partidos, setPartidos] = useState([]);
  const [inscripcionesPorPartido, setInscripcionesPorPartido] = useState({});
  const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [partidoParaBaja, setPartidoParaBaja] = useState(null);
  const [partidoEnProceso, setPartidoEnProceso] = useState(null);
  const [guardandoPosicionPerfil, setGuardandoPosicionPerfil] = useState(false);
  const [partidoParaAnotarse, setPartidoParaAnotarse] = useState(null);

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

      const entradasFormacion = await Promise.all(
        partidosAbiertos
          .filter((partido) => (partido.ocupados?.titulares || 0) >= partido.cupoTitulares)
          .map(async (partido) => {
            const { data } = await api.get(`/partidos/${partido.id}/formacion`);
            return [partido.id, data];
          })
      );
      setFormacionesPorPartido(Object.fromEntries(entradasFormacion));
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

  async function anotarse(partidoId, posicionPrincipal, posicionSecundaria) {
    setError('');
    setPartidoEnProceso(partidoId);
    try {
      await api.post(`/partidos/${partidoId}/anotarse`, { posicionPrincipal, posicionSecundaria });
      await cargarPartidos();
      setPartidoParaAnotarse(null);
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
      await refrescarPerfil();
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

  async function confirmarPosicionPerfil(posicionPrincipal, posicionSecundaria) {
    setError('');
    setGuardandoPosicionPerfil(true);
    try {
      await actualizarPosicionesPerfil(posicionPrincipal, posicionSecundaria);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoPosicionPerfil(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-display text-4xl leading-none text-white">Próximos partidos</h1>
        <p className="mt-1 text-sm text-white/60">Hola, {perfil?.nombre}</p>
      </header>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {cargando ? (
        <p className="text-white/60">Cargando partidos…</p>
      ) : partidos.length === 0 ? (
        <p className="text-white/60">No hay partidos abiertos por ahora.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {partidos.map((partido) => (
            <div
              key={partido.id}
              className={formacionesPorPartido[partido.id] ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : ''}
            >
              {formacionesPorPartido[partido.id] && (
                <MapaCancha
                  partidoId={partido.id}
                  formacion={formacionesPorPartido[partido.id]}
                  esAdmin={esAdmin}
                  onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
                />
              )}
              <TarjetaPartido
                partido={partido}
                inscripcionUsuario={inscripcionDelUsuario(partido.id)}
                estaSancionado={estaSancionado}
                procesando={partidoEnProceso === partido.id}
                onAnotarse={() => setPartidoParaAnotarse(partido.id)}
                onSolicitarBaja={() => solicitarBaja(partido)}
                jugadores={inscripcionesPorPartido[partido.id] || []}
                formacion={formacionesPorPartido[partido.id]}
              />
            </div>
          ))}
        </div>
      )}

      <ModalConfirmacionSancion
        abierto={Boolean(partidoParaBaja)}
        procesando={partidoEnProceso === partidoParaBaja}
        onConfirmar={() => confirmarBaja(partidoParaBaja)}
        onCancelar={() => setPartidoParaBaja(null)}
      />

      <ModalPosicion
        abierto={Boolean(perfil) && !perfil.posicionPrincipal}
        procesando={guardandoPosicionPerfil}
        permitirCancelar={false}
        posicionPrincipalInicial={null}
        posicionSecundariaInicial={null}
        error={error}
        onConfirmar={confirmarPosicionPerfil}
      />

      <ModalPosicion
        abierto={Boolean(partidoParaAnotarse)}
        procesando={partidoEnProceso === partidoParaAnotarse}
        permitirCancelar
        posicionPrincipalInicial={perfil?.posicionPrincipal}
        posicionSecundariaInicial={perfil?.posicionSecundaria}
        error={error}
        onConfirmar={(posicionPrincipal, posicionSecundaria) =>
          anotarse(partidoParaAnotarse, posicionPrincipal, posicionSecundaria)
        }
        onCancelar={() => setPartidoParaAnotarse(null)}
      />
    </div>
  );
}
