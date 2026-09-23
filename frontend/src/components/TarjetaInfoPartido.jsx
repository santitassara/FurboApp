import { formatearFechaPartido } from '../utils/fecha';
import styles from './TarjetaInfoPartido.module.css';

function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(valor);
}

function urlMaps(direccion) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

export default function TarjetaInfoPartido({ partido }) {
  const ocupados = partido.ocupados || { titulares: 0, suplentes: 0 };
  const titularesConfirmados = ocupados.titulares;
  const cupoTitulares = partido.cupoTitulares;
  const porcentaje =
    cupoTitulares > 0 ? Math.min(100, Math.round((titularesConfirmados / cupoTitulares) * 100)) : 0;
  const faltan = Math.max(0, cupoTitulares - titularesConfirmados);
  const esHoy = new Date(partido.fecha).toDateString() === new Date().toDateString();
  const hora = new Date(partido.fecha).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const tieneUbicacion = Boolean(partido.estadio || partido.tipoSuelo || partido.direccion);

  return (
    <div className={styles.tarjeta}>
      <div className={styles.encabezado}>
        <span className={styles.badgeFecha}>
          <span className={styles.puntoVerde} />
          {esHoy ? `Hoy ${hora} hs` : formatearFechaPartido(partido.fecha)}
        </span>
        {partido.numero && (
          <span className={styles.badgeNumero}>
            Fecha #{partido.numero}
          </span>
        )}
      </div>

      <div className={styles.grid}>
        <div className={styles.columna}>
          {(partido.estadio || partido.tipoSuelo) && (
            <div className={styles.filaEstadio}>
              {partido.estadio && <span>🏟️ {partido.estadio}</span>}
              {partido.tipoSuelo && <span className={styles.textoSecundario}>👟 {partido.tipoSuelo}</span>}
            </div>
          )}

          {partido.clima && (
            <div className={styles.filaClima}>
              {partido.clima.disponible ? (
                <span>
                  ☀️ {Math.round(partido.clima.temp)}°C, {partido.clima.descripcion}
                </span>
              ) : (
                <span className={styles.textoDeshabilitado}>Pronóstico no disponible aún</span>
              )}
            </div>
          )}

          <div className={styles.barraContenedor}>
            <div className={styles.barraTexto}>
              <span>
                {titularesConfirmados}/{cupoTitulares} titulares confirmados
              </span>
              {faltan > 0 && <span className={styles.textoSecundario}>Faltan {faltan} para cerrar</span>}
            </div>
            <div className={styles.barraFondo}>
              <div className={styles.barraProgreso} style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.columna}>
          {tieneUbicacion && partido.direccion && (
            <div className={styles.panelUbicacion}>
              <p className={styles.direccionTexto}>📍 {partido.direccion}</p>
              <a
                href={urlMaps(partido.direccion)}
                target="_blank"
                rel="noreferrer"
                className={styles.botonMaps}
              >
                Maps / Waze
              </a>
            </div>
          )}

          {typeof partido.valorCuota === 'number' && (
            <div className={styles.panelCuota}>
              <div>
                <p className={styles.etiquetaCuota}>Cuota x jugador</p>
                <p className={styles.valorCuota}>{formatearMoneda(partido.valorCuota)}</p>
              </div>
              <div className={styles.alineacionDerecha}>
                <p className={styles.etiquetaCuota}>Total</p>
                <p className={styles.valorTotal}>{formatearMoneda(partido.valorCuota * cupoTitulares)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
