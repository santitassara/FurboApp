import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import styles from './RestablecerPassword.module.css';

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
      <div className={styles.paginaCentrada}>
        <p className={styles.avisoError}>
          Falta el token del link. Pedí uno nuevo desde "Olvidé mi contraseña".
        </p>
        <Link to="/olvide-password" className={styles.enlaceSecundario}>
          Ir a Olvidé mi contraseña
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Restablecer contraseña</h1>

      {listo ? (
        <p className={styles.mensajeExito}>
          Contraseña actualizada. Redirigiendo al login…
        </p>
      ) : (
        <form onSubmit={manejarSubmit} className={styles.formulario}>
          <input
            type="password"
            placeholder="Contraseña nueva"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            className={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmarPassword}
            onChange={(evento) => setConfirmarPassword(evento.target.value)}
            className={styles.input}
            required
          />
          <button
            type="submit"
            disabled={enviando}
            className={styles.botonEnviar}
          >
            Guardar
          </button>
        </form>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
