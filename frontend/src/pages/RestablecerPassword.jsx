import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function RestablecerPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError('');
    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setListo(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación.');
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">
          Falta el token del link. Pedí uno nuevo desde "Olvidé mi contraseña".
        </p>
        <Link to="/olvide-password" className="text-sm text-white/60 underline">
          Ir a Olvidé mi contraseña
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-pasto-500">Restablecer contraseña</h1>

      {listo ? (
        <p className="rounded-lg bg-pasto-500/20 px-4 py-2 text-sm text-pasto-500">
          Contraseña actualizada. Redirigiendo al login…
        </p>
      ) : (
        <form onSubmit={manejarSubmit} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="password"
            placeholder="Contraseña nueva"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
            required
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmarPassword}
            onChange={(evento) => setConfirmarPassword(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
            required
          />
          <button
            type="submit"
            disabled={enviando}
            className="rounded-lg bg-pasto-500 px-6 py-2 font-semibold text-cancha-900 transition hover:brightness-110 disabled:opacity-50"
          >
            Guardar
          </button>
        </form>
      )}

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
    </div>
  );
}
