import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';
import Boton from './Boton';

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

const CLASE_INPUT = 'rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white';
const CLASE_LABEL = 'flex flex-col gap-1 text-sm text-white/70';

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
    <section className="rounded-xl border border-white/10 bg-cancha-800 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-white">Partidos automáticos</h2>
        <Boton variante="ghost" className="px-3 py-1 text-xs" onClick={abrirAlta} disabled={accionEnCurso}>
          Nueva programación
        </Boton>
      </div>

      {error && <p className="mb-3 rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
      {mensaje && <p className="mb-3 rounded-lg bg-pasto-600/20 px-4 py-2 text-sm text-pasto-500">{mensaje}</p>}

      {programaciones.length === 0 ? (
        <p className="text-sm text-white/50">
          No hay partidos automáticos. Creá una programación para que la fecha se abra sola todas las semanas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {programaciones.map((programacion) => (
            <li key={programacion.id} className="rounded-lg border border-white/10 bg-cancha-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="font-semibold text-white">
                    {programacion.nombre || `Partido de los ${nombreDia(programacion.diaSemanaPartido).toLowerCase()}`}
                    {!programacion.activa && <span className="ml-2 text-xs text-white/50">(pausada)</span>}
                  </p>
                  <p className="text-sm text-white/70">
                    Se crea los {nombreDia(programacion.diaSemanaDisparo).toLowerCase()} {programacion.horaDisparo} →
                    partido {nombreDia(programacion.diaSemanaPartido).toLowerCase()} {programacion.horaPartido}
                  </p>
                  <p className="text-sm text-white/50">
                    {[
                      programacion.estadio,
                      `${programacion.cupoTitulares}+${programacion.cupoSuplentes}`,
                      programacion.valorCuota != null ? `$${programacion.valorCuota.toLocaleString('es-AR')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {Boolean(programacion.activa) && (
                    <p className="mt-1 text-xs text-white/40">
                      Próxima creación: {formatearProximoDisparo(programacion.proximoDisparo)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Boton
                    variante="ghost"
                    className="px-3 py-1 text-xs"
                    onClick={() => abrirEdicion(programacion)}
                    disabled={accionEnCurso}
                  >
                    Editar
                  </Boton>
                  <Boton
                    variante="ghost"
                    className="px-3 py-1 text-xs"
                    onClick={() => alternarActiva(programacion)}
                    disabled={accionEnCurso}
                  >
                    {programacion.activa ? 'Pausar' : 'Reanudar'}
                  </Boton>
                  <Boton
                    variante="peligro"
                    className="px-3 py-1 text-xs"
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
        <form onSubmit={guardar} className="mt-5 flex flex-wrap items-end gap-4 border-t border-white/10 pt-5">
          <label className={`${CLASE_LABEL} min-w-[200px] flex-1`}>
            Nombre (opcional)
            <input
              type="text"
              value={formulario.nombre}
              onChange={(evento) => actualizarCampo('nombre', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Viernes Parador 4"
            />
          </label>
          <label className={CLASE_LABEL}>
            Día de creación
            <select
              value={formulario.diaSemanaDisparo}
              onChange={(evento) => actualizarCampo('diaSemanaDisparo', evento.target.value)}
              className={CLASE_INPUT}
            >
              {DIAS.map((dia) => (
                <option key={dia.valor} value={dia.valor}>
                  {dia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={CLASE_LABEL}>
            Hora de creación
            <input
              type="time"
              required
              value={formulario.horaDisparo}
              onChange={(evento) => actualizarCampo('horaDisparo', evento.target.value)}
              className={CLASE_INPUT}
            />
          </label>
          <label className={CLASE_LABEL}>
            Día del partido
            <select
              value={formulario.diaSemanaPartido}
              onChange={(evento) => actualizarCampo('diaSemanaPartido', evento.target.value)}
              className={CLASE_INPUT}
            >
              {DIAS.map((dia) => (
                <option key={dia.valor} value={dia.valor}>
                  {dia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={CLASE_LABEL}>
            Hora del partido
            <input
              type="time"
              required
              value={formulario.horaPartido}
              onChange={(evento) => actualizarCampo('horaPartido', evento.target.value)}
              className={CLASE_INPUT}
            />
          </label>
          <label className={CLASE_LABEL}>
            Cupo titulares
            <input
              type="number"
              min="1"
              required
              value={formulario.cupoTitulares}
              onChange={(evento) => actualizarCampo('cupoTitulares', evento.target.value)}
              className={`${CLASE_INPUT} w-28`}
            />
          </label>
          <label className={CLASE_LABEL}>
            Cupo suplentes
            <input
              type="number"
              min="0"
              required
              value={formulario.cupoSuplentes}
              onChange={(evento) => actualizarCampo('cupoSuplentes', evento.target.value)}
              className={`${CLASE_INPUT} w-28`}
            />
          </label>
          <label className={`${CLASE_LABEL} min-w-[180px] flex-1`}>
            Estadio
            <input
              type="text"
              value={formulario.estadio}
              onChange={(evento) => actualizarCampo('estadio', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Parador 4"
            />
          </label>
          <label className={`${CLASE_LABEL} min-w-[180px] flex-1`}>
            Tipo de suelo
            <input
              type="text"
              value={formulario.tipoSuelo}
              onChange={(evento) => actualizarCampo('tipoSuelo', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Sintético Cubierto Pro 7vs7"
            />
          </label>
          <label className={`${CLASE_LABEL} min-w-[220px] flex-1`}>
            Dirección
            <input
              type="text"
              value={formulario.direccion}
              onChange={(evento) => actualizarCampo('direccion', evento.target.value)}
              className={CLASE_INPUT}
              placeholder="Ej. Av. Álvarez Thomas 1850, CABA"
            />
          </label>
          <label className={CLASE_LABEL}>
            Valor por jugador
            <input
              type="number"
              min="0"
              step="1"
              value={formulario.valorCuota}
              onChange={(evento) => actualizarCampo('valorCuota', evento.target.value)}
              className={`${CLASE_INPUT} w-28`}
              placeholder="10000"
            />
          </label>
          <div className="flex gap-2">
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
