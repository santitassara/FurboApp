import { useState } from 'react';
import clsx from 'clsx';
import { FaFutbol } from 'react-icons/fa';
import { formatearFechaPartido } from '../utils/fecha';
import ModalVerGol from './ModalVerGol';
import styles from './ResultadoPartido.module.css';

function IconoEscudo({ variante }) {
  if (variante === 'B') {
    return (
      <svg viewBox="0 0 24 24" className={styles.escudoIcono}>
        <path
          d="M12 2 4 5v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V5l-8-3Z"
          fill="#0d1f16"
          stroke="white"
          strokeWidth="1.4"
        />
        <path d="M12 2v18" stroke="white" strokeWidth="1" opacity="0.5" />
        <path d="M4.5 8h15M4 12h16M5 16h14" stroke="white" strokeWidth="1" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={styles.escudoIcono}>
      <path
        d="M12 2 4 5v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V5l-8-3Z"
        fill="white"
        fillOpacity="0.92"
        stroke="white"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function IconoTrofeo() {
  return (
    <svg viewBox="0 0 24 24" className={styles.trofeoIcono}>
      <path
        d="M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M7 5H4v1a4 4 0 0 0 3.4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 5h3v1a4 4 0 0 1-3.4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12v3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 19h6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 19c0-1.7 1-2.6 2.5-2.6s2.5.9 2.5 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconoTarjeta() {
  return <span className={styles.tarjetaIcono} />;
}

function BarraRendimiento({ puntaje }) {
  return (
    <div className={styles.barraRendimiento}>
      {Array.from({ length: 10 }, (_, indice) => (
        <span
          key={indice}
          className={clsx(styles.barraSegmento, indice < puntaje ? styles.barraSegmentoActivo : styles.barraSegmentoInactivo)}
        />
      ))}
    </div>
  );
}

function Panel({ titulo, children, className = '' }) {
  return (
    <div className={clsx(styles.panel, className)}>
      {titulo && <h4 className={styles.panelTitulo}>{titulo}</h4>}
      {children}
    </div>
  );
}

export default function ResultadoPartido({ partido, resultado }) {
  const [golSeleccionado, setGolSeleccionado] = useState(null);

  if (!resultado) {
    return (
      <div className={styles.cargando}>
        Cargando resultado…
      </div>
    );
  }

  const { marcador, goles, rendimientos, sanciones, jugadorDestacado } = resultado;

  return (
    <div className={styles.container}>
      <div className={styles.headerWrap}>
        <h3 className={styles.fechaTitulo}>{formatearFechaPartido(partido.fecha)}</h3>
        <p className={styles.subtitulo}>Resultado final</p>
      </div>

      <Panel className={styles.espaciadoInferior}>
        <div className={styles.marcadorRow}>
          <div className={styles.equipoCol}>
            <IconoEscudo variante="A" />
            <span className={styles.equipoLabel}>Equipo A</span>
          </div>
          <div className={styles.marcadorNumeros}>
            <span>{marcador.A}</span>
            <span className={styles.marcadorSeparador}>-</span>
            <span>{marcador.B}</span>
          </div>
          <div className={styles.equipoCol}>
            <IconoEscudo variante="B" />
            <span className={styles.equipoLabel}>Equipo B</span>
          </div>
        </div>

        {goles.length > 0 && (
          <div className={styles.golesGrid}>
            {['A', 'B'].map((equipo) => {
              const golesDelEquipo = goles.filter((gol) => gol.equipo === equipo);
              return (
                <ul key={equipo} className={styles.golesLista}>
                  {golesDelEquipo.map((gol, indice) => (
                    <li key={gol.id || indice} className={styles.golItem}>
                      <FaFutbol className={styles.golIcono} />
                      <p className={styles.golTexto}>
                        <span className={styles.textoBold}>{gol.minuto}&apos;</span>{' '}
                        <span className={styles.textoBold}>{gol.nombre}</span>
                        {gol.enContra && <span className={styles.textoTenue}> (PP)</span>}
                        {gol.asistenciaNombre && (
                          <span className={styles.asistenciaTexto}>asistencia de {gol.asistenciaNombre}</span>
                        )}
                        {partido.beelupUrl && (
                          <button
                            type="button"
                            onClick={() => setGolSeleccionado(gol)}
                            className={styles.verGolBtn}
                          >
                            Ver gol
                          </button>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              );
            })}
          </div>
        )}
      </Panel>

      {jugadorDestacado.jugadores.length > 0 && (
        <div className={styles.mvpWrap}>
          {jugadorDestacado.jugadores.map((jugador) => (
            <span key={jugador.usuarioId} className={styles.mvpItem}>
              <IconoTrofeo />
              MVP: <span className={styles.mvpNombre}>{jugador.nombre}</span>
            </span>
          ))}
        </div>
      )}

      <Panel titulo="Rendimiento de jugadores" className={styles.espaciadoInferior}>
        {rendimientos.length === 0 ? (
          <p className={styles.textoVacio}>Sin cargar.</p>
        ) : (
          <ul className={styles.listaVertical}>
            {rendimientos.map((rendimiento) => (
              <li key={rendimiento.usuarioId} className={styles.rendimientoItem}>
                <span className={styles.rendimientoNombre}>{rendimiento.nombre}</span>
                {rendimiento.votos === 0 ? (
                  <span className={styles.sinVotos}>Sin votos</span>
                ) : (
                  <span className={styles.rendimientoBarraWrap}>
                    <BarraRendimiento puntaje={Math.round(rendimiento.promedio)} />
                    <span className={styles.rendimientoPromedio}>
                      {rendimiento.promedio}/10 ({rendimiento.votos})
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {sanciones.length > 0 && (
        <Panel titulo="Sanciones en cancha">
          <ul className={styles.listaVertical}>
            {sanciones.map((sancion, indice) => (
              <li key={indice} className={styles.sancionItem}>
                <IconoTarjeta />
                <span className={styles.textoBold}>{sancion.nombre}</span>
                <span className={styles.sancionMotivo}>— {sancion.motivo}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ModalVerGol
        abierto={!!golSeleccionado}
        beelupUrl={partido.beelupUrl}
        gol={golSeleccionado}
        onCerrar={() => setGolSeleccionado(null)}
      />
    </div>
  );
}
