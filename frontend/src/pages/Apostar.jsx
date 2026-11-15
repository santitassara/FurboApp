import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { listarPartidosApostables, obtenerSaldo } from '../services/apuestasApi';
import PartidoApuestaCard from '../components/PartidoApuestaCard';
import Boton from '../components/Boton';
import styles from './Apostar.module.css';

export default function Apostar() {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const navigate = useNavigate();

  const [partidos, setPartidos] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarDatos = useCallback(async () => {
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      const [partidosData, saldoData] = await Promise.all([
        listarPartidosApostables(grupoActivo.id),
        obtenerSaldo(grupoActivo.id),
      ]);
      setPartidos(partidosData);
      setSaldo(saldoData.saldo || 0);
    } catch (err) {
      setError(err.message || 'Error al cargar los partidos');
    } finally {
      setCargando(false);
    }
  }, [grupoActivo]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  if (cargando) {
    return (
      <div className={styles.contenedorCargando}>
        <div className={styles.spinner} />
        <p className={styles.cargandoTexto}>Cargando partidos disponibles...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.contenedorError}>
        <p className={styles.mensajeError}>{error}</p>
        <Boton variante="primario" onClick={cargarDatos}>
          Reintentar
        </Boton>
      </div>
    );
  }

  return (
    <div className={clsx(styles.apostar, 'pageEnter')}>
      <header className={styles.header}>
        <div className={styles.headerIzquierda}>
          <h1 className={styles.titulo}>Apuestas</h1>
          <p className={styles.subtitulo}>Partidos disponibles para apostar</p>
        </div>
        <div className={styles.saldoContenedor}>
          <span className={styles.saldoEtiqueta}>Saldo</span>
          <span className={styles.saldoValor}>{saldo.toLocaleString()} <span className={styles.saldoUnidad}>pts</span></span>
        </div>
      </header>

      {partidos.length === 0 ? (
        <div className={styles.sinPartidos}>
          <div className={styles.sinPartidosIcono}>🎯</div>
          <p className={styles.sinPartidosTitulo}>No hay partidos disponibles</p>
          <p className={styles.sinPartidosDescripcion}>
            Los partidos aparecen aquí cuando la votación de equipos está cerrada y se han definido las formaciones.
          </p>
        </div>
      ) : (
        <div className={styles.listaPartidos}>
          {partidos.map((partido) => (
            <PartidoApuestaCard
              key={partido.id}
              partido={partido}
              saldo={saldo}
              onApuestaCreada={cargarDatos}
            />
          ))}
        </div>
      )}
    </div>
  );
}