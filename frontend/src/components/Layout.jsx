import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BadgeSancion from './BadgeSancion';

const ICONOS = {
  inicio: (
    <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" />
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
    </>
  ),
  jugadores: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20c1-3 3.4-4.7 6.5-4.7s5.5 1.7 6.5 4.7" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.3 15.6c.6-.2 1.1-.3 1.7-.3 2.6 0 4.6 1.5 5.5 3.7" />
    </>
  ),
  admin: (
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
  ),
  salir: (
    <>
      <path d="M9 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </>
  ),
};

function Icono({ nombre, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONOS[nombre]}
    </svg>
  );
}

export default function Layout({ children }) {
  const { perfil, estaSancionado, esAdmin, cerrarSesion } = useAuth();
  const { pathname } = useLocation();

  const items = [
    { to: '/inicio', etiqueta: 'Inicio', icono: 'inicio' },
    { to: '/perfil', etiqueta: 'Mi Perfil', icono: 'perfil' },
    { to: '/jugadores', etiqueta: 'Jugadores', icono: 'jugadores' },
  ];
  if (esAdmin) {
    items.push({ to: '/admin', etiqueta: 'Panel Admin', icono: 'admin' });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-white/10 bg-cancha-800 md:h-screen md:w-56 md:border-r md:sticky md:top-0">
        <div className="px-5 py-5">
          <p className="font-display text-3xl leading-none tracking-wide text-white">
            Furbo<span className="text-pasto-500">App</span>
          </p>
        </div>

        <nav className="flex flex-1 gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
          {items.map((item) => {
            const activo = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  activo ? 'bg-pasto-600/20 text-pasto-500' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icono nombre={item.icono} className="h-5 w-5 shrink-0" />
                <span className="hidden sm:inline">{item.etiqueta}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 border-t border-white/10 px-3 py-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <p className="truncate text-sm font-semibold text-white/80">{perfil?.nombre}</p>
            <BadgeSancion sancionado={estaSancionado} />
          </div>
          <button
            onClick={cerrarSesion}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <Icono nombre="salir" className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
