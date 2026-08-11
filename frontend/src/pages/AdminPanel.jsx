import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Boton from '../components/Boton';
import ListaJugadores from '../components/ListaJugadores';
import ModalConfirmacionSancionAdmin from '../components/ModalConfirmacionSancionAdmin';

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
      setJugadorASancionar(null);
    } finally {
      setAccionEnCurso(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-albiceleste">Panel de admin</h1>
        <Link to="/inicio" className="text-sm font-semibold text-pasto-500 hover:underline">
          Volver al inicio
        </Link>
      </div>

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
        <h2 className="text-lg font-bold text-white">Partidos abiertos</h2>
        {partidos.length === 0 ? (
          <p className="text-sm text-white/50">No hay partidos abiertos.</p>
        ) : (
          partidos.map((partido) => (
            <div key={partido.id} className="rounded-xl border border-white/10 bg-cancha-800 p-5">
              <h3 className="mb-3 font-bold text-white">{new Date(partido.fecha).toLocaleString('es-AR')}</h3>
              <ListaJugadores
                jugadores={inscripcionesPorPartido[partido.id] || []}
                onPromover={(usuarioId) => promover(partido.id, usuarioId)}
                onSancionar={(usuarioId) => {
                  const jugador = (inscripcionesPorPartido[partido.id] || []).find((j) => j.usuarioId === usuarioId);
                  setJugadorASancionar({ partidoId: partido.id, usuarioId, nombre: jugador?.nombre || 'este jugador' });
                }}
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
        onConfirmar={() => sancionar(jugadorASancionar.partidoId, jugadorASancionar.usuarioId)}
        onCancelar={() => setJugadorASancionar(null)}
      />
    </div>
  );
}
