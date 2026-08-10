import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { iniciarSesion } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-pasto-500">FurboApp</h1>
      <p className="text-white/70">Organizá el picado de la semana sin quilombos.</p>
      <button
        onClick={iniciarSesion}
        className="rounded-lg bg-albiceleste px-6 py-3 font-semibold text-cancha-900 transition hover:brightness-110"
      >
        Ingresar con Google
      </button>
    </div>
  );
}
