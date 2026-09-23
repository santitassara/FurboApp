import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import styles from './OlvidePassword.module.css';

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
    <div className={styles.container}>
      <h1 className={styles.titulo}>Olvidé mi contraseña</h1>
      <p className={styles.descripcion}>Ingresá tu email y te mandamos un link para restablecerla.</p>

      <form onSubmit={manejarSubmit} className={styles.form}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className={styles.input}
          required
        />
        <button
          type="submit"
          disabled={enviando}
          className={styles.botonSubmit}
        >
          Enviar link
        </button>
      </form>

      {mensaje && <p className={styles.mensajeExito}>{mensaje}</p>}
      {error && <p className={styles.mensajeError}>{error}</p>}

      <Link to="/" className={styles.linkVolver}>
        Volver al login
      </Link>
    </div>
  );
}
