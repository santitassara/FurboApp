import { useEffect, useState } from 'react';
import Boton from './Boton';
import api from '../services/api';
import { useGrupo } from '../context/GrupoContext';
import { rutaGrupo } from '../utils/rutasGrupo';
import { formatearFechaPartido } from '../utils/fecha';
import styles from './ModalCargarResultado.module.css';

function golVacio() {
  return { usuarioId: '', equipo: 'A', minuto: '', asistenciaUsuarioId: '', enContra: false };
}

function sancionVacia() {
  return { usuarioId: '', motivo: '' };
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
            usuarioId: gol.usuarioId,
            equipo: gol.equipo,
            minuto: String(gol.minuto),
            asistenciaUsuarioId: gol.asistenciaUsuarioId || '',
            enContra: !!gol.enContra,
          }))
        );
        setSanciones(
          (data.sanciones || []).map((sancion) => ({
            usuarioId: sancion.usuarioId,
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
        // Si se cambió usuarioId y asistenciaUsuarioId es igual al nuevo usuarioId, limpiar asistencia
        if (campo === 'usuarioId' && actualizado.asistenciaUsuarioId === valor) {
          actualizado.asistenciaUsuarioId = '';
        }
        // Un gol en contra no lleva asistencia (nadie "asiste" un autogol)
        if (campo === 'enContra' && valor) {
          actualizado.asistenciaUsuarioId = '';
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
        .filter((gol) => gol.usuarioId && gol.minuto !== '')
        .map((gol) => ({
          usuarioId: gol.usuarioId,
          equipo: gol.equipo,
          minuto: Number(gol.minuto),
          asistenciaUsuarioId: gol.enContra ? null : gol.asistenciaUsuarioId || null,
          enContra: gol.enContra,
        })),
      sanciones: sanciones.filter((sancion) => sancion.usuarioId && sancion.motivo.trim()),
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
                value={gol.usuarioId}
                onChange={(e) => actualizarGol(indice, 'usuarioId', e.target.value)}
                className={styles.select}
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={j.usuarioId} value={j.usuarioId}>
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
                value={gol.asistenciaUsuarioId}
                onChange={(e) => actualizarGol(indice, 'asistenciaUsuarioId', e.target.value)}
                disabled={gol.enContra}
                className={styles.selectAsistencia}
              >
                <option value="">Sin asistencia</option>
                {elegibles
                  .filter((j) => j.usuarioId !== gol.usuarioId)
                  .map((j) => (
                    <option key={j.usuarioId} value={j.usuarioId}>
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
                value={sancion.usuarioId}
                onChange={(e) => actualizarSancion(indice, 'usuarioId', e.target.value)}
                className={styles.select}
              >
                <option value="">Jugador</option>
                {elegibles.map((j) => (
                  <option key={j.usuarioId} value={j.usuarioId}>
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
