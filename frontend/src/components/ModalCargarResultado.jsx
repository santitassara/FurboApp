import { useEffect, useState } from 'react';
import Boton from './Boton';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import { formatearFechaPartido } from '../utils/fecha';
import styles from './ModalCargarResultado.module.css';

// Identidad de un jugador elegible: real o invitado, nunca ambos (ver backend
// claveJugador). Los <select> usan esta clave como value/key para no colisionar
// cuando usuarioId es null en varias filas de invitados.
function clave(usuarioId, invitadoId) {
  if (!usuarioId && !invitadoId) return '';
  return usuarioId ? `u:${usuarioId}` : `i:${invitadoId}`;
}

function declave(valor) {
  if (!valor) return { usuarioId: null, invitadoId: null };
  if (valor.startsWith('u:')) return { usuarioId: valor.slice(2), invitadoId: null };
  return { usuarioId: null, invitadoId: valor.slice(2) };
}

function golVacio() {
  return { clave: '', equipo: 'A', minuto: '', asistenciaClave: '', enContra: false };
}

function sancionVacia() {
  return { clave: '', motivo: '' };
}

export default function ModalCargarResultado({
  abierto,
  partido,
  elegibles,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  const { grupoActivo } = useGrupo();
  const [goles, setGoles] = useState([]);
  const [sanciones, setSanciones] = useState([]);
  const [beelupUrl, setBeelupUrl] = useState('');
  const [cargandoExistente, setCargandoExistente] = useState(false);

  useEffect(() => {
    if (!abierto) return;

    setBeelupUrl(partido.beelupUrl || '');

    if (partido.estado !== 'jugado') {
      setGoles([]);
      setSanciones([]);
      return;
    }

    let cancelado = false;
    setCargandoExistente(true);
    api
      .get(rutaGrupo(grupoActivo.id, `/partidos/${partido.id}/resultado`))
      .then(({ data }) => {
        if (cancelado) return;
        setGoles(
          (data.goles || []).map((gol) => ({
            clave: clave(gol.usuarioId, gol.invitadoId),
            equipo: gol.equipo,
            minuto: String(gol.minuto),
            asistenciaClave: clave(gol.asistenciaUsuarioId, gol.asistenciaInvitadoId),
            enContra: !!gol.enContra,
          }))
        );
        setSanciones(
          (data.sanciones || []).map((sancion) => ({
            clave: clave(sancion.usuarioId, sancion.invitadoId),
            motivo: sancion.motivo,
          }))
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setCargandoExistente(false);
      });

    return () => {
      cancelado = true;
    };
  }, [abierto, partido, grupoActivo]);

  if (!abierto) return null;

  function actualizarGol(indice, campo, valor) {
    setGoles((anterior) => anterior.map((gol, i) => {
      if (i === indice) {
        const actualizado = { ...gol, [campo]: valor };
        // Si se cambió el jugador y la asistencia quedó igual al nuevo jugador, limpiar asistencia
        if (campo === 'clave' && actualizado.asistenciaClave === valor) {
          actualizado.asistenciaClave = '';
        }
        // Un gol en contra no lleva asistencia (nadie "asiste" un autogol)
        if (campo === 'enContra' && valor) {
          actualizado.asistenciaClave = '';
        }
        return actualizado;
      }
      return gol;
    }));
  }

  function actualizarSancion(indice, campo, valor) {
    setSanciones((anterior) => anterior.map((sancion, i) => (i === indice ? { ...sancion, [campo]: valor } : sancion)));
  }

  function confirmar() {
    const payload = {
      goles: goles
        .filter((gol) => gol.clave && gol.minuto !== '')
        .map((gol) => {
          const asistencia = gol.enContra ? { usuarioId: null, invitadoId: null } : declave(gol.asistenciaClave);
          return {
            ...declave(gol.clave),
            equipo: gol.equipo,
            minuto: Number(gol.minuto),
            asistenciaUsuarioId: asistencia.usuarioId,
            asistenciaInvitadoId: asistencia.invitadoId,
            enContra: gol.enContra,
          };
        }),
      sanciones: sanciones
        .filter((sancion) => sancion.clave && sancion.motivo.trim())
        .map((sancion) => ({ ...declave(sancion.clave), motivo: sancion.motivo })),
      beelupUrl: beelupUrl.trim(),
    };
    onConfirmar(payload);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
      <div className={styles.contenido}>
        <h2 className={styles.titulo}>
          {partido.estado === 'jugado' ? 'Editar resultado' : 'Cargar resultado'} — {formatearFechaPartido(partido.fecha)}
        </h2>

        {cargandoExistente && <p className={styles.mensajeCargando}>Cargando resultado actual…</p>}

        {elegibles.length === 0 && (
          <p className={styles.avisoSinElegibles}>
            Este partido no tiene formación guardada, así que no hay jugadores elegibles. Guardá la formación desde
            el inicio antes de cargar el resultado.
          </p>
        )}

        <section className={styles.seccion}>
          <label className={styles.etiquetaCampo} htmlFor="beelupUrl">
            URL del video (Beelup)
          </label>
          <input
            id="beelupUrl"
            type="text"
            placeholder="https://beelup.com/player.php?id=..."
            value={beelupUrl}
            onChange={(e) => setBeelupUrl(e.target.value)}
            className={styles.inputTexto}
          />
        </section>

        <section className={styles.seccion}>
          <div className={styles.encabezadoSeccion}>
            <h3 className={styles.tituloSeccion}>Goles</h3>
            <Boton variante="ghost" className={styles.botonAgregar} onClick={() => setGoles((a) => [...a, golVacio()])}>
              + Agregar gol
            </Boton>
          </div>
          {goles.map((gol, indice) => (
            <div key={indice} className={styles.filaFormulario}>
              <select
                value={gol.clave}
                onChange={(e) => actualizarGol(indice, 'clave', e.target.value)}
                className={styles.select}
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={clave(j.usuarioId, j.invitadoId)} value={clave(j.usuarioId, j.invitadoId)}>
                    {j.nombre} ({j.equipo})
                  </option>
                ))}
              </select>
              <select
                value={gol.equipo}
                onChange={(e) => actualizarGol(indice, 'equipo', e.target.value)}
                className={styles.select}
              >
                <option value="A">Equipo A</option>
                <option value="B">Equipo B</option>
              </select>
              <input
                type="number"
                min="0"
                placeholder="Minuto"
                value={gol.minuto}
                onChange={(e) => actualizarGol(indice, 'minuto', e.target.value)}
                className={styles.inputMinuto}
              />
              <select
                value={gol.asistenciaClave}
                onChange={(e) => actualizarGol(indice, 'asistenciaClave', e.target.value)}
                disabled={gol.enContra}
                className={styles.selectAsistencia}
              >
                <option value="">Sin asistencia</option>
                {elegibles
                  .filter((j) => clave(j.usuarioId, j.invitadoId) !== gol.clave)
                  .map((j) => (
                    <option key={clave(j.usuarioId, j.invitadoId)} value={clave(j.usuarioId, j.invitadoId)}>
                      {j.nombre}
                    </option>
                  ))}
              </select>
              <label className={styles.labelCheckbox}>
                <input
                  type="checkbox"
                  checked={gol.enContra}
                  onChange={(e) => actualizarGol(indice, 'enContra', e.target.checked)}
                />
                En contra (PP)
              </label>
              <Boton
                variante="ghost"
                className={styles.botonQuitar}
                onClick={() => setGoles((a) => a.filter((_, i) => i !== indice))}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </section>

        <section className={styles.seccion}>
          <div className={styles.encabezadoSeccion}>
            <h3 className={styles.tituloSeccion}>Sanciones en cancha</h3>
            <Boton
              variante="ghost"
              className={styles.botonAgregar}
              onClick={() => setSanciones((a) => [...a, sancionVacia()])}
            >
              + Agregar sanción
            </Boton>
          </div>
          {sanciones.map((sancion, indice) => (
            <div key={indice} className={styles.filaFormulario}>
              <select
                value={sancion.clave}
                onChange={(e) => actualizarSancion(indice, 'clave', e.target.value)}
                className={styles.select}
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={clave(j.usuarioId, j.invitadoId)} value={clave(j.usuarioId, j.invitadoId)}>
                    {j.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Motivo (ej: Tarjeta roja)"
                value={sancion.motivo}
                onChange={(e) => actualizarSancion(indice, 'motivo', e.target.value)}
                className={styles.inputMotivo}
              />
              <Boton
                variante="ghost"
                className={styles.botonQuitar}
                onClick={() => setSanciones((a) => a.filter((_, i) => i !== indice))}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </section>

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.pie}>
        <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={confirmar} disabled={procesando || cargandoExistente}>
          {procesando ? 'Guardando…' : 'Guardar resultado'}
        </Boton>
      </div>
      </div>
    </div>
  );
}
