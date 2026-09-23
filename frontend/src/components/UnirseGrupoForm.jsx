import { useState } from 'react';
import Boton from './Boton';
import { useGrupo } from '../context/GrupoContext';
import styles from './UnirseGrupoForm.module.css';

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
    <form onSubmit={enviar} className={styles.form}>
      <h2 className={styles.titulo}>Unirme a un grupo</h2>
      <label className={styles.label}>
        Código de invitación
        <input
          type="text"
          required
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          placeholder="JUEVES-A1B2"
          className={styles.input}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <Boton type="submit" disabled={procesando}>
        {procesando ? 'Uniéndome…' : 'Unirme'}
      </Boton>
    </form>
  );
}
