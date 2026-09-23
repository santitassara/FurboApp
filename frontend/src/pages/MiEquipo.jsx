import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { SERVER_URL } from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import obtenerTokenActual from '../utils/obtenerTokenActual';
import Boton from '../components/Boton';
import styles from './MiEquipo.module.css';

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
    return <p className={styles.cargando}>Cargando…</p>;
  }

  if (!datos) {
    return (
      <div className={styles.contenedorSinAcceso}>
        <p className={styles.mensajeError}>{error || 'No tenés acceso a este chat'}</p>
        <Boton variante="ghost" onClick={() => navigate('/inicio')}>
          Volver al inicio
        </Boton>
      </div>
    );
  }

  return (
    <div className={styles.contenedor}>
      <h1 className={styles.titulo}>Mi equipo</h1>

      <div className={styles.equipoBox}>
        <p className={styles.equipoLabel}>Equipo {datos.equipo}</p>
        <div className={styles.companeros}>
          {datos.companeros.map((companero) => (
            <span key={companero.uid} className={styles.companero}>
              {companero.nombre}
            </span>
          ))}
        </div>
      </div>

      {error && <p className={styles.mensajeError}>{error}</p>}

      <div ref={listaRef} className={styles.chatLista}>
        {mensajes.map((mensaje) => (
          <div key={mensaje.id} className={styles.mensaje}>
            <span className={styles.mensajeNombre}>{mensaje.nombre}: </span>
            {mensaje.texto}
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className={styles.form}>
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={500}
          placeholder="Escribí un mensaje…"
          className={styles.inputMensaje}
        />
        <Boton type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </Boton>
      </form>
    </div>
  );
}
