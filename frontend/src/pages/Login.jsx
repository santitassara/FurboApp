import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

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
    <div className={styles.contenedor}>
      <h1 className={styles.titulo}>FurboApp</h1>
      <p className={styles.subtitulo}>Organizá el picado de la semana sin quilombos.</p>

      <button
        onClick={manejarClickIngresar}
        className={styles.botonGoogle}
      >
        Ingresar con Google
      </button>

      <div className={styles.separadorContenedor}>
        <span className={styles.lineaSeparador} />
        <span className={styles.textoSeparador}>o</span>
        <span className={styles.lineaSeparador} />
      </div>

      <form onSubmit={manejarSubmit} className={styles.formulario}>
        {modo === 'registro' && (
          <input
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            className={styles.input}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
          className={styles.input}
          required
        />
        {modo === 'registro' && (
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmarPassword}
            onChange={(evento) => setConfirmarPassword(evento.target.value)}
            className={styles.input}
            required
          />
        )}
        <button
          type="submit"
          className={styles.botonSubmit}
        >
          {modo === 'registro' ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>

      <button type="button" onClick={alternarModo} className={styles.enlaceSecundario}>
        {modo === 'registro' ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Registrate'}
      </button>

      {modo === 'login' && (
        <Link to="/olvide-password" className={styles.enlaceSecundario}>
          ¿Olvidaste tu contraseña?
        </Link>
      )}

      {error && <p className={styles.mensajeError}>{error}</p>}
    </div>
  );
}
