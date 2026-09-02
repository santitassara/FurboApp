import { useEffect, useState } from 'react';
import api from '../services/api';
import Boton from '../components/Boton';

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Usuarios (Super Admin)</h1>
        <p className="text-sm text-white/60">Resetear la contraseña de un usuario que no puede ingresar.</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o email"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        className="w-full max-w-sm rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
      />

      {mensaje && <p className="rounded-lg bg-pasto-500/20 px-4 py-2 text-sm text-pasto-500">{mensaje}</p>}
      {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}

      {cargando ? (
        <p className="text-white/60">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {usuariosFiltrados.map((usuario) => (
            <div key={usuario.uid} className="rounded-lg bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{usuario.nombre}</p>
                  <p className="text-sm text-white/60">{usuario.email}</p>
                </div>
                {uidEnEdicion !== usuario.uid && (
                  <Boton variante="ghost" onClick={() => abrirEdicion(usuario.uid)}>
                    Resetear contraseña
                  </Boton>
                )}
              </div>

              {uidEnEdicion === usuario.uid && (
                <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
                  <input
                    type="password"
                    placeholder="Contraseña nueva"
                    value={passwordNueva}
                    onChange={(evento) => setPasswordNueva(evento.target.value)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
                  />
                  <input
                    type="password"
                    placeholder="Confirmar contraseña"
                    value={confirmarPassword}
                    onChange={(evento) => setConfirmarPassword(evento.target.value)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/40"
                  />
                  {errorPassword && <p className="text-sm text-sancion">{errorPassword}</p>}
                  <div className="flex gap-2">
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
          {usuariosFiltrados.length === 0 && <p className="text-white/60">No se encontraron usuarios.</p>}
        </div>
      )}
    </div>
  );
}
