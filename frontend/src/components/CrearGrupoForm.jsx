import { useState } from 'react';
import Boton from './Boton';
import { useGrupo } from '../context/GrupoContext';

export default function CrearGrupoForm() {
  const { crearGrupo, seleccionarGrupo } = useGrupo();
  const [nombre, setNombre] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [grupoCreado, setGrupoCreado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setProcesando(true);
    try {
      const data = await crearGrupo(nombre);
      setGrupoCreado(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(grupoCreado.codigoInvitacion);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  if (grupoCreado) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-cancha-800 p-5">
        <h2 className="text-lg font-bold text-white">¡Grupo creado!</h2>
        <p className="text-sm text-white/70">
          Compartí este código con tus amigos para que se unan a &quot;{grupoCreado.nombre}&quot;:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-lg font-bold tracking-wide text-pasto-500">
            {grupoCreado.codigoInvitacion}
          </code>
          <Boton type="button" variante="ghost" onClick={copiarCodigo}>
            {copiado ? 'Copiado ✓' : 'Copiar'}
          </Boton>
        </div>
        <Boton type="button" onClick={() => seleccionarGrupo(grupoCreado.id)}>
          Continuar
        </Boton>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-cancha-800 p-5">
      <h2 className="text-lg font-bold text-white">Crear un grupo nuevo</h2>
      <label className="flex flex-col gap-1 text-sm text-white/70">
        Nombre del grupo
        <input
          type="text"
          required
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          placeholder="Fútbol de los Jueves"
          className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 text-white"
        />
      </label>
      {error && <p className="text-sm text-sancion">{error}</p>}
      <Boton type="submit" disabled={procesando}>
        {procesando ? 'Creando…' : 'Crear grupo'}
      </Boton>
    </form>
  );
}
