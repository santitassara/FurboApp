import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Boton from '../components/Boton';
import TarjetaJugadorFIFA from '../components/TarjetaJugadorFIFA';
import { POSICIONES } from '../constants/posiciones';
import { RESISTENCIA } from '../constants/resistencia';
import { RITMO_JUEGO } from '../constants/ritmoJuego';

const HABILIDADES = [
  { campo: 'velocidad', etiqueta: 'Velocidad' },
  { campo: 'pegada', etiqueta: 'Pegada' },
  { campo: 'tocaPase', etiqueta: 'Toque/Pase' },
  { campo: 'gambeta', etiqueta: 'Gambeta' },
  { campo: 'marcaDefensa', etiqueta: 'Marca/Defensa' },
  { campo: 'fisico', etiqueta: 'Físico' },
];

export default function Perfil() {
  const { perfil, actualizarMiPerfil } = useAuth();
  const [datos, setDatos] = useState({
    nombreCompleto: perfil?.nombreCompleto || '',
    fechaNacimiento: perfil?.fechaNacimiento ? perfil.fechaNacimiento.slice(0, 10) : '',
    posicionPrincipal: perfil?.posicionPrincipal || '',
    posicionSecundaria: perfil?.posicionSecundaria || '',
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

  async function guardar(evento) {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload = { ...datos };
      for (const { campo } of HABILIDADES) {
        if (tocado[campo] || perfil?.[campo] != null) {
          payload[campo] = Number(datos[campo]);
        } else {
          delete payload[campo];
        }
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-display text-4xl leading-none text-white">Mi Perfil</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex justify-center lg:sticky lg:top-10 lg:h-fit lg:justify-start">
          <TarjetaJugadorFIFA
            nombre={datos.nombreCompleto || perfil?.nombre}
            posicion={datos.posicionPrincipal}
            habilidades={datos}
          />
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-cancha-800/60 p-6">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Nombre completo</label>
          <input
            type="text"
            value={datos.nombreCompleto}
            onChange={(evento) => actualizarCampo('nombreCompleto', evento.target.value)}
            placeholder={perfil?.nombre}
            className="rounded-lg bg-white/10 px-4 py-2 text-white placeholder:text-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Fecha de nacimiento</label>
          <input
            type="date"
            value={datos.fechaNacimiento}
            onChange={(evento) => actualizarCampo('fechaNacimiento', evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-white/50">Posición principal</label>
            <select
              value={datos.posicionPrincipal}
              onChange={(evento) => actualizarCampo('posicionPrincipal', evento.target.value)}
              className="rounded-lg bg-white/10 px-4 py-2 text-white"
            >
              <option value="" disabled className="bg-cancha-800 text-white">
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className="bg-cancha-800 text-white">
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-white/50">Posición secundaria</label>
            <select
              value={datos.posicionSecundaria}
              onChange={(evento) => actualizarCampo('posicionSecundaria', evento.target.value)}
              className="rounded-lg bg-white/10 px-4 py-2 text-white"
            >
              <option value="" disabled className="bg-cancha-800 text-white">
                Elegí una posición
              </option>
              {POSICIONES.map((posicion) => (
                <option key={posicion.valor} value={posicion.valor} className="bg-cancha-800 text-white">
                  {posicion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>
        {posicionesIguales && (
          <p className="text-sm text-sancion">La secundaria tiene que ser distinta de la principal.</p>
        )}
        {posicionesSinElegir && (
          <p className="text-sm text-sancion">Elegí posición principal y secundaria para poder guardar.</p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Resistencia</label>
          <select
            value={datos.resistencia}
            onChange={(evento) => actualizarCampo('resistencia', evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" className="bg-cancha-800 text-white">
              Sin especificar
            </option>
            {RESISTENCIA.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className="bg-cancha-800 text-white">
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase text-white/50">Ritmo de juego</label>
          <select
            value={datos.ritmoJuego}
            onChange={(evento) => actualizarCampo('ritmoJuego', evento.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          >
            <option value="" className="bg-cancha-800 text-white">
              Sin especificar
            </option>
            {RITMO_JUEGO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor} className="bg-cancha-800 text-white">
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-pasto-500">Habilidades</h2>
          {HABILIDADES.map(({ campo, etiqueta }) => (
            <div key={campo} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs uppercase text-white/50">
                <span>{etiqueta}</span>
                <span className="text-white/90">{datos[campo]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={datos[campo]}
                onChange={(evento) => actualizarHabilidad(campo, evento.target.value)}
                className="w-full"
              />
            </div>
          ))}
        </div>

        {error && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{error}</p>}
        {guardado && !error && <p className="text-sm text-pasto-500">Perfil guardado.</p>}

        <Boton type="submit" disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : 'Guardar perfil'}
        </Boton>
        </form>
      </div>
    </div>
  );
}
