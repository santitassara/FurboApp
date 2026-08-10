import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { iniciarSesion } = useAuth();
  const [error, setError] = useState('');

  async function manejarClickIngresar() {
    setError('');
    try {
      await iniciarSesion();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    }
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
      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
    </div>
  );
}
