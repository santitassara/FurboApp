import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { iniciarSesion, iniciarSesionConPassword, registrarse } = useAuth();
  const [modo, setModo] = useState('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [error, setError] = useState('');

  async function manejarClickIngresar() {
    setError('');
    try {
      await iniciarSesion();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    }
  }

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError('');
    try {
      if (modo === 'registro') {
        if (password !== confirmarPassword) {
          setError('Las contraseñas no coinciden.');
          return;
        }
        await registrarse(nombre, email, password);
      } else {
        await iniciarSesionConPassword(email, password);
      }
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación.');
    }
  }

  function alternarModo() {
    setError('');
    setModo(modo === 'registro' ? 'login' : 'registro');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-pasto-500">FurboApp</h1>
      <p className="text-white/70">Organizá el picado de la semana sin quilombos.</p>

      <button
        onClick={manejarClickIngresar}
        className="rounded-lg bg-albiceleste px-6 py-3 font-semibold text-cancha-900 transition hover:brightness-110"
      >
        Ingresar con Google
      </button>

      <div className="flex w-full max-w-xs items-center gap-3 text-white/40">
        <span className="h-px flex-1 bg-white/20" />
        <span className="text-xs uppercase">o</span>
        <span className="h-px flex-1 bg-white/20" />
      </div>

      <form onSubmit={manejarSubmit} className="flex w-full max-w-xs flex-col gap-3">
        {modo === 'registro' && (
          <input
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
          className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
          required
        />
        {modo === 'registro' && (
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmarPassword}
            onChange={(evento) => setConfirmarPassword(evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
            required
          />
        )}
        <button
          type="submit"
          className="rounded-lg bg-pasto-500 px-6 py-2 font-semibold text-cancha-900 transition hover:brightness-110"
        >
          {modo === 'registro' ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>

      <button type="button" onClick={alternarModo} className="text-sm text-white/60 underline">
        {modo === 'registro' ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Registrate'}
      </button>

      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
    </div>
  );
}
