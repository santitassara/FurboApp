import { useState } from 'react';
import Boton from './Boton';
import { useGrupo } from '../context/GrupoContext';

export default function UnirseGrupoForm() {
  const { unirseAGrupo } = useGrupo();
  const [codigo, setCodigo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setProcesando(true);
    try {
      await unirseAGrupo(codigo);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-cancha-800 p-5">
      <h2 className="text-lg font-bold text-white">Unirme a un grupo</h2>
      <label className="flex flex-col gap-1 text-sm text-white/70">
        Código de invitación
        <input
          type="text"
          required
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          placeholder="JUEVES-A1B2"
          className="rounded-lg border border-white/20 bg-cancha-900 px-3 py-2 uppercase text-white"
        />
      </label>
      {error && <p className="text-sm text-sancion">{error}</p>}
      <Boton type="submit" disabled={procesando}>
        {procesando ? 'Uniéndome…' : 'Unirme'}
      </Boton>
    </form>
  );
}
