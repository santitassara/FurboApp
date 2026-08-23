import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Boton from './Boton';
import { etiquetaPosicion } from '../constants/posiciones';

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

function hashTexto(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function estadisticasFalsas(usuarioId) {
  return { pj: 0, goles: 0, asistencias: 0, valoracion: '0.0' };
}

function colorValoracion(valoracion) {
  const numero = Number(valoracion);
  if (numero >= 7.5) return 'bg-pasto-600/30 text-pasto-500';
  if (numero >= 7) return 'bg-tarjeta/20 text-tarjeta';
  return 'bg-white/10 text-white/70';
}

function FilaJugador({ jugador, accion, onAccion, deshabilitado, grupoId }) {
  const inicial = jugador.nombre?.trim()?.[0]?.toUpperCase() || '?';
  const [stats, setStats] = useState({ pj: 0, goles: 0, asistencias: 0, valoracion: '0.0' });

  useEffect(() => {
    if (!grupoId) return;
    const cargarStats = async () => {
      try {
        const token = localStorage.getItem('firebaseToken');
        const res = await axios.get(`/api/usuarios/${jugador.usuarioId}/estadisticas/${grupoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStats(res.data);
      } catch (err) {
        console.error('Error cargando estadísticas:', err);
      }
    };
    cargarStats();
  }, [jugador.usuarioId, grupoId]);

  const { pj, goles, asistencias, valoracion } = stats;

  return (
    <li className="flex flex-col gap-1 rounded-lg px-2 py-2 odd:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cancha-700 text-xs font-bold text-white/90">
          {inicial}
        </div>
        <Link to={`/jugadores/${jugador.usuarioId}`} className="block text-sm font-medium text-white hover:underline flex-1">
          {jugador.nombre}
        </Link>
        {accion && (
          <Boton
            variante={accion === 'sancionar' ? 'peligro' : 'ghost'}
            className="shrink-0 px-2 py-1 text-xs"
            onClick={() => onAccion(jugador.usuarioId)}
            disabled={deshabilitado}
          >
            {accion === 'sancionar' ? 'Sancionar' : 'Promover'}
          </Boton>
        )}
      </div>
      <div className="flex items-center gap-3 pl-11">
        <span className="text-[11px] text-white/50 flex-1">
          {ABREVIATURA_POSICION[jugador.posicionPrincipal] || '-'}
          {jugador.posicionSecundaria && ` / ${ABREVIATURA_POSICION[jugador.posicionSecundaria] || '-'}`}
          {jugador.piernaHabil && ` • ${ABREVIATURA_PIERNA[jugador.piernaHabil] || ''}`}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${colorValoracion(valoracion)}`}>
          {valoracion}
        </span>
      </div>
    </li>
  );
}

function EncabezadoTabla({ mostrarAccion }) {
  return (
    <div className="flex items-center gap-3 px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-white/40">
      <span className="w-8 shrink-0" />
      <span className="min-w-0 flex-1">Jugador</span>
      <span className="w-10 shrink-0 text-center">Val</span>
      {mostrarAccion && <span className="w-16 shrink-0" />}
    </div>
  );
}

function agruparTitulares(titulares, formacion) {
  if (!formacion) {
    return [{ clave: 'titulares', titulo: 'Titulares', color: 'text-pasto-500', jugadores: titulares }];
  }

  const equipoPorUsuario = new Map((formacion.jugadores || []).map((jugador) => [jugador.usuarioId, jugador.equipo]));
  const equipoA = titulares.filter((jugador) => equipoPorUsuario.get(jugador.usuarioId) === 'A');
  const equipoB = titulares.filter((jugador) => equipoPorUsuario.get(jugador.usuarioId) === 'B');
  const sinUbicar = titulares.filter((jugador) => !equipoPorUsuario.get(jugador.usuarioId));

  const grupos = [
    { clave: 'equipoA', titulo: 'Equipo 1', color: 'text-pasto-500', jugadores: equipoA },
    { clave: 'equipoB', titulo: 'Equipo 2', color: 'text-tarjeta', jugadores: equipoB },
  ];
  if (sinUbicar.length > 0) {
    grupos.push({ clave: 'sinUbicar', titulo: 'Sin ubicar', color: 'text-white/50', jugadores: sinUbicar });
  }
  return grupos;
}

export default function ListaJugadores({ jugadores, formacion, onPromover, onSancionar, deshabilitado, grupoId }) {
  const titulares = jugadores.filter((jugador) => jugador.tipo === 'titular');
  const suplentes = jugadores.filter((jugador) => jugador.tipo === 'suplente');
  const gruposTitulares = agruparTitulares(titulares, formacion);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-cancha-700 px-3 py-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-white">
          Listado de jugadores ({jugadores.length})
        </h4>
      </div>

      {titulares.length === 0 ? (
        <p className="px-2 text-sm text-white/50">Todavía no hay titulares.</p>
      ) : (
        gruposTitulares.map(
          (grupo) =>
            grupo.jugadores.length > 0 && (
              <div key={grupo.clave}>
                <h5 className={`mb-1 px-2 text-xs font-bold uppercase tracking-wide ${grupo.color}`}>{grupo.titulo}</h5>
                <EncabezadoTabla mostrarAccion={Boolean(onSancionar)} />
                <ul className="flex flex-col">
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
        <h5 className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-albiceleste">Suplentes</h5>
        {suplentes.length === 0 ? (
          <p className="px-2 text-sm text-white/50">No hay suplentes anotados.</p>
        ) : (
          <>
            <EncabezadoTabla mostrarAccion={Boolean(onPromover)} />
            <ul className="flex flex-col">
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
