import { useEffect, useState } from 'react';
import api from '../services/api';
import { rutaGrupo } from '../utils/rutasGrupo';

export default function InfoGeneralGrupo({ grupoActivo, proximoPartido }) {
  const [cantidadMiembros, setCantidadMiembros] = useState(null);

  useEffect(() => {
    let cancelado = false;
    api
      .get(rutaGrupo(grupoActivo.id, '/miembros'))
      .then(({ data }) => {
        if (!cancelado) setCantidadMiembros(data.length);
      })
      .catch((err) => console.error('Error cargando miembros del grupo:', err.message));
    return () => {
      cancelado = true;
    };
  }, [grupoActivo.id]);

  const ocupados = proximoPartido?.ocupados || { titulares: 0, suplentes: 0 };
  const titularesOcupados = ocupados.titulares;
  const cupoTitulares = proximoPartido?.cupoTitulares || 0;

  return (
    <div className="rounded-xl border border-white/10 bg-cancha-800 p-5 shadow-lg">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
        <span aria-hidden="true">👥</span> {grupoActivo.nombre}
      </h3>
      <div className="flex flex-col gap-2 text-sm text-white/80">
        <p className="flex items-center justify-between">
          <span>Miembros</span>
          <span className="font-bold text-white">{cantidadMiembros ?? '—'}</span>
        </p>
        {proximoPartido ? (
          <p className="flex items-center justify-between">
            <span>Próximo partido</span>
            <span className="font-bold text-pasto-500">
              {titularesOcupados}/{cupoTitulares} titulares
            </span>
          </p>
        ) : (
          <p className="text-white/60">No hay próximo partido programado.</p>
        )}
      </div>
    </div>
  );
}
