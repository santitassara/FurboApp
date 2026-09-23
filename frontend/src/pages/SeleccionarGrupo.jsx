import { useNavigate } from 'react-router-dom';
import CrearGrupoForm from '../components/CrearGrupoForm';
import UnirseGrupoForm from '../components/UnirseGrupoForm';
import Boton from '../components/Boton';
import { useGrupo } from '../context/GrupoContext';
import styles from './SeleccionarGrupo.module.css';

export default function SeleccionarGrupo() {
  const navigate = useNavigate();
  const { errorGrupos } = useGrupo();

  return (
    <div className={styles.contenedor}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>Elegí tu grupo</h1>
          <p className={styles.subtitulo}>Creá un grupo nuevo o unite a uno con un código de invitación.</p>
        </div>
        <Boton variante="ghost" onClick={() => navigate('/inicio')}>
          Volver
        </Boton>
      </header>
      {errorGrupos && <p className={styles.error}>{errorGrupos}</p>}
      <CrearGrupoForm />
      <UnirseGrupoForm />
    </div>
  );
}
