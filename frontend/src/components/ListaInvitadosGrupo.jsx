import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import api from '../services/api';
import Boton from './Boton';
import ModalPosicion from './ModalPosicion';
import FormularioInvitado from './FormularioInvitado';
import { etiquetaPosicion } from '../constants/posiciones';
import { calcularRating } from './TarjetaJugadorFIFA';
import { rutaGrupo } from '../utils/rutasGrupo';
import styles from './ListaInvitadosGrupo.module.css';

const ETIQUETA_ESTADO = {
  pendiente: 'Pendiente de aprobación',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export default function ListaInvitadosGrupo({ grupoId, esAdmin, partidoActivo, inscripcionesPartidoActivo, onCambio }) {
  const [invitados, setInvitados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [invitadoParaAnotar, setInvitadoParaAnotar] = useState(null);

  const cargarInvitados = useCallback(async () => {
    if (!grupoId) return;
    setError('');
    try {
      const { data } = await api.get(rutaGrupo(grupoId, '/invitados'));
      setInvitados(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [grupoId]);

  useEffect(() => {
    cargarInvitados();
  }, [cargarInvitados]);

  function inscripcionEnPartidoActivo(invitadoId) {
    return (inscripcionesPartidoActivo || []).find(
      (inscripcion) => inscripcion.invitadoId === invitadoId
    ) || null;
  }

  async function resolver(invitadoId, accion) {
    setError('');
    setProcesandoId(invitadoId);
    try {
      await api.post(rutaGrupo(grupoId, `/invitados/${invitadoId}/${accion}`));
      await cargarInvitados();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function anotar(posicionPrincipal, posicionSecundaria) {
    setError('');
    setProcesandoId(invitadoParaAnotar);
    try {
      await api.post(
        rutaGrupo(grupoId, `/partidos/${partidoActivo.id}/invitados/${invitadoParaAnotar}/anotar`),
        { posicionPrincipal, posicionSecundaria }
      );
      setInvitadoParaAnotar(null);
      await onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function bajar(invitadoId) {
    setError('');
    setProcesandoId(invitadoId);
    try {
      await api.post(rutaGrupo(grupoId, `/partidos/${partidoActivo.id}/invitados/${invitadoId}/bajar`));
      await onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  if (cargando) return null;

  const invitadoActivo = invitados.find((invitado) => invitado.id === invitadoParaAnotar) || null;

  return (
    <div className={styles.contenedor}>
      <div className={styles.header}>
        <h2 className={styles.titulo}>Invitados</h2>
        {!mostrarFormulario && (
          <Boton variante="ghost" className={styles.botonChico} onClick={() => setMostrarFormulario(true)}>
            + Proponer invitado
          </Boton>
        )}
      </div>

      {mostrarFormulario && (
        <FormularioInvitado
          grupoId={grupoId}
          onCancelar={() => setMostrarFormulario(false)}
          onCreado={() => {
            setMostrarFormulario(false);
            cargarInvitados();
          }}
        />
      )}

      {error && <p className={styles.mensajeError}>{error}</p>}

      {invitados.length === 0 ? (
        <p className={styles.vacio}>Todavía no hay invitados cargados en este grupo.</p>
      ) : (
        <ul className={styles.lista}>
          {invitados.map((invitado) => {
            const rating = calcularRating(invitado);
            const inscripcionActiva = inscripcionEnPartidoActivo(invitado.id);
            const procesando = procesandoId === invitado.id;

            return (
              <li key={invitado.id} className={styles.fila}>
                <div className={styles.infoWrapper}>
                  <span className={styles.nombre}>{invitado.nombre}</span>
                  <span className={styles.subInfo}>
                    {etiquetaPosicion(invitado.posicionPrincipal)}
                    {invitado.posicionSecundaria && ` / ${etiquetaPosicion(invitado.posicionSecundaria)}`}
                    {' • '}
                    Val. {rating ?? '–'}
                  </span>
                  <span className={clsx(styles.estado, styles[`estado_${invitado.estado}`])}>
                    {ETIQUETA_ESTADO[invitado.estado]}
                  </span>
                </div>

                <div className={styles.acciones}>
                  {esAdmin && invitado.estado === 'pendiente' && (
                    <>
                      <Boton
                        variante="primario"
                        className={styles.botonChico}
                        onClick={() => resolver(invitado.id, 'aprobar')}
                        disabled={procesando}
                      >
                        Aprobar
                      </Boton>
                      <Boton
                        variante="peligro"
                        className={styles.botonChico}
                        onClick={() => resolver(invitado.id, 'rechazar')}
                        disabled={procesando}
                      >
                        Rechazar
                      </Boton>
                    </>
                  )}

                  {invitado.estado === 'aprobado' && partidoActivo && (
                    inscripcionActiva ? (
                      <Boton
                        variante="ghost"
                        className={styles.botonChico}
                        onClick={() => bajar(invitado.id)}
                        disabled={procesando}
                      >
                        {procesando ? 'Procesando…' : 'Dar de baja del partido'}
                      </Boton>
                    ) : (
                      <Boton
                        variante="ghost"
                        className={styles.botonChico}
                        onClick={() => setInvitadoParaAnotar(invitado.id)}
                        disabled={procesando}
                      >
                        Anotar al próximo partido
                      </Boton>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ModalPosicion
        abierto={Boolean(invitadoActivo)}
        procesando={procesandoId === invitadoActivo?.id}
        permitirCancelar
        posicionPrincipalInicial={invitadoActivo?.posicionPrincipal}
        posicionSecundariaInicial={invitadoActivo?.posicionSecundaria}
        error={error}
        onConfirmar={anotar}
        onCancelar={() => setInvitadoParaAnotar(null)}
      />
    </div>
  );
}
