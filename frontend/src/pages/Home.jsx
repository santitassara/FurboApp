import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import TarjetaPartido from '../components/TarjetaPartido';
import MapaCancha from '../components/MapaCancha';
import ModalConfirmacionSancion from '../components/ModalConfirmacionSancion';
import ModalPosicion from '../components/ModalPosicion';
import PartidoConEstado from '../components/PartidoConEstado';

export default function Home() {
  const { perfil, actualizarPosicionesPerfil } = useAuth();
  const { grupoActivo, refrescarGrupos } = useGrupo();
  const { canInstall, triggerInstall } = useInstallPrompt();
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
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      const { data: partidosAbiertos } = await api.get(rutaGrupo(grupoActivo.id, '/partidos'));
      setPartidos(partidosAbiertos);

      const entradas = await Promise.all(
        partidosAbiertos.map(async (partido) => {
          const { data: jugadores } = await api.get(
            rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/inscripciones`)
          );
          return [partido.id, jugadores];
        })
      );
      setInscripcionesPorPartido(Object.fromEntries(entradas));

      const entradasFormacion = await Promise.all(
        partidosAbiertos
          .filter(
            (partido) =>
              partido.estado !== 'jugado' && (partido.ocupados?.titulares || 0) >= partido.cupoTitulares
          )
          .map(async (partido) => {
            const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`));
            return [partido.id, data];
          })
      );
      setFormacionesPorPartido(Object.fromEntries(entradasFormacion));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [grupoActivo]);

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
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/anotarse`), {
        posicionPrincipal,
        posicionSecundaria,
      });
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
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/bajarse`));
      await cargarPartidos();
      await refrescarGrupos();
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

  if (!grupoActivo) {
    return null;
  }

  return (
    <div className="mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-white">Próximos partidos</h1>
          <p className="mt-1 text-sm text-white/60">Hola, {perfil?.nombre}</p>
        </div>
        {canInstall && (
          <button
            onClick={triggerInstall}
            className="mt-1 flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-105 active:scale-95"
            aria-label="Instalar aplicación"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Instalar como App
          </button>
        )}
      </header>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {cargando ? (
        <p className="text-white/60">Cargando partidos…</p>
      ) : partidos.length === 0 ? (
        <p className="text-white/60">No hay partidos para mostrar por ahora.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {partidos.map((partido) => (
            <PartidoConEstado key={partido.id} partido={partido}>
              <div
                className={formacionesPorPartido[partido.id] ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : ''}
              >
                {formacionesPorPartido[partido.id] && (
                  <MapaCancha
                    partidoId={partido.id}
                    formacion={formacionesPorPartido[partido.id]}
                    esAdmin={grupoActivo?.rol === 'admin'}
                    onGuardado={(data) => setFormacionesPorPartido((anterior) => ({ ...anterior, [partido.id]: data }))}
                  />
                )}
                <TarjetaPartido
                  partido={partido}
                  inscripcionUsuario={inscripcionDelUsuario(partido.id)}
                  estaSancionado={grupoActivo?.estaSancionado}
                  procesando={partidoEnProceso === partido.id}
                  onAnotarse={() => setPartidoParaAnotarse(partido.id)}
                  onSolicitarBaja={() => solicitarBaja(partido)}
                  jugadores={inscripcionesPorPartido[partido.id] || []}
                  formacion={formacionesPorPartido[partido.id]}
                />
              </div>
            </PartidoConEstado>
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
