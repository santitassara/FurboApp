const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const resultadosService = require('./resultadosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function guardarVotos(partidoId, grupoId, votanteId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'jugado') {
    throw crearError('El partido todavía no tiene resultado cargado', 400);
  }
  if (partido.votacionCerrada) {
    throw crearError('La votación de este partido está cerrada', 400);
  }

  // Quién puede votar: solo usuarios reales (los invitados no tienen login).
  const elegiblesVotantes = await resultadosService.obtenerElegibles(partidoId);
  if (!elegiblesVotantes.includes(votanteId)) {
    throw crearError('No sos elegible para votar en este partido', 403);
  }

  // A quién se puede calificar/votar MVP: usuarios reales + invitados.
  const elegiblesObjetivo = await resultadosService.obtenerElegiblesJugadores(partidoId, grupoId);
  const claveJugador = resultadosService.claveJugador;
  const clavesObjetivo = new Set(elegiblesObjetivo.map((j) => claveJugador(j.usuarioId, j.invitadoId)));

  const valoraciones = Array.isArray(payload.valoraciones) ? payload.valoraciones : [];
  const mvpUsuarioId = payload.mvpUsuarioId || payload.mvpId || null;
  const mvpInvitadoId = payload.mvpInvitadoId || null;

  for (const valoracion of valoraciones) {
    if (!valoracion.usuarioId && !valoracion.invitadoId) {
      throw crearError('Falta indicar el jugador a calificar', 400);
    }
    if (valoracion.usuarioId && valoracion.invitadoId) {
      throw crearError('La calificación no puede tener jugador e invitado a la vez', 400);
    }
    if (!clavesObjetivo.has(claveJugador(valoracion.usuarioId, valoracion.invitadoId))) {
      throw crearError('Jugador no elegible para votar', 400);
    }
    if (valoracion.usuarioId === votanteId) {
      throw crearError('No podés calificarte a vos mismo', 400);
    }
    if (!Number.isInteger(valoracion.puntaje) || valoracion.puntaje < 1 || valoracion.puntaje > 10) {
      throw crearError('puntaje debe ser un entero entre 1 y 10', 400);
    }
  }

  const otrosElegibles = elegiblesObjetivo.filter((j) => j.usuarioId !== votanteId);
  const calificados = new Set(
    valoraciones.map((valoracion) => claveJugador(valoracion.usuarioId, valoracion.invitadoId))
  );
  const faltantes = otrosElegibles.filter((j) => !calificados.has(claveJugador(j.usuarioId, j.invitadoId)));
  if (faltantes.length > 0) {
    throw crearError('Tenés que calificar a todos los jugadores del partido', 400);
  }

  if (mvpUsuarioId && mvpInvitadoId) {
    throw crearError('El MVP no puede tener jugador e invitado a la vez', 400);
  }
  if (mvpUsuarioId || mvpInvitadoId) {
    if (!clavesObjetivo.has(claveJugador(mvpUsuarioId, mvpInvitadoId))) {
      throw crearError('Jugador no elegible para MVP', 400);
    }
    if (mvpUsuarioId === votanteId) throw crearError('No podés elegirte a vos mismo como MVP', 400);
  }

  const guardar = db.transaction(() => {
    for (const valoracion of valoraciones) {
      if (valoracion.usuarioId) {
        db.prepare(
          `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
           VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)
           ON CONFLICT(partidoId, jugadorId, votanteId) WHERE jugadorId IS NOT NULL
           DO UPDATE SET puntaje = excluded.puntaje`
        ).run({
          id: crypto.randomUUID(),
          partidoId,
          jugadorId: valoracion.usuarioId,
          votanteId,
          puntaje: valoracion.puntaje,
        });
      } else {
        db.prepare(
          `INSERT INTO RendimientosJugador (id, partidoId, invitadoId, votanteId, puntaje)
           VALUES (@id, @partidoId, @invitadoId, @votanteId, @puntaje)
           ON CONFLICT(partidoId, invitadoId, votanteId) WHERE invitadoId IS NOT NULL
           DO UPDATE SET puntaje = excluded.puntaje`
        ).run({
          id: crypto.randomUUID(),
          partidoId,
          invitadoId: valoracion.invitadoId,
          votanteId,
          puntaje: valoracion.puntaje,
        });
      }
    }
    if (mvpUsuarioId) {
      db.prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId, invitadoId)
         VALUES (@id, @partidoId, @votanteId, @jugadorId, NULL)
         ON CONFLICT(partidoId, votanteId) DO UPDATE SET jugadorId = excluded.jugadorId, invitadoId = NULL`
      ).run({ id: crypto.randomUUID(), partidoId, votanteId, jugadorId: mvpUsuarioId });
    } else if (mvpInvitadoId) {
      db.prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId, invitadoId)
         VALUES (@id, @partidoId, @votanteId, NULL, @invitadoId)
         ON CONFLICT(partidoId, votanteId) DO UPDATE SET invitadoId = excluded.invitadoId, jugadorId = NULL`
      ).run({ id: crypto.randomUUID(), partidoId, votanteId, invitadoId: mvpInvitadoId });
    }
  });
  guardar();

  return obtenerVotosDeVotante(partidoId, grupoId, votanteId);
}

async function obtenerVotosDeVotante(partidoId, grupoId, votanteId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const valoraciones = db
    .prepare(
      `SELECT jugadorId as usuarioId, invitadoId, puntaje
       FROM RendimientosJugador WHERE partidoId = ? AND votanteId = ?`
    )
    .all(partidoId, votanteId);
  const mvp = db
    .prepare('SELECT jugadorId, invitadoId FROM VotosMvp WHERE partidoId = ? AND votanteId = ?')
    .get(partidoId, votanteId);
  return {
    valoraciones,
    mvpId: mvp ? mvp.jugadorId : null,
    mvpUsuarioId: mvp ? mvp.jugadorId : null,
    mvpInvitadoId: mvp ? mvp.invitadoId : null,
  };
}

module.exports = { guardarVotos, obtenerVotosDeVotante };
