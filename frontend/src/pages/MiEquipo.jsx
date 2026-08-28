import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { SERVER_URL } from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import obtenerTokenActual from '../utils/obtenerTokenActual';
import Boton from '../components/Boton';

export default function MiEquipo() {
  const { partidoId } = useParams();
  const { grupoActivo } = useGrupo();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const listaRef = useRef(null);

  function agregarMensaje(mensaje) {
    setMensajes((anteriores) => {
      if (anteriores.some((m) => m.id === mensaje.id)) return anteriores;
      return [...anteriores, mensaje];
    });
  }

  useEffect(() => {
    if (!grupoActivo) return undefined;
    let cancelado = false;
    let socket;

    async function iniciar() {
      try {
        const { data } = await api.get(`/grupos/${grupoActivo.id}/partidos/${partidoId}/mi-equipo`);
        if (cancelado) return;
        setDatos(data);
        setMensajes(data.mensajes);
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }

      if (cancelado) return;
      socket = io(SERVER_URL);
      socket.on('connect', async () => {
        const tokenActual = await obtenerTokenActual();
        if (cancelado) return;
        socket.emit('unirse', { grupoId: grupoActivo.id, partidoId, token: tokenActual });
      });
      socket.on('nuevoMensaje', agregarMensaje);
      socket.on('error', ({ mensaje }) => {
        if (!cancelado) setError(mensaje);
      });
    }

    iniciar();

    return () => {
      cancelado = true;
      socket?.disconnect();
    };
  }, [grupoActivo, partidoId]);

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensajes]);

  async function enviar(evento) {
    evento.preventDefault();
    const textoLimpio = texto.trim();
    if (!textoLimpio) return;
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post(`/grupos/${grupoActivo.id}/partidos/${partidoId}/mi-equipo/mensajes`, {
        texto: textoLimpio,
      });
      agregarMensaje(data);
      setTexto('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <p className="text-white/60">Cargando…</p>;
  }

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error || 'No tenés acceso a este chat'}</p>
        <Boton variante="ghost" onClick={() => navigate('/inicio')}>
          Volver al inicio
        </Boton>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-3xl text-white">Mi equipo</h1>

      <div className="rounded-xl border border-white/10 bg-cancha-800 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-pasto-500">Equipo {datos.equipo}</p>
        <div className="flex flex-wrap gap-2 text-sm text-white/80">
          {datos.companeros.map((companero) => (
            <span key={companero.uid} className="rounded-full bg-cancha-700 px-3 py-1">
              {companero.nombre}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      <div
        ref={listaRef}
        className="flex h-96 flex-col gap-2 overflow-y-auto rounded-xl border border-white/10 bg-cancha-800 p-4"
      >
        {mensajes.map((mensaje) => (
          <div key={mensaje.id} className="text-sm text-white/80">
            <span className="font-semibold text-white">{mensaje.nombre}: </span>
            {mensaje.texto}
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className="flex gap-2">
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={500}
          placeholder="Escribí un mensaje…"
          className="flex-1 rounded-lg border border-white/20 bg-cancha-700 px-3 py-2 text-white placeholder:text-white/40"
        />
        <Boton type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </Boton>
      </form>
    </div>
  );
}
