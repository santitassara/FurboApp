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
  const sanciones = Array.isArray(payload.sanciones) ? payload.sanciones : [];

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
  for (const sancion of sanciones) {
    if (!elegiblesSet.has(sancion.usuarioId)) throw crearError('Jugador no elegible para el resultado', 400);
    if (!sancion.motivo || typeof sancion.motivo !== 'string') {
      throw crearError('motivo es requerido', 400);
    }
  }

  const guardar = db.transaction(() => {
    db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
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
    for (const sancion of sanciones) {
      db.prepare(
        `INSERT INTO SancionesPartido (id, partidoId, usuarioId, motivo)
         VALUES (@id, @partidoId, @usuarioId, @motivo)`
      ).run({ id: crypto.randomUUID(), partidoId, usuarioId: sancion.usuarioId, motivo: sancion.motivo });
    }
    db.prepare(
      `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, fechaCarga)
       VALUES (@id, @partidoId, NULL, @fechaCarga)`
    ).run({ id: crypto.randomUUID(), partidoId, fechaCarga: new Date().toISOString() });
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

  const elegibles = await obtenerElegibles(partidoId);
  const promediosPorJugador = new Map(
    db
      .prepare(
        `SELECT jugadorId, AVG(puntaje) as promedio, COUNT(*) as votos
         FROM RendimientosJugador WHERE partidoId = ? GROUP BY jugadorId`
      )
      .all(partidoId)
      .map((fila) => [fila.jugadorId, fila])
  );
  const rendimientos = await Promise.all(
    elegibles.map(async (jugadorId) => {
      const usuario = await usuariosService.obtenerUsuario(jugadorId);
      const fila = promediosPorJugador.get(jugadorId);
      return {
        usuarioId: jugadorId,
        nombre: usuario?.nombre || 'Jugador',
        promedio: fila ? Math.round(fila.promedio * 10) / 10 : null,
        votos: fila ? fila.votos : 0,
      };
    })
  );

  const filasSanciones = db.prepare('SELECT * FROM SancionesPartido WHERE partidoId = ?').all(partidoId);
  const sanciones = await Promise.all(
    filasSanciones.map(async (fila) => {
      const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
      return { usuarioId: fila.usuarioId, nombre: usuario?.nombre || 'Jugador', motivo: fila.motivo };
    })
  );

  const votosMvp = db
    .prepare(
      `SELECT jugadorId, COUNT(*) as votos FROM VotosMvp WHERE partidoId = ? GROUP BY jugadorId ORDER BY votos DESC`
    )
    .all(partidoId);
  const maxVotosMvp = votosMvp.length > 0 ? votosMvp[0].votos : 0;
  const jugadoresDestacados = await Promise.all(
    votosMvp
      .filter((fila) => fila.votos === maxVotosMvp)
      .map(async (fila) => {
        const usuario = await usuariosService.obtenerUsuario(fila.jugadorId);
        return { usuarioId: fila.jugadorId, nombre: usuario?.nombre || 'Jugador' };
      })
  );
  const jugadorDestacado = {
    jugadores: jugadoresDestacados,
    votos: maxVotosMvp,
    totalElegibles: elegibles.length,
  };

  return { marcador, goles, rendimientos, sanciones, jugadorDestacado, fechaCarga: resultado.fechaCarga };
}

function eliminarPorPartido(partidoId) {
  db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM VotosMvp WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);
}

module.exports = { obtenerElegibles, guardarResultado, obtenerResultado, eliminarPorPartido };
