import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Boton from './Boton';
import { useGrupo } from '../context/GrupoContext';
import styles from './CrearGrupoForm.module.css';

export default function CrearGrupoForm() {
  const navigate = useNavigate();
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
      <div className={styles.card}>
        <h2 className={styles.titulo}>¡Grupo creado!</h2>
        <p className={styles.descripcion}>
          Compartí este código con tus amigos para que se unan a &quot;{grupoCreado.nombre}&quot;:
        </p>
        <div className={styles.codigoFila}>
          <code className={styles.codigoTexto}>
            {grupoCreado.codigoInvitacion}
          </code>
          <Boton type="button" variante="ghost" onClick={copiarCodigo}>
            {copiado ? 'Copiado ✓' : 'Copiar'}
          </Boton>
        </div>
        <Boton type="button" onClick={() => {
          seleccionarGrupo(grupoCreado.id);
          navigate('/inicio');
        }}>
          Continuar
        </Boton>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className={styles.card}>
      <h2 className={styles.titulo}>Crear un grupo nuevo</h2>
      <label className={styles.label}>
        Nombre del grupo
        <input
          type="text"
          required
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          placeholder="Fútbol de los Jueves"
          className={styles.input}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <Boton type="submit" disabled={procesando}>
        {procesando ? 'Creando…' : 'Crear grupo'}
      </Boton>
    </form>
  );
}
