import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import Boton from './Boton';
import styles from './ProgramacionPartidos.module.css';

const DIAS = [
  { valor: 0, nombre: 'Domingo' },
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
];

const FORMULARIO_INICIAL = {
  nombre: '',
  diaSemanaDisparo: 1,
  horaDisparo: '20:00',
  diaSemanaPartido: 5,
  horaPartido: '20:00',
  cupoTitulares: 10,
  cupoSuplentes: 5,
  estadio: '',
  tipoSuelo: '',
  direccion: '',
  valorCuota: '',
};

function nombreDia(valor) {
  return DIAS.find((dia) => dia.valor === Number(valor))?.nombre ?? '';
}

function formatearProximoDisparo(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProgramacionPartidos({ grupoId }) {
  const [programaciones, setProgramaciones] = useState([]);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [formularioVisible, setFormularioVisible] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [accionEnCurso, setAccionEnCurso] = useState(false);

  const cargar = useCallback(async () => {
    if (!grupoId) return;
    try {
      const { data } = await api.get(rutaGrupo(grupoId, '/programaciones'));
      setProgramaciones(data);
    } catch (err) {
      setError(err.message);
    }
  }, [grupoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actualizarCampo(campo, valor) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  function abrirAlta() {
    setEditandoId(null);
    setFormulario(FORMULARIO_INICIAL);
    setFormularioVisible(true);
  }

  function abrirEdicion(programacion) {
    setEditandoId(programacion.id);
    setFormulario({
      nombre: programacion.nombre ?? '',
      diaSemanaDisparo: programacion.diaSemanaDisparo,
      horaDisparo: programacion.horaDisparo,
      diaSemanaPartido: programacion.diaSemanaPartido,
      horaPartido: programacion.horaPartido,
      cupoTitulares: programacion.cupoTitulares,
      cupoSuplentes: programacion.cupoSuplentes,
      estadio: programacion.estadio ?? '',
      tipoSuelo: programacion.tipoSuelo ?? '',
      direccion: programacion.direccion ?? '',
      valorCuota: programacion.valorCuota ?? '',
    });
    setFormularioVisible(true);
  }

  function cerrarFormulario() {
    setFormularioVisible(false);
    setEditandoId(null);
    setFormulario(FORMULARIO_INICIAL);
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    const cuerpo = {
      nombre: formulario.nombre || null,
      diaSemanaDisparo: Number(formulario.diaSemanaDisparo),
      horaDisparo: formulario.horaDisparo,
      diaSemanaPartido: Number(formulario.diaSemanaPartido),
      horaPartido: formulario.horaPartido,
      cupoTitulares: Number(formulario.cupoTitulares),
      cupoSuplentes: Number(formulario.cupoSuplentes),
      estadio: formulario.estadio || null,
      tipoSuelo: formulario.tipoSuelo || null,
      direccion: formulario.direccion || null,
      valorCuota: formulario.valorCuota !== '' ? Number(formulario.valorCuota) : null,
    };
    try {
      if (editandoId) {
        await api.put(rutaGrupo(grupoId, `/programaciones/${editandoId}`), cuerpo);
        setMensaje('Programación actualizada.');
      } else {
        await api.post(rutaGrupo(grupoId, '/programaciones'), cuerpo);
        setMensaje('Programación creada.');
      }
      cerrarFormulario();
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function alternarActiva(programacion) {
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.put(rutaGrupo(grupoId, `/programaciones/${programacion.id}`), {
        activa: programacion.activa ? 0 : 1,
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function eliminar(programacion) {
    const etiqueta = programacion.nombre || `${nombreDia(programacion.diaSemanaPartido)} ${programacion.horaPartido}`;
    if (!window.confirm(`¿Borrar la programación "${etiqueta}"? Los partidos ya creados no se tocan.`)) return;
    setError('');
    setMensaje('');
    setAccionEnCurso(true);
    try {
      await api.delete(rutaGrupo(grupoId, `/programaciones/${programacion.id}`));
      setMensaje('Programación eliminada.');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  }

  return (
    <section className={styles.seccion}>
      <div className={styles.encabezado}>
        <h2 className={styles.tituloSeccion}>Partidos automáticos</h2>
        <Boton variante="ghost" className={styles.botonCompacto} onClick={abrirAlta} disabled={accionEnCurso}>
          Nueva programación
        </Boton>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {mensaje && <p className={styles.mensaje}>{mensaje}</p>}

      {programaciones.length === 0 ? (
        <p className={styles.textoTenue}>
          No hay partidos automáticos. Creá una programación para que la fecha se abra sola todas las semanas.
        </p>
      ) : (
        <ul className={styles.lista}>
          {programaciones.map((programacion) => (
            <li key={programacion.id} className={styles.item}>
              <div className={styles.itemFila}>
                <div className={styles.itemInfo}>
                  <p className={styles.itemNombre}>
                    {programacion.nombre || `Partido de los ${nombreDia(programacion.diaSemanaPartido).toLowerCase()}`}
                    {!programacion.activa && <span className={styles.badgePausada}>(pausada)</span>}
                  </p>
                  <p className={styles.itemDetalle}>
                    Se crea los {nombreDia(programacion.diaSemanaDisparo).toLowerCase()} {programacion.horaDisparo} →
                    partido {nombreDia(programacion.diaSemanaPartido).toLowerCase()} {programacion.horaPartido}
                  </p>
                  <p className={styles.textoTenue}>
                    {[
                      programacion.estadio,
                      `${programacion.cupoTitulares}+${programacion.cupoSuplentes}`,
                      programacion.valorCuota != null ? `$${programacion.valorCuota.toLocaleString('es-AR')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {Boolean(programacion.activa) && (
                    <p className={styles.proximaCreacion}>
                      Próxima creación: {formatearProximoDisparo(programacion.proximoDisparo)}
                    </p>
                  )}
                </div>
                <div className={styles.itemBotones}>
                  <Boton
                    variante="ghost"
                    className={styles.botonCompacto}
                    onClick={() => abrirEdicion(programacion)}
                    disabled={accionEnCurso}
                  >
                    Editar
                  </Boton>
                  <Boton
                    variante="ghost"
                    className={styles.botonCompacto}
                    onClick={() => alternarActiva(programacion)}
                    disabled={accionEnCurso}
                  >
                    {programacion.activa ? 'Pausar' : 'Reanudar'}
                  </Boton>
                  <Boton
                    variante="peligro"
                    className={styles.botonCompacto}
                    onClick={() => eliminar(programacion)}
                    disabled={accionEnCurso}
                  >
                    Borrar
                  </Boton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formularioVisible && (
        <form onSubmit={guardar} className={styles.formulario}>
          <label className={clsx(styles.label, styles.labelAncho200)}>
            Nombre (opcional)
            <input
              type="text"
              value={formulario.nombre}
              onChange={(evento) => actualizarCampo('nombre', evento.target.value)}
              className={styles.input}
              placeholder="Ej. Viernes Parador 4"
            />
          </label>
          <label className={styles.label}>
            Día de creación
            <select
              value={formulario.diaSemanaDisparo}
              onChange={(evento) => actualizarCampo('diaSemanaDisparo', evento.target.value)}
              className={styles.input}
            >
              {DIAS.map((dia) => (
                <option key={dia.valor} value={dia.valor}>
                  {dia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Hora de creación
            <input
              type="time"
              required
              value={formulario.horaDisparo}
              onChange={(evento) => actualizarCampo('horaDisparo', evento.target.value)}
              className={styles.input}
            />
          </label>
          <label className={styles.label}>
            Día del partido
            <select
              value={formulario.diaSemanaPartido}
              onChange={(evento) => actualizarCampo('diaSemanaPartido', evento.target.value)}
              className={styles.input}
            >
              {DIAS.map((dia) => (
                <option key={dia.valor} value={dia.valor}>
                  {dia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Hora del partido
            <input
              type="time"
              required
              value={formulario.horaPartido}
              onChange={(evento) => actualizarCampo('horaPartido', evento.target.value)}
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
              onChange={(evento) => actualizarCampo('cupoTitulares', evento.target.value)}
              className={clsx(styles.input, styles.inputAngosto)}
            />
          </label>
          <label className={styles.label}>
            Cupo suplentes
            <input
              type="number"
              min="0"
              required
              value={formulario.cupoSuplentes}
              onChange={(evento) => actualizarCampo('cupoSuplentes', evento.target.value)}
              className={clsx(styles.input, styles.inputAngosto)}
            />
          </label>
          <label className={clsx(styles.label, styles.labelAncho180)}>
            Estadio
            <input
              type="text"
              value={formulario.estadio}
              onChange={(evento) => actualizarCampo('estadio', evento.target.value)}
              className={styles.input}
              placeholder="Ej. Parador 4"
            />
          </label>
          <label className={clsx(styles.label, styles.labelAncho180)}>
            Tipo de suelo
            <input
              type="text"
              value={formulario.tipoSuelo}
              onChange={(evento) => actualizarCampo('tipoSuelo', evento.target.value)}
              className={styles.input}
              placeholder="Ej. Sintético Cubierto Pro 7vs7"
            />
          </label>
          <label className={clsx(styles.label, styles.labelAncho220)}>
            Dirección
            <input
              type="text"
              value={formulario.direccion}
              onChange={(evento) => actualizarCampo('direccion', evento.target.value)}
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
              onChange={(evento) => actualizarCampo('valorCuota', evento.target.value)}
              className={clsx(styles.input, styles.inputAngosto)}
              placeholder="10000"
            />
          </label>
          <div className={styles.formularioBotones}>
            <Boton type="submit" disabled={accionEnCurso}>
              {accionEnCurso ? 'Procesando…' : editandoId ? 'Guardar cambios' : 'Crear programación'}
            </Boton>
            <Boton type="button" variante="ghost" onClick={cerrarFormulario} disabled={accionEnCurso}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}
