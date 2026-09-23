import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import api from '../services/api';
import Boton from './Boton';
import { etiquetaPosicion } from '../constants/posiciones';
import { calcularRating } from './TarjetaJugadorFIFA';
import styles from './ListaJugadores.module.css';

const ABREVIATURA_POSICION = {
  arquero: 'POR',
  defensor: 'DEF',
  mediocampista: 'MED',
  delantero: 'ATA',
};

const ABREVIATURA_PIERNA = {
  diestro: 'D',
  zurdo: 'Z',
};

const COLOR_GRUPO = {
  pasto: styles.colorPasto,
  tarjeta: styles.colorTarjeta,
  gris: styles.colorGris,
};

function hashTexto(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorValoracion(rating) {
  const numero = Number(rating);
  if (numero >= 85) return styles.valoracionAlta;
  if (numero >= 75) return styles.valoracionMedia;
  return styles.valoracionBaja;
}

function FilaJugador({ jugador, accion, onAccion, deshabilitado, grupoId }) {
  const inicial = jugador.nombre?.trim()?.[0]?.toUpperCase() || '?';
  const [rating, setRating] = useState(null);

  useEffect(() => {
    const cargarRating = async () => {
      try {
        const res = await api.get(`/usuarios/${jugador.usuarioId}/perfil`);
        setRating(calcularRating(res.data));
      } catch (err) {
        console.error('Error cargando valoración:', err);
      }
    };
    cargarRating();
  }, [jugador.usuarioId, grupoId]);

  return (
    <li className={styles.fila}>
      <div className={styles.avatar}>
        {inicial}
      </div>
      <div className={styles.infoWrapper}>
        <Link to={`/jugadores/${jugador.usuarioId}`} className={styles.nombreLink}>
          {jugador.nombre}
        </Link>
        <span className={styles.subInfo}>
          {ABREVIATURA_POSICION[jugador.posicionPrincipal] || '-'}
          {jugador.posicionSecundaria && ` / ${ABREVIATURA_POSICION[jugador.posicionSecundaria] || '-'}`}
          {jugador.piernaHabil && ` • ${ABREVIATURA_PIERNA[jugador.piernaHabil] || ''}`}
        </span>
      </div>
      <span className={clsx(styles.valoracion, colorValoracion(rating))}>
        {rating ?? '–'}
      </span>
      {accion && (
        <Boton
          variante={accion === 'sancionar' ? 'peligro' : 'ghost'}
          className={styles.accionBoton}
          onClick={() => onAccion(jugador.usuarioId)}
          disabled={deshabilitado}
        >
          {accion === 'sancionar' ? 'Sancionar' : 'Promover'}
        </Boton>
      )}
    </li>
  );
}

function EncabezadoTabla({ mostrarAccion }) {
  return (
    <div className={styles.encabezado}>
      <span className={styles.colAvatar} />
      <span className={styles.colNombre}>Jugador</span>
      <span className={styles.colValor}>Val</span>
      {mostrarAccion && <span className={styles.colAccion} />}
    </div>
  );
}

function agruparTitulares(titulares, formacion, equiposDefinidos) {
  if (!formacion || !equiposDefinidos) {
    return [{ clave: 'titulares', titulo: 'Titulares', color: 'pasto', jugadores: titulares }];
  }

  const equipoPorUsuario = new Map((formacion.jugadores || []).map((jugador) => [jugador.usuarioId, jugador.equipo]));
  const equipoA = titulares.filter((jugador) => equipoPorUsuario.get(jugador.usuarioId) === 'A');
  const equipoB = titulares.filter((jugador) => equipoPorUsuario.get(jugador.usuarioId) === 'B');
  const sinUbicar = titulares.filter((jugador) => !equipoPorUsuario.get(jugador.usuarioId));

  const grupos = [
    { clave: 'equipoA', titulo: 'Equipo 1', color: 'pasto', jugadores: equipoA },
    { clave: 'equipoB', titulo: 'Equipo 2', color: 'tarjeta', jugadores: equipoB },
  ];
  if (sinUbicar.length > 0) {
    grupos.push({ clave: 'sinUbicar', titulo: 'Sin ubicar', color: 'gris', jugadores: sinUbicar });
  }
  return grupos;
}

export default function ListaJugadores({ jugadores, formacion, equiposDefinidos, onPromover, onSancionar, deshabilitado, grupoId }) {
  const titulares = jugadores.filter((jugador) => jugador.tipo === 'titular');
  const suplentes = jugadores.filter((jugador) => jugador.tipo === 'suplente');
  const gruposTitulares = agruparTitulares(titulares, formacion, equiposDefinidos);

  return (
    <div className={styles.contenedor}>
      <div className={styles.headerBox}>
        <h4 className={styles.headerTitulo}>
          Listado de jugadores ({titulares.length})
        </h4>
      </div>

      {titulares.length === 0 ? (
        <p className={styles.vacio}>Todavía no hay titulares.</p>
      ) : (
        gruposTitulares.map(
          (grupo) =>
            grupo.jugadores.length > 0 && (
              <div key={grupo.clave}>
                <h5 className={clsx(styles.grupoTitulo, COLOR_GRUPO[grupo.color])}>{grupo.titulo}</h5>
                <EncabezadoTabla mostrarAccion={Boolean(onSancionar)} />
                <ul className={styles.lista}>
                  {grupo.jugadores.map((jugador) => (
                    <FilaJugador
                      key={jugador.usuarioId}
                      jugador={jugador}
                      accion={onSancionar ? 'sancionar' : null}
                      onAccion={onSancionar}
                      deshabilitado={deshabilitado}
                      grupoId={grupoId}
                    />
                  ))}
                </ul>
              </div>
            )
        )
      )}

      <div>
        <h5 className={clsx(styles.grupoTitulo, styles.colorAlbiceleste)}>Suplentes</h5>
        {suplentes.length === 0 ? (
          <p className={styles.vacio}>No hay suplentes anotados.</p>
        ) : (
          <>
            <EncabezadoTabla mostrarAccion={Boolean(onPromover)} />
            <ul className={styles.lista}>
              {suplentes.map((jugador) => (
                <FilaJugador
                  key={jugador.usuarioId}
                  jugador={jugador}
                  accion={onPromover ? 'promover' : null}
                  onAccion={onPromover}
                  deshabilitado={deshabilitado}
                  grupoId={grupoId}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
