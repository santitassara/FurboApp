import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Boton from '../components/Boton';
import ListaJugadores from '../components/ListaJugadores';
import ModalConfirmacionSancionAdmin from '../components/ModalConfirmacionSancionAdmin';
import ModalCargarResultado from '../components/ModalCargarResultado';

const FORMULARIO_INICIAL = { fecha: '', cupoTitulares: 10, cupoSuplentes: 5 };

export default function AdminPanel() {
  const [partidos, setPartidos] = useState([]);
  const [inscripcionesPorPartido, setInscripcionesPorPartido] = useState({});
  const [sancionados, setSancionados] = useState([]);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [jugadorASancionar, setJugadorASancionar] = useState(null);
  const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
  const [partidoParaResultado, setPartidoParaResultado] = useState(null);

  const cargarTodo = useCallback(async () => {
    setError('');
    try {
      const [{ data: partidosAbiertos }, { data: sancionadosActuales }] = await Promise.all([
        api.get('/partidos'),
        api.get('/usuarios/sancionados'),
      ]);
      setPartidos(partidosAbiertos);
      setSancionados(sancionadosActuales);

      const entradas = await Promise.all(
        partidosAbiertos.map(async (partido) => {
          const { data: jugadores } = await api.get(`/partidos/${partido.id}/inscripciones`);
          return [partido.id, jugadores];
        })
      );
      setInscripcionesPorPartido(Object.fromEntries(entradas));

      const entradasFormacion = await Promise.all(
        partidosAbiertos
          .filter((partido) => partido.estado !== 'abierto')
          .map(async (partido) => {
            const { data } = await api.get(`/partidos/${partido.id}/formacion`);
            return [partido.id, data];
          })
      );
      setFormacionesPorPartido(Object.fromEntries(entradasFormacion));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function crearPartido(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post('/partidos', {
        fecha: new Date(formulario.fecha).toISOString(),
        cupoTitulares: Number(formulario.cupoTitulares),
        cupoSuplentes: Number(formulario.cupoSuplentes),
      });
      setMensaje('Partido creado con éxito.');
      setFormulario(FORMULARIO_INICIAL);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function perdonar(uid) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(`/usuarios/${uid}/perdonar`);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function promover(partidoId, usuarioId) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(`/partidos/${partidoId}/promover/${usuarioId}`);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function eliminarPartido(partidoId) {
    if (!window.confirm('¿Eliminar este partido? Esta acción no se puede deshacer.')) return;
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.delete(`/partidos/${partidoId}`);
      setMensaje('Partido eliminado con éxito.');
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function sancionar(partidoId, usuarioId) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(`/partidos/${partidoId}/sancionar/${usuarioId}`);
      setJugadorASancionar(null);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function guardarResultado(payload) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.put(`/partidos/${partidoParaResultado.id}/resultado`, payload);
      setMensaje('Resultado cargado con éxito.');
      setPartidoParaResultado(null);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-4xl leading-none text-white">Panel de admin</h1>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
      {mensaje && <p className="rounded-lg bg-pasto-600/20 px-4 py-2 text-sm text-pasto-500">{mensaje}</p>}

      <section className="rounded-xl border border-white/10 bg-cancha-800 p-5">
        <h2 className="mb-4 text-lg font-bold text-white">Crear partido</h2>
        <form onSubmit={crearPartido} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm text-white/70">
            Fecha y hora
            <input
              type="datetime-local"
              required
              value={formulario.fecha}
              onChange={(evento) => setFormulario({ ...formulario, fecha: evento.target.value })}
              className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-white/70">
            Cupo titulares
            <input
              type="number"
              min="1"
              required
              value={formulario.cupoTitulares}
              onChange={(evento) => setFormulario({ ...formulario, cupoTitulares: evento.target.value })}
              className="w-28 rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-white/70">
            Cupo suplentes
            <input
              type="number"
              min="0"
              required
              value={formulario.cupoSuplentes}
              onChange={(evento) => setFormulario({ ...formulario, cupoSuplentes: evento.target.value })}
              className="w-28 rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
            />
          </label>
          <Boton type="submit" disabled={accionEnCurso}>
            {accionEnCurso ? 'Procesando…' : 'Crear'}
          </Boton>
        </form>
      </section>

      <section className="rounded-xl border border-white/10 bg-cancha-800 p-5">
        <h2 className="mb-4 text-lg font-bold text-white">Sancionados</h2>
        {sancionados.length === 0 ? (
          <p className="text-sm text-white/50">No hay jugadores sancionados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sancionados.map((usuario) => (
              <li key={usuario.uid} className="flex items-center justify-between text-sm text-white/90">
                <span>{usuario.nombre}</span>
                <Boton
                  variante="ghost"
                  className="px-3 py-1 text-xs"
                  onClick={() => perdonar(usuario.uid)}
                  disabled={accionEnCurso}
                >
                  Perdonar
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white">Partidos</h2>
        {partidos.length === 0 ? (
          <p className="text-sm text-white/50">No hay partidos abiertos.</p>
        ) : (
          partidos.map((partido) => (
            <div key={partido.id} className="rounded-xl border border-white/10 bg-cancha-800 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-white">
                  {new Date(partido.fecha).toLocaleString('es-AR')}{' '}
                  <span className="ml-2 text-xs font-normal uppercase text-white/40">{partido.estado}</span>
                </h3>
                <div className="flex gap-2">
                  {partido.estado === 'cerrado' && (
                    <Boton
                      variante="primario"
                      className="px-3 py-1 text-xs"
                      onClick={() => setPartidoParaResultado(partido)}
                      disabled={accionEnCurso}
                    >
                      Cargar resultado
                    </Boton>
                  )}
                  {partido.estado === 'abierto' && (
                    <Boton
                      variante="ghost"
                      className="px-3 py-1 text-xs text-sancion"
                      onClick={() => eliminarPartido(partido.id)}
                      disabled={accionEnCurso}
                    >
                      Eliminar
                    </Boton>
                  )}
                </div>
              </div>
              <ListaJugadores
                jugadores={inscripcionesPorPartido[partido.id] || []}
                onPromover={partido.estado === 'abierto' ? (usuarioId) => promover(partido.id, usuarioId) : undefined}
                onSancionar={
                  partido.estado === 'abierto'
                    ? (usuarioId) => {
                        setError('');
                        const jugador = (inscripcionesPorPartido[partido.id] || []).find((j) => j.usuarioId === usuarioId);
                        setJugadorASancionar({ partidoId: partido.id, usuarioId, nombre: jugador?.nombre || 'este jugador' });
                      }
                    : undefined
                }
                deshabilitado={accionEnCurso}
              />
            </div>
          ))
        )}
      </section>

      <ModalConfirmacionSancionAdmin
        abierto={Boolean(jugadorASancionar)}
        nombre={jugadorASancionar?.nombre}
        procesando={accionEnCurso}
        error={error}
        onConfirmar={() => sancionar(jugadorASancionar.partidoId, jugadorASancionar.usuarioId)}
        onCancelar={() => {
          setJugadorASancionar(null);
          setError('');
        }}
      />

      <ModalCargarResultado
        abierto={Boolean(partidoParaResultado)}
        partido={partidoParaResultado}
        elegibles={(formacionesPorPartido[partidoParaResultado?.id]?.jugadores || []).filter((j) => j.equipo)}
        procesando={accionEnCurso}
        error={error}
        onConfirmar={guardarResultado}
        onCancelar={() => {
          setPartidoParaResultado(null);
          setError('');
        }}
      />
    </div>
  );
}
