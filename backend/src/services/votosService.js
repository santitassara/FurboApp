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

  const elegibles = await resultadosService.obtenerElegibles(partidoId);
  const elegiblesSet = new Set(elegibles);
  if (!elegiblesSet.has(votanteId)) {
    throw crearError('No sos elegible para votar en este partido', 403);
  }

  const valoraciones = Array.isArray(payload.valoraciones) ? payload.valoraciones : [];
  const mvpId = payload.mvpId || null;

  for (const valoracion of valoraciones) {
    if (!elegiblesSet.has(valoracion.jugadorId)) {
      throw crearError('Jugador no elegible para votar', 400);
    }
    if (valoracion.jugadorId === votanteId) {
      throw crearError('No podés calificarte a vos mismo', 400);
    }
    if (!Number.isInteger(valoracion.puntaje) || valoracion.puntaje < 1 || valoracion.puntaje > 10) {
      throw crearError('puntaje debe ser un entero entre 1 y 10', 400);
    }
  }
  if (mvpId) {
    if (!elegiblesSet.has(mvpId)) throw crearError('Jugador no elegible para MVP', 400);
    if (mvpId === votanteId) throw crearError('No podés elegirte a vos mismo como MVP', 400);
  }

  const guardar = db.transaction(() => {
    for (const valoracion of valoraciones) {
      db.prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
         VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)
         ON CONFLICT(partidoId, jugadorId, votanteId) DO UPDATE SET puntaje = excluded.puntaje`
      ).run({
        id: crypto.randomUUID(),
        partidoId,
        jugadorId: valoracion.jugadorId,
        votanteId,
        puntaje: valoracion.puntaje,
      });
    }
    if (mvpId) {
      db.prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId)
         VALUES (@id, @partidoId, @votanteId, @jugadorId)
         ON CONFLICT(partidoId, votanteId) DO UPDATE SET jugadorId = excluded.jugadorId`
      ).run({ id: crypto.randomUUID(), partidoId, votanteId, jugadorId: mvpId });
    }
  });
  guardar();

  return obtenerVotosDeVotante(partidoId, grupoId, votanteId);
}

async function obtenerVotosDeVotante(partidoId, grupoId, votanteId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const valoraciones = db
    .prepare('SELECT jugadorId, puntaje FROM RendimientosJugador WHERE partidoId = ? AND votanteId = ?')
    .all(partidoId, votanteId);
  const mvp = db
    .prepare('SELECT jugadorId FROM VotosMvp WHERE partidoId = ? AND votanteId = ?')
    .get(partidoId, votanteId);
  return { valoraciones, mvpId: mvp ? mvp.jugadorId : null };
}

module.exports = { guardarVotos, obtenerVotosDeVotante };
