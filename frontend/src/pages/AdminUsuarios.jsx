import { useEffect, useState } from 'react';
import api from '../services/api';
import Boton from '../components/Boton';
import styles from './AdminUsuarios.module.css';

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [uidEnEdicion, setUidEnEdicion] = useState(null);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [errorPassword, setErrorPassword] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const { data } = await api.get('/usuarios/admin');
        setUsuarios(data);
      } catch (err) {
        setError(err.message || 'No se pudo cargar la lista de usuarios.');
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return true;
    return usuario.nombre?.toLowerCase().includes(texto) || usuario.email?.toLowerCase().includes(texto);
  });

  function abrirEdicion(uid) {
    setUidEnEdicion(uid);
    setPasswordNueva('');
    setConfirmarPassword('');
    setErrorPassword('');
    setMensaje('');
  }

  function cerrarEdicion() {
    setUidEnEdicion(null);
    setPasswordNueva('');
    setConfirmarPassword('');
    setErrorPassword('');
  }

  async function guardarPassword(uid) {
    setErrorPassword('');
    if (passwordNueva.length < 6) {
      setErrorPassword('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (passwordNueva !== confirmarPassword) {
      setErrorPassword('Las contraseñas no coinciden.');
      return;
    }
    setGuardando(true);
    try {
      await api.patch(`/usuarios/${uid}/password`, { password: passwordNueva });
      setMensaje('Contraseña actualizada correctamente.');
      cerrarEdicion();
    } catch (err) {
      setErrorPassword(err.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={styles.contenedor}>
      <div>
        <h1 className={styles.titulo}>Usuarios (Super Admin)</h1>
        <p className={styles.subtitulo}>Resetear la contraseña de un usuario que no puede ingresar.</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o email"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        className={styles.inputBusqueda}
      />

      {mensaje && <p className={styles.mensajeExito}>{mensaje}</p>}
      {error && <p className={styles.mensajeError}>{error}</p>}

      {cargando ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : (
        <div className={styles.lista}>
          {usuariosFiltrados.map((usuario) => (
            <div key={usuario.uid} className={styles.tarjetaUsuario}>
              <div className={styles.filaUsuario}>
                <div>
                  <p className={styles.nombreUsuario}>{usuario.nombre}</p>
                  <p className={styles.emailUsuario}>{usuario.email}</p>
                </div>
                {uidEnEdicion !== usuario.uid && (
                  <Boton variante="ghost" onClick={() => abrirEdicion(usuario.uid)}>
                    Resetear contraseña
                  </Boton>
                )}
              </div>

              {uidEnEdicion === usuario.uid && (
                <div className={styles.formEdicion}>
                  <input
                    type="password"
                    placeholder="Contraseña nueva"
                    value={passwordNueva}
                    onChange={(evento) => setPasswordNueva(evento.target.value)}
                    className={styles.inputPassword}
                  />
                  <input
                    type="password"
                    placeholder="Confirmar contraseña"
                    value={confirmarPassword}
                    onChange={(evento) => setConfirmarPassword(evento.target.value)}
                    className={styles.inputPassword}
                  />
                  {errorPassword && <p className={styles.errorPassword}>{errorPassword}</p>}
                  <div className={styles.filaBotones}>
                    <Boton onClick={() => guardarPassword(usuario.uid)} disabled={guardando}>
                      Guardar
                    </Boton>
                    <Boton variante="ghost" onClick={cerrarEdicion} disabled={guardando}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              )}
            </div>
          ))}
          {usuariosFiltrados.length === 0 && <p className={styles.sinResultados}>No se encontraron usuarios.</p>}
        </div>
      )}
    </div>
  );
}
