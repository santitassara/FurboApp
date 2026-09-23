import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Boton from '../components/Boton';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';
import { POSICIONES } from '../constants/posiciones';
import { RESISTENCIA } from '../constants/resistencia';
import { RITMO_JUEGO } from '../constants/ritmoJuego';
import { SERVER_URL } from '../services/api';
import styles from './Perfil.module.css';

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

export default function Perfil() {
  const { perfil, actualizarMiPerfil, subirFotoPerfil } = useAuth();
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
  const [tocado, setTocado] = useState({
    velocidad: false,
    pegada: false,
    tocaPase: false,
    gambeta: false,
    marcaDefensa: false,
    fisico: false,
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
    setTocado((anterior) => ({ ...anterior, [campo]: true }));
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
