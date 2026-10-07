import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import Boton from './Boton';
import styles from './FixtureTorneo.module.css';

// Convierte una fecha ISO a el formato que entiende <input type="datetime-local">
// en la zona horaria local (yyyy-MM-dd'T'HH:mm).
function aLocalISO(iso) {
  const fecha = new Date(iso);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function borradorDe(partido) {
  return {
    fecha: partido.fecha ? aLocalISO(partido.fecha) : '',
    rival: partido.rival ?? '',
    notasTacticas: partido.notasTacticas ?? '',
  };
}

const ETIQUETAS_ESTADO = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
};

export default function FixtureTorneo({ grupoId }) {
  const [partidos, setPartidos] = useState([]);
  const [borradores, setBorradores] = useState({});
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [partidoParaEliminar, setPartidoParaEliminar] = useState(null);

  const cargar = useCallback(async () => {
    if (!grupoId) return;
    try {
      const { data } = await api.get(rutaGrupo(grupoId, '/partidos/fixture'));
      setPartidos(data);
      setBorradores(Object.fromEntries(data.map((partido) => [partido.id, borradorDe(partido)])));
    } catch (err) {
      setError(err.message);
    }
  }, [grupoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actualizarBorrador(partidoId, campo, valor) {
    setBorradores((anterior) => ({
      ...anterior,
      [partidoId]: { ...anterior[partidoId], [campo]: valor },
    }));
  }

  async function guardar(partidoId) {
    const borrador = borradores[partidoId];
    if (!borrador || !borrador.fecha) return;
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.patch(rutaGrupo(grupoId, `/partidos/${partidoId}`), {
        fecha: new Date(borrador.fecha).toISOString(),
        rival: borrador.rival.trim() || null,
        notasTacticas: borrador.notasTacticas.trim() || null,
      });
      setMensaje('Fecha actualizada.');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function confirmarEliminar() {
    setAccionEnCurso(true);
    setError('');
    try {
      await api.delete(rutaGrupo(grupoId, `/partidos/${partidoParaEliminar}`));
      setPartidoParaEliminar(null);
      setMensaje('Fecha eliminada.');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.titulo}>Fixture del torneo</h2>

      {error && <p className={styles.mensajeError}>{error}</p>}
      {mensaje && <p className={styles.mensajeExito}>{mensaje}</p>}

      {partidos.length === 0 ? (
        <p className={styles.vacio}>Todavía no hay fechas de partido.</p>
      ) : (
        <ul className={styles.lista}>
          {partidos.map((partido, indice) => {
            const borrador = borradores[partido.id] || borradorDe(partido);
            return (
              <li key={partido.id} className={styles.fila}>
                <div className={styles.encabezadoFila}>
                  <span className={styles.numeroFecha}>Fecha #{indice + 1}</span>
                  <span className={clsx(styles.badgeEstado, partido.estado === 'cerrado' && styles.badgeCerrado)}>
                    {ETIQUETAS_ESTADO[partido.estado] || partido.estado}
                  </span>
                  <span className={styles.textoSecundario}>
                    {partido.ocupados?.titulares || 0}/{partido.cupoTitulares} anotados
                  </span>
                </div>
                <div className={styles.campos}>
                  <label className={styles.label}>
                    Fecha
                    <input
                      type="datetime-local"
                      value={borrador.fecha}
                      onChange={(evento) => actualizarBorrador(partido.id, 'fecha', evento.target.value)}
                      className={styles.inputFecha}
                    />
                  </label>
                  <label className={styles.label}>
                    Rival
                    <input
                      type="text"
                      value={borrador.rival}
                      onChange={(evento) => actualizarBorrador(partido.id, 'rival', evento.target.value)}
                      className={styles.input}
                      placeholder="Ej. Peña del Frente Sur"
                    />
                  </label>
                  <label className={styles.label}>
                    Notas tácticas
                    <input
                      type="text"
                      value={borrador.notasTacticas}
                      onChange={(evento) => actualizarBorrador(partido.id, 'notasTacticas', evento.target.value)}
                      className={styles.input}
                      placeholder="Ej. Juegan con marca al hombre, ojo al 9"
                    />
                  </label>
                </div>
                <div className={styles.acciones}>
                  <Boton
                    variante="ghost"
                    className={styles.botonAccion}
                    onClick={() => guardar(partido.id)}
                    disabled={accionEnCurso || partido.estado !== 'abierto'}
                  >
                    Guardar cambios
                  </Boton>
                  <Boton
                    variante="ghost"
                    className={clsx(styles.botonAccion, styles.botonPeligro)}
                    onClick={() => setPartidoParaEliminar(partido.id)}
                    disabled={accionEnCurso}
                  >
                    Eliminar fecha
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {partidoParaEliminar && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitulo}>Eliminar fecha</h3>
            <p className={styles.modalTexto}>
              Se eliminará la fecha y todas sus inscripciones. Esta acción es irreversible, ¿estás seguro?
            </p>
            <div className={styles.modalAcciones}>
              <Boton variante="ghost" onClick={() => setPartidoParaEliminar(null)} disabled={accionEnCurso}>
                Cancelar
              </Boton>
              <Boton variante="peligro" onClick={confirmarEliminar} disabled={accionEnCurso}>
                {accionEnCurso ? 'Eliminando…' : 'Eliminar'}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
