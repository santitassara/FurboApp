import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import styles from './AdminPanel.module.css';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { useAuth } from '../context/AuthContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import Boton from '../components/Boton';
import ListaJugadores from '../components/ListaJugadores';
import ModalConfirmacionSancionAdmin from '../components/ModalConfirmacionSancionAdmin';
import ModalCargarResultado from '../components/ModalCargarResultado';
import ProgramacionPartidos from '../components/ProgramacionPartidos';

const FORMULARIO_INICIAL = {
  fecha: '',
  cupoTitulares: 10,
  cupoSuplentes: 5,
  estadio: '',
  tipoSuelo: '',
  direccion: '',
  valorCuota: '',
};

export default function AdminPanel() {
  const { grupoActivo } = useGrupo();
  const { perfil } = useAuth();
  const [partidos, setPartidos] = useState([]);
  const [inscripcionesPorPartido, setInscripcionesPorPartido] = useState({});
  const [sancionados, setSancionados] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [jugadorASancionar, setJugadorASancionar] = useState(null);
  const [formacionesPorPartido, setFormacionesPorPartido] = useState({});
  const [partidoParaResultado, setPartidoParaResultado] = useState(null);
  const [miembrosExpandido, setMiembrosExpandido] = useState(false);

  const cargarTodo = useCallback(async () => {
    if (!grupoActivo) return;
    setError('');
    try {
      const [{ data: partidosAbiertos }, { data: sancionadosActuales }, { data: miembrosActuales }] = await Promise.all([
        api.get(rutaGrupo(grupoActivo.id, '/partidos')),
        api.get(rutaGrupo(grupoActivo.id, '/usuarios/sancionados')),
        api.get(rutaGrupo(grupoActivo.id, '/miembros')),
      ]);
      setPartidos(partidosAbiertos);
      setSancionados(sancionadosActuales);
      setMiembros(miembrosActuales);

      const entradas = await Promise.all(
        partidosAbiertos.map(async (partido) => {
          const { data: jugadores } = await api.get(
            rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/inscripciones`)
          );
          return [partido.id, jugadores];
        })
      );
      setInscripcionesPorPartido(Object.fromEntries(entradas));

      const entradasFormacion = await Promise.all(
        partidosAbiertos
          .filter((partido) => partido.estado !== 'abierto')
          .map(async (partido) => {
            const { data } = await api.get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/formacion`));
            return [partido.id, data];
          })
      );
      setFormacionesPorPartido(Object.fromEntries(entradasFormacion));
    } catch (err) {
      setError(err.message);
    }
  }, [grupoActivo]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function crearPartido(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, '/partidos'), {
        fecha: new Date(formulario.fecha).toISOString(),
        cupoTitulares: Number(formulario.cupoTitulares),
        cupoSuplentes: Number(formulario.cupoSuplentes),
        estadio: formulario.estadio || undefined,
        tipoSuelo: formulario.tipoSuelo || undefined,
        direccion: formulario.direccion || undefined,
        valorCuota: formulario.valorCuota !== '' ? Number(formulario.valorCuota) : undefined,
      });
      setMensaje('Partido creado con éxito.');
      setFormulario(FORMULARIO_INICIAL);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function perdonar(uid) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/usuarios/${uid}/perdonar`));
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function promoverAAdmin(uid) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/usuarios/${uid}/promover`));
      setMensaje('Usuario promovido a admin.');
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function desporomoverDeAdmin(uid) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/usuarios/${uid}/desporomover`));
      setMensaje('Admin revocado.');
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function promover(partidoId, usuarioId) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/promover/${usuarioId}`));
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function eliminarPartido(partidoId) {
    if (!window.confirm('¿Eliminar este partido? Esta acción no se puede deshacer.')) return;
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.delete(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}`));
      setMensaje('Partido eliminado con éxito.');
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function sancionar(partidoId, usuarioId) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.post(rutaGrupo(grupoActivo.id, `/partidos/${partidoId}/sancionar/${usuarioId}`));
      setJugadorASancionar(null);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  const elegibles = useMemo(
    () => (formacionesPorPartido[partidoParaResultado?.id]?.jugadores || []).filter((j) => j.equipo),
    [formacionesPorPartido, partidoParaResultado?.id]
  );

  async function guardarResultado(payload) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.put(rutaGrupo(grupoActivo.id, `/partidos/${partidoParaResultado.id}/resultado`), payload);
      setMensaje('Resultado cargado con éxito.');
      setPartidoParaResultado(null);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Panel de admin</h1>

      <div className={styles.card}>
        <p className={styles.invitacionLabel}>Comparte el código para que se unan al grupo:</p>
        <p className={styles.invitacionCodigo}>{grupoActivo?.codigoInvitacion}</p>
      </div>

      {error && <p className={styles.mensajeError}>{error}</p>}
      {mensaje && <p className={styles.mensajeExito}>{mensaje}</p>}

      <section className={styles.card}>
        <h2 className={styles.seccionTitulo}>Crear partido para {grupoActivo.nombre}</h2>
        <form onSubmit={crearPartido} className={styles.formulario}>
          <label className={styles.labelFlexAncho}>
            Fecha y hora
            <input
              type="datetime-local"
              required
              value={formulario.fecha}
              onChange={(evento) => setFormulario({ ...formulario, fecha: evento.target.value })}
              className={styles.input}
            />
          </label>
          <label className={styles.label}>
            Cupo titulares
            <input
              type="number"
              min="1"
              required
              value={formulario.cupoTitulares}
              onChange={(evento) => setFormulario({ ...formulario, cupoTitulares: evento.target.value })}
              className={styles.inputAngosto}
            />
          </label>
          <label className={styles.label}>
            Cupo suplentes
            <input
              type="number"
              min="0"
              required
              value={formulario.cupoSuplentes}
              onChange={(evento) => setFormulario({ ...formulario, cupoSuplentes: evento.target.value })}
              className={styles.inputAngosto}
            />
          </label>
          <label className={styles.labelMedio}>
            Estadio
            <input
              type="text"
              value={formulario.estadio}
              onChange={(evento) => setFormulario({ ...formulario, estadio: evento.target.value })}
              className={styles.input}
              placeholder="Ej. El Monumental F7"
            />
          </label>
          <label className={styles.labelMedio}>
            Tipo de suelo
            <input
              type="text"
              value={formulario.tipoSuelo}
              onChange={(evento) => setFormulario({ ...formulario, tipoSuelo: evento.target.value })}
              className={styles.input}
              placeholder="Ej. Sintético Cubierto Pro 7vs7"
            />
          </label>
          <label className={styles.labelAncho}>
            Dirección
            <input
              type="text"
              value={formulario.direccion}
              onChange={(evento) => setFormulario({ ...formulario, direccion: evento.target.value })}
              className={styles.input}
              placeholder="Ej. Av. Álvarez Thomas 1850, CABA"
            />
          </label>
          <label className={styles.label}>
            Valor por jugador
            <input
              type="number"
              min="0"
              step="1"
              value={formulario.valorCuota}
              onChange={(evento) => setFormulario({ ...formulario, valorCuota: evento.target.value })}
              className={styles.inputAngosto}
              placeholder="3000"
            />
          </label>
          <Boton type="submit" disabled={accionEnCurso}>
            {accionEnCurso ? 'Procesando…' : 'Crear'}
          </Boton>
        </form>
      </section>

      <ProgramacionPartidos grupoId={grupoActivo.id} />

      <section className={styles.card}>
        <h2 className={styles.seccionTitulo}>Sancionados</h2>
        {sancionados.length === 0 ? (
          <p className={styles.vacio}>No hay jugadores sancionados.</p>
        ) : (
          <ul className={styles.lista}>
            {sancionados.map((usuario) => (
              <li key={usuario.uid} className={styles.filaSancionado}>
                <span>{usuario.nombre}</span>
                <Boton
                  variante="ghost"
                  className={styles.botonAccion}
                  onClick={() => perdonar(usuario.uid)}
                  disabled={accionEnCurso}
                >
                  Perdonar
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.seccionPartidos}>
        <h2 className={styles.tituloPartidos}>Partidos</h2>
        {partidos.length === 0 ? (
          <p className={styles.vacio}>No hay partidos para mostrar.</p>
        ) : (
          partidos.map((partido) => (
            <div key={partido.id} className={styles.card}>
              <div className={styles.partidoHeader}>
                <h3 className={styles.partidoTitulo}>
                  {new Date(partido.fecha).toLocaleString('es-AR')}{' '}
                  <span className={styles.partidoEstado}>{partido.estado}</span>
                </h3>
                <div className={styles.botonesGrupo}>
                  {(partido.estado === 'cerrado' || partido.estado === 'jugado') && (
                    <Boton
                      variante="primario"
                      className={styles.botonAccion}
                      onClick={() => {
                        setError('');
                        setPartidoParaResultado(partido);
                      }}
                      disabled={accionEnCurso}
                    >
                      {partido.estado === 'jugado' ? 'Editar resultado' : 'Cargar resultado'}
                    </Boton>
                  )}
                  <Boton
                    variante="ghost"
                    className={clsx(styles.botonAccion, styles.botonPeligro)}
                    onClick={() => eliminarPartido(partido.id)}
                    disabled={accionEnCurso}
                  >
                    Eliminar
                  </Boton>
                </div>
              </div>
              <ListaJugadores
                jugadores={inscripcionesPorPartido[partido.id] || []}
                onPromover={partido.estado === 'abierto' ? (usuarioId) => promover(partido.id, usuarioId) : undefined}
                onSancionar={
                  partido.estado === 'abierto'
                    ? (usuarioId) => {
                        setError('');
                        const jugador = (inscripcionesPorPartido[partido.id] || []).find((j) => j.usuarioId === usuarioId);
                        setJugadorASancionar({ partidoId: partido.id, usuarioId, nombre: jugador?.nombre || 'este jugador' });
                      }
                    : undefined
                }
                deshabilitado={accionEnCurso}
                grupoId={grupoActivo.id}
              />
            </div>
          ))
        )}
      </section>

      {grupoActivo?.creadoPor === perfil?.uid && (
        <section className={styles.cardSinPadding}>
          <button
            onClick={() => setMiembrosExpandido(!miembrosExpandido)}
            className={styles.toggleMiembros}
          >
            <h2 className={styles.tituloPartidos}>Miembros del equipo</h2>
            <span className={styles.toggleIcono}>{miembrosExpandido ? '−' : '+'}</span>
          </button>
          {miembrosExpandido && (
            <div className={styles.miembrosContenido}>
              {miembros.length === 0 ? (
                <p className={styles.vacio}>No hay miembros en este grupo.</p>
              ) : (
                <ul className={styles.lista}>
                  {miembros.map((miembro) => (
                    <li key={miembro.uid} className={styles.filaMiembro}>
                      <div className={styles.miembroInfo}>
                        <span className={styles.miembroNombre}>{miembro.nombre}</span>
                        <span className={styles.miembroRol}>{miembro.rol === 'admin' ? 'Admin' : 'Jugador'}</span>
                      </div>
                      {miembro.uid !== grupoActivo.creadoPor && (
                        <div className={styles.botonesGrupo}>
                          {miembro.rol === 'jugador' ? (
                            <Boton
                              variante="ghost"
                              className={styles.botonAccion}
                              onClick={() => promoverAAdmin(miembro.uid)}
                              disabled={accionEnCurso}
                            >
                              Promover a admin
                            </Boton>
                          ) : (
                            <Boton
                              variante="ghost"
                              className={clsx(styles.botonAccion, styles.botonPeligro)}
                              onClick={() => desporomoverDeAdmin(miembro.uid)}
                              disabled={accionEnCurso}
                            >
                              Quitar admin
                            </Boton>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <ModalConfirmacionSancionAdmin
        abierto={Boolean(jugadorASancionar)}
        nombre={jugadorASancionar?.nombre}
        procesando={accionEnCurso}
        error={error}
        onConfirmar={() => sancionar(jugadorASancionar.partidoId, jugadorASancionar.usuarioId)}
        onCancelar={() => {
          setJugadorASancionar(null);
          setError('');
        }}
      />

      <ModalCargarResultado
        abierto={Boolean(partidoParaResultado)}
        partido={partidoParaResultado}
        elegibles={elegibles}
        procesando={accionEnCurso}
        error={error}
        onConfirmar={guardarResultado}
        onCancelar={() => {
          setPartidoParaResultado(null);
          setError('');
        }}
      />
    </div>
  );
}
