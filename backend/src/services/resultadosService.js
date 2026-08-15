const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerElegibles(partidoId) {
  const filas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL`
    )
    .all(partidoId);
  return filas.map((fila) => fila.usuarioId);
}

async function guardarResultado(partidoId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado === 'abierto') throw crearError('El partido todavía no cerró', 400);

  const elegibles = await obtenerElegibles(partidoId);
  if (elegibles.length === 0) {
    throw crearError('Debés guardar la formación antes de cargar el resultado', 400);
  }
  const elegiblesSet = new Set(elegibles);

  const goles = Array.isArray(payload.goles) ? payload.goles : [];
  const rendimientos = Array.isArray(payload.rendimientos) ? payload.rendimientos : [];
  const sanciones = Array.isArray(payload.sanciones) ? payload.sanciones : [];
  const jugadorDestacadoId = payload.jugadorDestacadoId || null;

  for (const gol of goles) {
    if (!elegiblesSet.has(gol.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (gol.equipo !== 'A' && gol.equipo !== 'B') throw crearError('equipo debe ser "A" o "B"', 400);
    if (!Number.isInteger(gol.minuto) || gol.minuto < 0) {
      throw crearError('minuto debe ser un entero mayor o igual a 0', 400);
    }
    if (gol.asistenciaUsuarioId) {
      if (gol.asistenciaUsuarioId === gol.usuarioId) {
        throw crearError('La asistencia no puede ser del mismo jugador que anotó el gol', 400);
      }
      if (!elegiblesSet.has(gol.asistenciaUsuarioId)) {
        throw crearError('Jugador no elegible para el resultado', 400);
      }
    }
  }
  for (const rendimiento of rendimientos) {
    if (!elegiblesSet.has(rendimiento.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (!Number.isInteger(rendimiento.puntaje) || rendimiento.puntaje < 1 || rendimiento.puntaje > 10) {
      throw crearError('puntaje debe ser un entero entre 1 y 10', 400);
    }
  }
  for (const sancion of sanciones) {
    if (!elegiblesSet.has(sancion.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (!sancion.motivo || typeof sancion.motivo !== 'string') {
      throw crearError('motivo es requerido', 400);
    }
  }
  if (jugadorDestacadoId && !elegiblesSet.has(jugadorDestacadoId)) {
    throw crearError('Jugador no elegible para el resultado', 400);
  }

  const guardar = db.transaction(() => {
    db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
    db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
    db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
    db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);

    for (const gol of goles) {
      db.prepare(
        `INSERT INTO Goles (id, partidoId, usuarioId, asistenciaUsuarioId, equipo, minuto)
         VALUES (@id, @partidoId, @usuarioId, @asistenciaUsuarioId, @equipo, @minuto)`
      ).run({
        id: crypto.randomUUID(),
        partidoId,
        usuarioId: gol.usuarioId,
        asistenciaUsuarioId: gol.asistenciaUsuarioId || null,
        equipo: gol.equipo,
        minuto: gol.minuto,
      });
    }
    for (const rendimiento of rendimientos) {
      db.prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, usuarioId, puntaje)
         VALUES (@id, @partidoId, @usuarioId, @puntaje)`
      ).run({ id: crypto.randomUUID(), partidoId, usuarioId: rendimiento.usuarioId, puntaje: rendimiento.puntaje });
    }
    for (const sancion of sanciones) {
      db.prepare(
        `INSERT INTO SancionesPartido (id, partidoId, usuarioId, motivo)
         VALUES (@id, @partidoId, @usuarioId, @motivo)`
      ).run({ id: crypto.randomUUID(), partidoId, usuarioId: sancion.usuarioId, motivo: sancion.motivo });
    }
    db.prepare(
      `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, fechaCarga)
       VALUES (@id, @partidoId, @jugadorDestacadoId, @fechaCarga)`
    ).run({ id: crypto.randomUUID(), partidoId, jugadorDestacadoId, fechaCarga: new Date().toISOString() });
    db.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partidoId);
  });
  guardar();

  return obtenerResultado(partidoId);
}

async function obtenerResultado(partidoId) {
  const resultado = db.prepare('SELECT * FROM Resultados WHERE partidoId = ?').get(partidoId);
  if (!resultado) return null;

  const filasGoles = db.prepare('SELECT * FROM Goles WHERE partidoId = ? ORDER BY minuto ASC').all(partidoId);
  const goles = await Promise.all(
    filasGoles.map(async (gol) => {
      const autor = await usuariosService.obtenerUsuario(gol.usuarioId);
      const asistente = gol.asistenciaUsuarioId
        ? await usuariosService.obtenerUsuario(gol.asistenciaUsuarioId)
        : null;
      return {
        usuarioId: gol.usuarioId,
        nombre: autor?.nombre || 'Jugador',
        equipo: gol.equipo,
        minuto: gol.minuto,
        asistenciaUsuarioId: gol.asistenciaUsuarioId,
        asistenciaNombre: asistente?.nombre || null,
      };
    })
  );

  const marcador = { A: 0, B: 0 };
  for (const gol of filasGoles) marcador[gol.equipo] += 1;

  const filasRendimientos = db.prepare('SELECT * FROM RendimientosJugador WHERE partidoId = ?').all(partidoId);
  const rendimientos = await Promise.all(
    filasRendimientos.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', puntaje: fila.puntaje };
    })
  );

  const filasSanciones = db.prepare('SELECT * FROM SancionesPartido WHERE partidoId = ?').all(partidoId);
  const sanciones = await Promise.all(
    filasSanciones.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', motivo: fila.motivo };
    })
  );

  let jugadorDestacado = null;
  if (resultado.jugadorDestacadoId) {
    const usuario = await usuariosService.obtenerUsuario(resultado.jugadorDestacadoId);
    jugadorDestacado = { usuarioId: resultado.jugadorDestacadoId, nombre: usuario?.nombre || 'Jugador' };
  }

  return { marcador, goles, rendimientos, sanciones, jugadorDestacado, fechaCarga: resultado.fechaCarga };
}

module.exports = { obtenerElegibles, guardarResultado, obtenerResultado };
