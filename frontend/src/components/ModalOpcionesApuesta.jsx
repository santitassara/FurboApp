import { useState, useEffect, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import {
  SELECCIONES_ESTATICAS,
  TIPOS_APUESTA_ETIQUETAS,
  TIPOS_APUESTA_ICONOS,
  esTipoJugador,
  formatearCuota,
  formatearGanancia,
  formatearMonto,
} from '../constants/apuestas';
import Boton from './Boton';
import styles from './ModalOpcionesApuesta.module.css';

export default function ModalOpcionesApuesta({
  abierto,
  onCerrar,
  onConfirmar,
  partido,
  tipo,
  opciones,
  saldo,
  cargando,
}) {
  const { perfil } = useAuth();
  const [seleccion, setSeleccion] = useState(null);
  const [monto, setMonto] = useState('');
  const [error, setError] = useState('');
  const [golesA, setGolesA] = useState('');
  const [golesB, setGolesB] = useState('');

  // Detectar si es exact_score (marcador exacto)
  const esExactScore = tipo === 'exact_score';

  // Resetear estado cuando cambia el tipo o se cierra el modal
  useEffect(() => {
    if (!abierto) {
      setSeleccion(null);
      setMonto('');
      setError('');
      setGolesA('');
      setGolesB('');
    }
  }, [abierto]);

  useEffect(() => {
    if (tipo) {
      setSeleccion(null);
      setMonto('');
      setError('');
      setGolesA('');
      setGolesB('');
    }
  }, [tipo]);

  // Obtener opciones para el tipo actual
  const opcionesTipo = useMemo(() => {
    if (!opciones || !tipo) return [];
    return opciones[tipo] || [];
  }, [opciones, tipo]);

  // Para exact_score, la selección se construye desde los dos inputs
  const seleccionExactScore = useMemo(() => {
    if (!esExactScore) return seleccion;
    if (golesA === '' || golesB === '') return null;
    return `${golesA}-${golesB}`;
  }, [esExactScore, golesA, golesB, seleccion]);

  // La selección final a usar
  const seleccionFinal = esExactScore ? seleccionExactScore : seleccion;

  // Calcular ganancia potencial
  const gananciaPotencial = useMemo(() => {
    if (!seleccionFinal || !monto) return 0;
    const montoNum = parseInt(monto, 10);
    if (isNaN(montoNum) || montoNum <= 0) return 0;

    // Para exact_score, buscar la cuota dinámicamente
    let cuota = 0;
    if (esExactScore) {
      // Calcular cuota usando la misma lógica del backend
      const [gA, gB] = seleccionFinal.split('-').map(Number);
      cuota = calcularCuotaExactScore(gA, gB);
    } else {
      const opcion = opcionesTipo.find((o) => o.valor === seleccionFinal);
      if (!opcion || !opcion.cuota) return 0;
      cuota = opcion.cuota;
    }

    return Math.round(montoNum * cuota);
  }, [seleccionFinal, monto, opcionesTipo, esExactScore]);

  // Validar monto
  const montoValido = useMemo(() => {
    const montoNum = parseInt(monto, 10);
    return !isNaN(montoNum) && montoNum > 0 && montoNum <= saldo;
  }, [monto, saldo]);

  // Validar selección
  const seleccionValida = useMemo(() => {
    if (esExactScore) {
      return golesA !== '' && golesB !== '' && !isNaN(parseInt(golesA, 10)) && !isNaN(parseInt(golesB, 10));
    }
    return seleccion !== null;
  }, [esExactScore, golesA, golesB, seleccion]);

  const puedeApostar = montoValido && seleccionValida && !cargando;

  const handleSeleccion = (valor) => {
    setSeleccion(valor);
    setError('');
  };

  const handleGolesChange = (equipo, valor) => {
    const num = valor.replace(/[^0-9]/g, '');
    if (equipo === 'A') {
      setGolesA(num);
    } else {
      setGolesB(num);
    }
    setError('');
  };

  const handleMontoChange = (e) => {
    const valor = e.target.value.replace(/[^0-9]/g, '');
    setMonto(valor);
    setError('');
  };

  const handleMontoRapido = (cantidad) => {
    const nuevoMonto = Math.min(cantidad, saldo);
    setMonto(String(nuevoMonto));
    setError('');
  };

  const handleConfirmar = () => {
    if (!puedeApostar) return;
    const montoNum = parseInt(monto, 10);
    onConfirmar([
      {
        tipo,
        seleccion: seleccionFinal,
        monto: montoNum,
      },
    ]);
  };

  // Opciones de monto rápido (25%, 50%, 75%, 100% del saldo)
  const montosRapidos = useMemo(() => {
    if (saldo < 10) return [];
    return [25, 50, 75, 100]
      .map((p) => Math.round((saldo * p) / 100))
      .filter((m) => m > 0 && m <= saldo);
  }, [saldo]);

  // Función para calcular cuota exact_score (misma lógica que backend)
  function calcularCuotaExactScore(golesA, golesB) {
    const marcador = `${golesA}-${golesB}`;
    const CUOTAS_EXACT = {
      '0-0': 12.0, '1-0': 7.0, '0-1': 7.0, '2-0': 9.0, '0-2': 9.0, '1-1': 6.0,
      '2-1': 9.0, '1-2': 9.0, '3-0': 15.0, '0-3': 15.0, '3-1': 18.0, '1-3': 18.0,
      '2-2': 12.0, '3-2': 20.0, '2-3': 20.0, '4-0': 25.0, '0-4': 25.0
    };

    if (CUOTAS_EXACT[marcador]) {
      return CUOTAS_EXACT[marcador];
    }

    const totalGoles = golesA + golesB;
    const diffGoles = Math.abs(golesA - golesB);

    let cuotaBase = 6.0;

    if (totalGoles === 0) cuotaBase = 12.0;
    else if (totalGoles === 1) cuotaBase = 7.0;
    else if (totalGoles === 2) {
      if (diffGoles === 0) cuotaBase = 6.0;
      else cuotaBase = 9.0;
    }
    else if (totalGoles === 3) {
      if (diffGoles === 1) cuotaBase = 9.0;
      else cuotaBase = 15.0;
    }
    else if (totalGoles === 4) {
      if (diffGoles === 0) cuotaBase = 12.0;
      else if (diffGoles === 2) cuotaBase = 18.0;
      else cuotaBase = 25.0;
    }
    else {
      cuotaBase = 20.0 * Math.pow(1.5, totalGoles - 5) * (1 + diffGoles * 0.3);
    }

    return Math.round(cuotaBase * 10) / 10;
  }

  if (!abierto || !tipo) return null;

  const esTipoJugadorActual = esTipoJugador(tipo);

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.tituloContenedor}>
            <span className={styles.icono}>{TIPOS_APUESTA_ICONOS[tipo]}</span>
            <h2 className={styles.titulo}>{TIPOS_APUESTA_ETIQUETAS[tipo]}</h2>
          </div>
          <button className={styles.botonCerrar} onClick={onCerrar} disabled={cargando}>
            ✕
          </button>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.contenido}>
          {/* Selector de opciones */}
          <div className={styles.seccion}>
            <label className={styles.label}>Selecciona tu predicción</label>

            {esExactScore ? (
              // Exact score: dos inputs para goles de cada equipo
              <div className={clsx(styles.exactScoreContenedor, 'flex items-center gap-4')}>
                <div className={clsx(styles.exactScoreInputWrapper, 'flex-1')}>
                  <label className={clsx(styles.exactScoreLabel, 'block text-caption text-white/60 mb-2')}>
                    Goles Equipo A
                  </label>
                  <input
                    type="number"
                    className={clsx(styles.exactScoreInput, 'w-full rounded-xl border-2 bg-cancha-900/50 px-4 py-3 text-center text-body-lg font-bold text-white')}
                    value={golesA}
                    onChange={(e) => handleGolesChange('A', e.target.value)}
                    placeholder="0"
                    min="0"
                    max="20"
                    disabled={cargando}
                  />
                </div>
                <span className={clsx(styles.exactScoreSeparador, 'text-title font-bold text-white/50')}>-</span>
                <div className={clsx(styles.exactScoreInputWrapper, 'flex-1')}>
                  <label className={clsx(styles.exactScoreLabel, 'block text-caption text-white/60 mb-2')}>
                    Goles Equipo B
                  </label>
                  <input
                    type="number"
                    className={clsx(styles.exactScoreInput, 'w-full rounded-xl border-2 bg-cancha-900/50 px-4 py-3 text-center text-body-lg font-bold text-white')}
                    value={golesB}
                    onChange={(e) => handleGolesChange('B', e.target.value)}
                    placeholder="0"
                    min="0"
                    max="20"
                    disabled={cargando}
                  />
                </div>
              </div>
            ) : (
              // Otros tipos: grid de opciones
              <>
                <div className={clsx(styles.opcionesGrid, esTipoJugadorActual && styles.opcionesJugadores)}>
                  {opcionesTipo.map((opcion) => (
                    <button
                      key={opcion.valor}
                      className={clsx(styles.opcion, seleccion === opcion.valor && styles.opcionSeleccionada)}
                      onClick={() => handleSeleccion(opcion.valor)}
                      disabled={cargando}
                    >
                      <span className={styles.opcionEtiqueta}>{opcion.etiqueta}</span>
                      <span className={styles.opcionCuota}>{formatearCuota(opcion.cuota)}</span>
                    </button>
                  ))}
                </div>
                {opcionesTipo.length === 0 && (
                  <p className={styles.sinOpciones}>No hay opciones disponibles para este tipo de apuesta</p>
                )}
              </>
            )}
          </div>

          {/* Input de monto */}
          <div className={styles.seccion}>
            <label className={styles.label}>Monto a apostar</label>
            <div className={styles.montoInputContenedor}>
              <span className={styles.montoPrefijo}>pts</span>
              <input
                type="text"
                className={styles.montoInput}
                value={monto}
                onChange={handleMontoChange}
                placeholder="0"
                disabled={cargando}
                maxLength={6}
                autoFocus
              />
            </div>
            <div className={styles.montoInfo}>
              <span>Saldo disponible: <strong>{saldo.toLocaleString()} pts</strong></span>
              {gananciaPotencial > 0 && (
                <span className={styles.gananciaPotencial}>
                  Ganancia potencial: <strong>{formatearGanancia(gananciaPotencial)}</strong> (incluye monto apostado)
                </span>
              )}
            </div>
            {montosRapidos.length > 0 && (
              <div className={styles.montosRapidos}>
                {montosRapidos.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={clsx(styles.botonMontoRapido, parseInt(monto, 10) === m && styles.botonMontoRapidoActivo)}
                    onClick={() => handleMontoRapido(m)}
                    disabled={cargando}
                  >
                    {m.toLocaleString()} pts
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className={styles.footer}>
          <Boton
            variant="secondary"
            onClick={onCerrar}
            disabled={cargando}
          >
            Cancelar
          </Boton>
          <Boton
            variant="primary"
            onClick={handleConfirmar}
            disabled={!puedeApostar || cargando}
            cargando={cargando}
          >
            {cargando ? 'Procesando...' : `Apostar ${montoValido ? formatearMonto(parseInt(monto, 10)) : ''}`}
          </Boton>
        </footer>
      </div>
    </div>
  );
}