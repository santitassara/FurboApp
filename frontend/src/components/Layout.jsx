import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import BadgeSancion from './BadgeSancion';
import SelectorGrupoActivo from './SelectorGrupoActivo';
import styles from './Layout.module.css';

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
  historial: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6" />
    </>
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
  const { perfil, cerrarSesion } = useAuth();
  const { grupoActivo } = useGrupo();
  const { pathname } = useLocation();

  const items = [
    { to: '/inicio', etiqueta: 'Inicio', icono: 'inicio' },
    { to: '/perfil', etiqueta: 'Mi Perfil', icono: 'perfil' },
    { to: '/jugadores', etiqueta: 'Jugadores', icono: 'jugadores' },
    { to: '/historial', etiqueta: 'Últimos partidos', icono: 'historial' },
  ];
  if (grupoActivo?.rol === 'admin') {
    items.push({ to: '/admin', etiqueta: 'Panel Admin', icono: 'admin' });
  }
  if (perfil?.esSuperAdmin) {
    items.push({ to: '/admin/usuarios', etiqueta: 'Usuarios', icono: 'jugadores' });
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.aside}>
        <div className={styles.logoContenedor}>
          <p className={styles.logo}>
            Furbo<span className={styles.logoAcento}>App</span>
          </p>
        </div>

        <div className={styles.selectorContenedor}>
          <SelectorGrupoActivo />
        </div>

        <nav className={styles.nav}>
          {items.map((item) => {
            const activo = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(styles.navItem, activo ? styles.navItemActivo : styles.navItemInactivo)}
              >
                <Icono nombre={item.icono} className={styles.icono} />
                <span className={styles.etiqueta}>{item.etiqueta}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.pie}>
          <div className={styles.perfilFila}>
            <p className={styles.perfilNombre}>{perfil?.nombre}</p>
            <BadgeSancion sancionado={Boolean(grupoActivo?.estaSancionado)} />
          </div>
          <button onClick={cerrarSesion} className={styles.botonSalir}>
            <Icono nombre="salir" className={styles.icono} />
            <span className={styles.etiqueta}>Salir</span>
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
