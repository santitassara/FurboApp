import { useState } from 'react';
import api from '../services/api';
import Boton from './Boton';
import { POSICIONES } from '../constants/posiciones';
import { RESISTENCIA } from '../constants/resistencia';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './FormularioInvitado.module.css';

const INICIAL = {
  nombre: '',
  edad: '',
  posicionPrincipal: '',
  posicionSecundaria: '',
  resistencia: '',
  habilidadPromedio: 50,
};

export default function FormularioInvitado({ grupoId, onCreado, onCancelar }) {
  const [datos, setDatos] = useState(INICIAL);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  function actualizarCampo(campo, valor) {
    setDatos((anterior) => ({ ...anterior, [campo]: valor }));
  }

  const posicionesIguales =
    datos.posicionSecundaria && datos.posicionPrincipal === datos.posicionSecundaria;
  const puedeEnviar = datos.nombre.trim() && datos.posicionPrincipal && !posicionesIguales && !procesando;

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setProcesando(true);
    try {
      const { data } = await api.post(rutaGrupo(grupoId, '/invitados'), {
        nombre: datos.nombre.trim(),
        edad: datos.edad === '' ? null : Number(datos.edad),
        posicionPrincipal: datos.posicionPrincipal,
        posicionSecundaria: datos.posicionSecundaria || null,
        resistencia: datos.resistencia || null,
        habilidadPromedio: Number(datos.habilidadPromedio),
      });
      setDatos(INICIAL);
      onCreado?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <form onSubmit={enviar} className={styles.formulario}>
      <label className={styles.campo}>
        Nombre
        <input
          type="text"
          required
          value={datos.nombre}
          onChange={(evento) => actualizarCampo('nombre', evento.target.value)}
          placeholder="Nombre del invitado"
          className={styles.input}
        />
      </label>

      <label className={styles.campo}>
        Edad (opcional)
        <input
          type="number"
          min="5"
          max="70"
          value={datos.edad}
          onChange={(evento) => actualizarCampo('edad', evento.target.value)}
          className={styles.input}
        />
      </label>

      <div className={styles.grillaPosiciones}>
        <label className={styles.campo}>
          Posición principal
          <select
            value={datos.posicionPrincipal}
            onChange={(evento) => actualizarCampo('posicionPrincipal', evento.target.value)}
            className={styles.select}
          >
            <option value="" disabled>
              Elegí una posición
            </option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.campo}>
          Posición secundaria (opcional)
          <select
            value={datos.posicionSecundaria}
            onChange={(evento) => actualizarCampo('posicionSecundaria', evento.target.value)}
            className={styles.select}
          >
            <option value="">Ninguna</option>
            {POSICIONES.map((posicion) => (
              <option key={posicion.valor} value={posicion.valor}>
                {posicion.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {posicionesIguales && (
        <p className={styles.mensajeError}>La secundaria tiene que ser distinta de la principal.</p>
      )}

      <label className={styles.campo}>
        Resistencia (opcional)
        <select
          value={datos.resistencia}
          onChange={(evento) => actualizarCampo('resistencia', evento.target.value)}
          className={styles.select}
        >
          <option value="">Sin especificar</option>
          {RESISTENCIA.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.campo}>
        <div className={styles.encabezadoHabilidad}>
          <span>Nivel de juego (promedio)</span>
          <span className={styles.valorHabilidad}>{datos.habilidadPromedio}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={datos.habilidadPromedio}
          onChange={(evento) => actualizarCampo('habilidadPromedio', evento.target.value)}
          className={styles.slider}
        />
      </div>

      {error && <p className={styles.mensajeError}>{error}</p>}

      <div className={styles.acciones}>
        {onCancelar && (
          <Boton type="button" variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
        )}
        <Boton type="submit" disabled={!puedeEnviar}>
          {procesando ? 'Enviando…' : 'Proponer invitado'}
        </Boton>
      </div>
    </form>
  );
}
