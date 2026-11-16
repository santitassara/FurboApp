import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useGrupo } from '../context/GrupoContext';
import { listarPartidosApostables, obtenerSaldo, obtenerSaldoCasa, obtenerCatalogoPremios, comprarPremio } from '../services/apuestasApi';
import PartidoApuestaCard from '../components/PartidoApuestaCard';
import Boton from '../components/Boton';
import ModalCategoriaPremios from '../components/ModalCategoriaPremios';
import styles from './Apostar.module.css';

const ICONOS_CATEGORIA = {
  formacion: '⚽',
  informacion: '👁️',
  social: '👥',
  estetica: '✨',
  apuestas: '🎲',
  rating: '📊',
  exotico: '🎪',
};

const NOMBRES_CATEGORIA = {
  formacion: 'Formaciones',
  informacion: 'Información y Votación',
  social: 'Sociales y Sanciones',
  estetica: 'Personalización y Estética',
  apuestas: 'Ventajas de Apuestas',
  rating: 'Rating y MVP',
  exotico: 'Exóticos / Divertidos',
};

export default function Apostar() {
  const { perfil } = useAuth();
  const { grupoActivo } = useGrupo();
  const navigate = useNavigate();

  const [partidos, setPartidos] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [saldoCasa, setSaldoCasa] = useState(0);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [modalAbierto, setModalAbierto] = useState(false);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);
  const [premiosCategoria, setPremiosCategoria] = useState([]);
  const [modalCargando, setModalCargando] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (!grupoActivo) return;
    setCargando(true);
    setError('');
    try {
      const [partidosData, saldoData, saldoCasaData] = await Promise.all([
        listarPartidosApostables(grupoActivo.id),
        obtenerSaldo(grupoActivo.id),
        obtenerSaldoCasa(grupoActivo.id),
      ]);
      setPartidos(partidosData);
      setSaldo(saldoData.saldo || 0);
      setSaldoCasa(saldoCasaData.saldo || 0);
    } catch (err) {
      setError(err.message || 'Error al cargar los partidos');
    } finally {
      setCargando(false);
    }
  }, [grupoActivo]);

  const cargarCategorias = useCallback(async () => {
    if (!grupoActivo) return;
    setCargandoCategorias(true);
    try {
      const catalogo = await obtenerCatalogoPremios(grupoActivo.id);
      // Agrupar por categoría
      const categoriasMap = {};
      catalogo.forEach(premio => {
        if (!categoriasMap[premio.categoria]) {
          categoriasMap[premio.categoria] = [];
        }
        categoriasMap[premio.categoria].push(premio);
      });
      setCategorias(Object.keys(categoriasMap).sort());
    } catch (err) {
      console.error('Error al cargar categorías:', err);
    } finally {
      setCargandoCategorias(false);
    }
  }, [grupoActivo]);

  useEffect(() => {
    cargarDatos();
    cargarCategorias();
  }, [cargarDatos, cargarCategorias]);

  const handleAbrirCategoria = useCallback(async (categoria) => {
    setCategoriaSeleccionada(categoria);
    setModalCargando(true);
    try {
      const catalogo = await obtenerCatalogoPremios(grupoActivo.id);
      const premios = catalogo.filter(p => p.categoria === categoria);
      setPremiosCategoria(premios);
      setModalAbierto(true);
    } catch (err) {
      console.error('Error al cargar premios:', err);
    } finally {
      setModalCargando(false);
    }
  }, [grupoActivo]);

  const handleComprarPremio = useCallback(async (premioId) => {
    setModalCargando(true);
    try {
      await comprarPremio(grupoActivo.id, premioId);
      // Recargar saldos y datos
      await cargarDatos();
    } catch (err) {
      throw err;
    } finally {
      setModalCargando(false);
    }
  }, [grupoActivo, cargarDatos]);

  const handleCerrarModal = useCallback(() => {
    setModalAbierto(false);
    setCategoriaSeleccionada(null);
    setPremiosCategoria([]);
  }, []);

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
        <div className={styles.saldosContenedor}>
          <div className={styles.saldoContenedor}>
            <span className={styles.saldoEtiqueta}>Saldo</span>
            <span className={styles.saldoValor}>{saldo.toLocaleString()} <span className={styles.saldoUnidad}>pts</span></span>
          </div>
          <div className={styles.casaContenedor}>
            <span className={styles.casaEtiqueta}>Pozo de la casa</span>
            <span className={styles.casaValor}>{saldoCasa.toLocaleString()} <span className={styles.casaUnidad}>pts</span></span>
          </div>
        </div>
      </header>

      <div className={styles.contenidoPrincipal}>
        <main className={styles.panelPartidos}>
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
        </main>

        <aside className={styles.panelPremios}>
          <div className={styles.premiosHeader}>
            <h2 className={styles.premiosTitulo}>Tienda de Premios</h2>
            <p className={styles.premiosSubtitulo}>Canjea tus puntos por ventajas</p>
          </div>

          {cargandoCategorias ? (
            <div className={styles.categoriasCargando}>
              <div className={styles.spinnerChico} />
              <span>Cargando categorías...</span>
            </div>
          ) : categorias.length === 0 ? (
            <p className={styles.sinCategorias}>No hay premios disponibles</p>
          ) : (
            <ul className={styles.listaCategorias}>
              {categorias.map((categoria) => (
                <li key={categoria} className={styles.categoriaItem}>
                  <button
                    className={clsx(styles.categoriaBoton, 'w-full')}
                    onClick={() => handleAbrirCategoria(categoria)}
                    disabled={modalCargando}
                  >
                    <span className={styles.categoriaIcono}>{ICONOS_CATEGORIA[categoria] || '🎁'}</span>
                    <span className={styles.categoriaNombre}>{NOMBRES_CATEGORIA[categoria] || categoria}</span>
                    <span className={styles.categoriaFlecha}>›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <ModalCategoriaPremios
        abierto={modalAbierto}
        onCerrar={handleCerrarModal}
        categoria={categoriaSeleccionada}
        premios={premiosCategoria}
        saldo={saldo}
        cargando={modalCargando}
        onComprar={handleComprarPremio}
      />
    </div>
  );
}