import { useRef, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import Boton from '../components/Boton';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';
import RadarHabilidades from '../components/RadarHabilidades';
import { POSICIONES } from '../constants/posiciones';
import { RESISTENCIA } from '../constants/resistencia';
import { RITMO_JUEGO } from '../constants/ritmoJuego';
import { etiquetaPosicion } from '../constants/posiciones';
import { etiquetaResistencia } from '../constants/resistencia';
import { etiquetaRitmoJuego } from '../constants/ritmoJuego';
import { etiquetaPiernaHabil } from '../constants/piernaHabil';
import { SERVER_URL } from '../services/api';
import api from '../services/api';
import clsx from 'clsx';
import styles from './Perfil.module.css';

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

function PerfilDatos({ perfil, grupoActivo }) {
  const [estadisticas, setEstadisticas] = useState(null);
  const [estadisticasTotales, setEstadisticasTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');

    Promise.all([
      grupoActivo ? api.get(`/usuarios/${perfil.uid}/estadisticas/${grupoActivo.id}`) : Promise.resolve(null),
      api.get(`/usuarios/${perfil.uid}/estadisticas`),
    ])
      .then(([statsRes, statsTotalesRes]) => {
        if (activo) {
          if (statsRes) setEstadisticas(statsRes.data);
          setEstadisticasTotales(statsTotalesRes.data);
        }
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [perfil.uid, grupoActivo]);

  const tiles = perfil
    ? [
        { etiqueta: 'Edad', valor: perfil.edad != null ? `${perfil.edad} años` : 'Sin dato' },
        {
          etiqueta: 'Posición',
          valor:
            [etiquetaPosicion(perfil.posicionPrincipal), etiquetaPosicion(perfil.posicionSecundaria)]
              .filter((p) => p !== 'Sin posición')
              .join(' / ') || 'Sin dato',
          ancha: Boolean(perfil.posicionPrincipal && perfil.posicionSecundaria),
        },
        { etiqueta: 'Pierna hábil', valor: etiquetaPiernaHabil(perfil.piernaHabil) },
        { etiqueta: 'Resistencia', valor: etiquetaResistencia(perfil.resistencia) },
        { etiqueta: 'Ritmo de juego', valor: etiquetaRitmoJuego(perfil.ritmoJuego) },
      ]
    : [];

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Mi Perfil</h1>

      {cargando && <p className={styles.cargando}>Cargando…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {perfil && (
        <div className={styles.grid}>
          <div className={styles.tarjetaWrap}>
            <TarjetaJugadorFIFA
              nombre={perfil.nombreCompleto || perfil.nombre}
              posicion={perfil.posicionPrincipal}
              habilidades={perfil}
              fotoUrl={perfil.fotoUrl ? `${SERVER_URL}${perfil.fotoUrl}` : null}
            />
          </div>

          <div className={styles.columnaDerecha}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitulo}>Resumen</h2>
              <div className={styles.tilesGrid}>
                {tiles.map((tile) => (
                  <div
                    key={tile.etiqueta}
                    className={clsx(styles.tile, tile.ancha && styles.tileAncha)}
                  >
                    <p className={styles.tileLabel}>{tile.etiqueta}</p>
                    <p className={styles.tileValor}>{tile.valor}</p>
                  </div>
                ))}
              </div>
            </div>

            {estadisticas && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitulo}>
                  Estadísticas en grupo {grupoActivo?.nombre}
                </h2>
                <div className={styles.tilesGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Partidos Jugados</p>
                    <p className={styles.statValor}>{estadisticas.pj}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Goles</p>
                    <p className={styles.statValor}>{estadisticas.goles}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Asistencias</p>
                    <p className={styles.statValor}>{estadisticas.asistencias}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Valoración</p>
                    <p className={styles.statValor}>{estadisticas.valoracion}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>MVPs</p>
                    <p className={styles.statValor}>{estadisticas.mvps}</p>
                  </div>
                </div>
              </div>
            )}

            {estadisticasTotales && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitulo}>Totales</h2>
                <div className={styles.tilesGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>
                      Goles en grupo {grupoActivo?.nombre}
                    </p>
                    <p className={styles.statValor}>{estadisticas?.goles || 0}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>Goles Totales</p>
                    <p className={styles.statValor}>{estadisticasTotales.goles}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>
                      MVPs en grupo {grupoActivo?.nombre}
                    </p>
                    <p className={styles.statValor}>{estadisticas?.mvps || 0}</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.tileLabel}>MVPs Totales</p>
                    <p className={styles.statValor}>{estadisticasTotales.mvps}</p>
                  </div>
                </div>
              </div>
            )}

            <RadarHabilidades perfil={perfil} />
          </div>
        </div>
      )}
    </div>
  );
}

function PerfilEditar({ perfil, actualizarMiPerfil, subirFotoPerfil }) {
  const inputFotoRef = useRef(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const [datos, setDatos] = useState({
    nombreCompleto: perfil?.nombreCompleto || '',
    fechaNacimiento: perfil?.fechaNacimiento ? perfil.fechaNacimiento.slice(0, 10) : '',
    posicionPrincipal: perfil?.posicionPrincipal || '',
    posicionSecundaria: perfil?.posicionSecundaria || '',
    piernaHabil: perfil?.piernaHabil || '',
    resistencia: perfil?.resistencia || '',
    ritmoJuego: perfil?.ritmoJuego || '',
    velocidad: perfil?.velocidad ?? 50,
    pegada: perfil?.pegada ?? 50,
    tocaPase: perfil?.tocaPase ?? 50,
    gambeta: perfil?.gambeta ?? 50,
    marcaDefensa: perfil?.marcaDefensa ?? 50,
    fisico: perfil?.fisico ?? 50,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  const habilidadesBloqueadas = Boolean(perfil?.habilidadesEditadas);

  const posicionesIguales =
    datos.posicionPrincipal && datos.posicionSecundaria && datos.posicionPrincipal === datos.posicionSecundaria;
  const posicionesSinElegir = !datos.posicionPrincipal || !datos.posicionSecundaria;
  const puedeGuardar = datos.posicionPrincipal && datos.posicionSecundaria && !posicionesIguales && !guardando;

  function actualizarCampo(campo, valor) {
    setDatos((anterior) => ({ ...anterior, [campo]: valor }));
    setGuardado(false);
  }

  function actualizarHabilidad(campo, valor) {
    actualizarCampo(campo, valor);
  }

  async function manejarSeleccionFoto(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    setErrorFoto('');
    setSubiendoFoto(true);
    try {
      await subirFotoPerfil(archivo);
    } catch (err) {
      setErrorFoto(err.message);
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload = { ...datos };
      for (const { campo } of HABILIDADES) {
        const valor = Number(datos[campo]);
        payload[campo] = Number.isNaN(valor) ? 50 : valor;
      }
      await actualizarMiPerfil(payload);
      setGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Mi Perfil</h1>

      <div className={styles.grilla}>
        <div className={styles.columnaFoto}>
          <TarjetaJugadorFIFA
            nombre={datos.nombreCompleto || perfil?.nombre}
            posicion={datos.posicionPrincipal}
            habilidades={datos}
            fotoUrl={perfil?.fotoUrl ? `${SERVER_URL}${perfil.fotoUrl}` : null}
          />
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.inputFotoOculto}
            onChange={manejarSeleccionFoto}
          />
          <Boton type="button" onClick={() => inputFotoRef.current?.click()} disabled={subiendoFoto}>
            {subiendoFoto ? 'Subiendo…' : 'Subir foto'}
          </Boton>
          {errorFoto && <p className={styles.errorFoto}>{errorFoto}</p>}
        </div>

        <form onSubmit={guardar} className={styles.formulario}>
        <div className={styles.campo}>
          <label className={styles.etiqueta}>Nombre completo</label>
          <input
            type="text"
            value={datos.nombreCompleto}
            onChange={(evento) => actualizarCampo('nombreCompleto', evento.target.value)}
            placeholder={perfil?.nombre}
            className={styles.input}
          />
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Fecha de nacimiento</label>
          <input
            type="date"
            value={datos.fechaNacimiento}
            onChange={(evento) => actualizarCampo('fechaNacimiento', evento.target.value)}
            className={styles.inputFecha}
          />
        </div>

        <div className={styles.grillaPosiciones}>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Posición principal</label>
            <select
              value={datos.posicionPrincipal}
              onChange={(evento) => actualizarCampo('posicionPrincipal', evento.target.value)}
              className={styles.select}
            >
              <option value="" disabled className={styles.opcion}>
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className={styles.opcion}>
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Posición secundaria</label>
            <select
              value={datos.posicionSecundaria}
              onChange={(evento) => actualizarCampo('posicionSecundaria', evento.target.value)}
              className={styles.select}
            >
              <option value="" disabled className={styles.opcion}>
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className={styles.opcion}>
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Pierna hábil</label>
          <div className={styles.filaRadios}>
            <label className={styles.labelRadio}>
              <input
                type="radio"
                name="piernaHabil"
                value="diestro"
                checked={datos.piernaHabil === 'diestro'}
                onChange={(evento) => actualizarCampo('piernaHabil', evento.target.value)}
                className={styles.inputRadio}
              />
              <span className={styles.textoRadio}>Diestro</span>
            </label>
            <label className={styles.labelRadio}>
              <input
                type="radio"
                name="piernaHabil"
                value="zurdo"
                checked={datos.piernaHabil === 'zurdo'}
                onChange={(evento) => actualizarCampo('piernaHabil', evento.target.value)}
                className={styles.inputRadio}
              />
              <span className={styles.textoRadio}>Zurdo</span>
            </label>
          </div>
        </div>
        {posicionesIguales && (
          <p className={styles.mensajeError}>La secundaria tiene que ser distinta de la principal.</p>
        )}
        {posicionesSinElegir && (
          <p className={styles.mensajeError}>Elegí posición principal y secundaria para poder guardar.</p>
        )}

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Resistencia</label>
          <select
            value={datos.resistencia}
            onChange={(evento) => actualizarCampo('resistencia', evento.target.value)}
            className={styles.select}
          >
            <option value="" className={styles.opcion}>
              Sin especificar
            </option>
            {RESISTENCIA.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className={styles.opcion}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta}>Ritmo de juego</label>
          <select
            value={datos.ritmoJuego}
            onChange={(evento) => actualizarCampo('ritmoJuego', evento.target.value)}
            className={styles.select}
          >
            <option value="" className={styles.opcion}>
              Sin especificar
            </option>
            {RITMO_JUEGO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className={styles.opcion}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.grupoHabilidades}>
          <h2 className={styles.tituloHabilidades}>Habilidades</h2>
          {habilidadesBloqueadas && (
            <p className={styles.avisoHabilidadesBloqueadas}>
              Ya cargaste tus habilidades una vez, no se pueden volver a editar.
            </p>
          )}
          {HABILIDADES.map(({ campo, etiqueta }) => (
            <div key={campo} className={styles.filaHabilidad}>
              <div className={styles.encabezadoHabilidad}>
                <span>{etiqueta}</span>
                <span className={styles.valorHabilidad}>{datos[campo]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={datos[campo]}
                onChange={(evento) => actualizarHabilidad(campo, evento.target.value)}
                disabled={habilidadesBloqueadas}
                className={styles.sliderHabilidad}
              />
            </div>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {guardado && !error && <p className={styles.exito}>Perfil guardado.</p>}

        <Boton type="submit" disabled={habilidadesBloqueadas || !puedeGuardar}>
          {habilidadesBloqueadas ? 'Perfil guardado' : guardando ? 'Guardando…' : 'Guardar perfil'}
        </Boton>
        </form>
      </div>
    </div>
  );
}

export default function Perfil() {
  const { perfil, actualizarMiPerfil, subirFotoPerfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const [pestanaActiva, setPestanaActiva] = useState('datos');

  return (
    <div className={styles.pagina}>
      <div className={styles.pestanas}>
        <button
          className={clsx(styles.pestana, pestanaActiva === 'datos' && styles.pestanaActiva)}
          onClick={() => setPestanaActiva('datos')}
        >
          Datos
        </button>
        <button
          className={clsx(styles.pestana, pestanaActiva === 'editar' && styles.pestanaActiva)}
          onClick={() => setPestanaActiva('editar')}
        >
          Editar
        </button>
      </div>

      {pestanaActiva === 'datos' && (
        <PerfilDatos perfil={perfil} grupoActivo={grupoActivo} />
      )}
      {pestanaActiva === 'editar' && (
        <PerfilEditar
          perfil={perfil}
          actualizarMiPerfil={actualizarMiPerfil}
          subirFotoPerfil={subirFotoPerfil}
        />
      )}
    </div>
  );
}