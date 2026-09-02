import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function OlvidePassword() {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMensaje(data.mensaje);
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-pasto-500">Olvidé mi contraseña</h1>
      <p className="max-w-xs text-white/70">Ingresá tu email y te mandamos un link para restablecerla.</p>

      <form onSubmit={manejarSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
          required
        />
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-pasto-500 px-6 py-2 font-semibold text-cancha-900 transition hover:brightness-110 disabled:opacity-50"
        >
          Enviar link
        </button>
      </form>

      {mensaje && <p className="rounded-lg bg-pasto-500/20 px-4 py-2 text-sm text-pasto-500">{mensaje}</p>}
      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      <Link to="/" className="text-sm text-white/60 underline">
        Volver al login
      </Link>
    </div>
  );
}
