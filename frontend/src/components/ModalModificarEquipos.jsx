import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Boton from './Boton';
import styles from './ModalModificarEquipos.module.css';

// Identidad de un jugador elegible: real o invitado, nunca ambos (mismo criterio
// que ModalCargarResultado y el backend).
function clave(usuarioId, invitadoId) {
  if (!usuarioId && !invitadoId) return '';
  return usuarioId ? `u:${usuarioId}` : `i:${invitadoId}`;
}

function declave(valor) {
  if (!valor) return { usuarioId: null, invitadoId: null };
  if (valor.startsWith('u:')) return { usuarioId: valor.slice(2), invitadoId: null };
  return { usuarioId: null, invitadoId: valor.slice(2) };
}

export default function ModalModificarEquipos({
  abierto,
  partido,
  jugadores,
  disponibles,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}) {
  // asignaciones: [{ clave, nombre, esInvitado, equipo, esNueva? }]
  // esNueva marca a los jugadores que no estaban anotados y se agregan al partido.
  const [asignaciones, setAsignaciones] = useState([]);
  // Jugadores disponibles que aún no se han agregado al partido.
  const [disponiblesRestantes, setDisponiblesRestantes] = useState([]);

  useEffect(() => {
    if (!abierto) return;
    setAsignaciones(
      (jugadores || []).map((j) => ({
        clave: clave(j.usuarioId, j.invitadoId),
        nombre: j.nombre || 'Jugador',
        esInvitado: Boolean(j.invitadoId),
        equipo: j.equipo || null,
      }))
    );
    setDisponiblesRestantes(
      (disponibles || []).map((j) => ({
        clave: clave(j.usuarioId, j.invitadoId),
        nombre: j.nombre || 'Jugador',
        esInvitado: Boolean(j.invitadoId),
      }))
    );
  }, [abierto, jugadores, disponibles]);

  function mover(claveJugador, equipo) {
    setAsignaciones((anterior) =>
      anterior.map((asig) =>
        asig.clave === claveJugador ? { ...asig, equipo } : asig
      )
    );
  }

  function agregarJugador(claveDisponible, equipo) {
    const jugador = disponiblesRestantes.find((d) => d.clave === claveDisponible);
    if (!jugador) return;
    setDisponiblesRestantes((anterior) =>
      anterior.filter((d) => d.clave !== claveDisponible)
    );
    setAsignaciones((anterior) => [
      ...anterior,
      {
        clave: claveDisponible,
        nombre: jugador.nombre,
        esInvitado: Boolean(jugador.invitadoId),
        equipo,
        esNueva: true,
      },
    ]);
  }

  function quitarAgregado(claveJugador) {
    const asig = asignaciones.find((a) => a.clave === claveJugador);
    setAsignaciones((anterior) => anterior.filter((a) => a.clave !== claveJugador));
    if (asig && asig.esNueva) {
      const jugador = (disponibles || []).find((d) => clave(d.usuarioId, d.invitadoId) === claveJugador);
      if (jugador) {
        setDisponiblesRestantes((anterior) => [...anterior, jugador]);
      }
    }
  }

  function confirmar() {
    const payload = {
      equipos: asignaciones
        .filter((a) => !a.esNueva)
        .map((asig) => ({ ...declave(asig.clave), equipo: asig.equipo })),
      agregar: asignaciones
        .filter((a) => a.esNueva)
        .map((asig) => ({ ...declave(asig.clave), equipo: asig.equipo })),
    };
    onConfirmar(payload);
  }

  const equipoA = asignaciones.filter((a) => a.equipo === 'A');
  const equipoB = asignaciones.filter((a) => a.equipo === 'B');
  const sinEquipo = asignaciones.filter((a) => !a.equipo);

  function opcionesPara(asig) {
    if (asig.esNueva) {
      return [
        { equipo: 'A', label: '→ Equipo A' },
        { equipo: 'B', label: '→ Equipo B' },
        { equipo: null, label: 'Quitar', quitar: true },
      ];
    }
    return [
      { equipo: 'A', label: '→ Equipo A' },
      { equipo: 'B', label: '→ Equipo B' },
      { equipo: null, label: 'Sacar' },
    ].filter((o) => o.equipo !== asig.equipo);
  }

  function filaJugador(asig) {
    return (
      <div key={asig.clave} className={styles.filaJugador}>
        <span className={styles.nombreJugador}>
          {asig.nombre}
          {asig.esInvitado && <span className={styles.invitadoTag}>Invitado</span>}
        </span>
        {opcionesPara(asig).map(({ equipo, label, quitar }) => (
          <Boton
            key={equipo}
            variante="ghost"
            className={clsx(styles.botonMover, equipo === null && styles.botonSacar)}
            onClick={() => (quitar ? quitarAgregado(asig.clave) : mover(asig.clave, equipo))}
          >
            {label}
          </Boton>
        ))}
      </div>
    );
  }

  if (!abierto) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.contenido}>
          <h2 className={styles.titulo}>
            Modificar equipos — {new Date(partido.fecha).toLocaleString('es-AR')}
          </h2>
          <p className={styles.ayuda}>
            Podés sacar, agregar e intercambiar jugadores entre los equipos. Se incluyen usuarios e invitados.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <section className={styles.equipos}>
            <div className={styles.columna}>
              <h3 className={styles.tituloEquipo}>
                Equipo A <span className={styles.contador}>({equipoA.length})</span>
              </h3>
              {equipoA.length === 0 ? (
                <p className={styles.vacio}>Sin jugadores</p>
              ) : (
                equipoA.map((asig) => filaJugador(asig))
              )}
            </div>
            <div className={styles.columna}>
              <h3 className={styles.tituloEquipo}>
                Equipo B <span className={styles.contador}>({equipoB.length})</span>
              </h3>
              {equipoB.length === 0 ? (
                <p className={styles.vacio}>Sin jugadores</p>
              ) : (
                equipoB.map((asig) => filaJugador(asig))
              )}
            </div>
            <div className={styles.columna}>
              <h3 className={styles.tituloEquipo}>
                Sin equipo <span className={styles.contador}>({sinEquipo.length})</span>
              </h3>
              {sinEquipo.length === 0 ? (
                <p className={styles.vacio}>Sin jugadores</p>
              ) : (
                sinEquipo.map((asig) => filaJugador(asig))
              )}
            </div>
          </section>

          {disponiblesRestantes.length > 0 && (
            <section className={styles.seccion}>
              <h3 className={styles.tituloSeccion}>
                Agregar jugador (no estaba anotado)
              </h3>
              {disponiblesRestantes.map((jugador) => (
                <div key={jugador.clave} className={styles.filaAgregar}>
                  <span className={styles.nombreJugador}>
                    {jugador.nombre}
                    {jugador.esInvitado && <span className={styles.invitadoTag}>Invitado</span>}
                  </span>
                  <Boton
                    variante="ghost"
                    className={styles.botonMover}
                    onClick={() => agregarJugador(jugador.clave, 'A')}
                  >
                    → Equipo A
                  </Boton>
                  <Boton
                    variante="ghost"
                    className={styles.botonMover}
                    onClick={() => agregarJugador(jugador.clave, 'B')}
                  >
                    → Equipo B
                  </Boton>
                </div>
              ))}
            </section>
          )}

        </div>
        <div className={styles.pie}>
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={confirmar} disabled={procesando}>
            Guardar equipos
          </Boton>
        </div>
      </div>
    </div>
  );
}
