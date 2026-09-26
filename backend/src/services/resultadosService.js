const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');
const invitadosService = require('./invitadosService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// Identidad de un elegible: jugador real o invitado, nunca ambos (mismo criterio
// que inscripcionesService.claveJugador).
function claveJugador(usuarioId, invitadoId) {
  return usuarioId ? `u:${usuarioId}` : `i:${invitadoId}`;
}

// Solo usuarios reales: usado por el motor de rating (que actualiza habilidades
// en Usuarios) y para validar quién puede votar (los invitados no tienen login).
async function obtenerElegibles(partidoId) {
  const filas = db
    .prepare(
      `SELECT usuarioId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL
             AND usuarioId IS NOT NULL`
    )
    .all(partidoId);
  return filas.map((fila) => fila.usuarioId);
}

// Jugadores reales + invitados: usado para validar y mostrar goles, asistencias,
// sanciones y a quién se puede calificar/votar MVP.
async function obtenerElegiblesJugadores(partidoId, grupoId) {
  const filas = db
    .prepare(
      `SELECT usuarioId, invitadoId FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular' AND equipo IS NOT NULL`
    )
    .all(partidoId);
  return Promise.all(
    filas.map(async (fila) => {
      if (fila.usuarioId) {
        const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
        return { usuarioId: fila.usuarioId, invitadoId: null, nombre: usuario?.nombre || 'Jugador' };
      }
      const invitado = invitadosService.obtenerInvitado(grupoId, fila.invitadoId);
      return { usuarioId: null, invitadoId: fila.invitadoId, nombre: invitado?.nombre || 'Jugador' };
    })
  );
}

async function guardarResultado(partidoId, grupoId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado === 'abierto') throw crearError('El partido todavía no cerró', 400);

  const elegiblesObjetivo = await obtenerElegiblesJugadores(partidoId, grupoId);
  const clavesElegibles = new Set(elegiblesObjetivo.map((j) => claveJugador(j.usuarioId, j.invitadoId)));

  const goles = Array.isArray(payload.goles) ? payload.goles : [];
  const sanciones = Array.isArray(payload.sanciones) ? payload.sanciones : [];
  const beelupUrl = typeof payload.beelupUrl === 'string' ? payload.beelupUrl.trim() : '';
  if (beelupUrl && !/^https?:\/\//i.test(beelupUrl)) {
    throw crearError('beelupUrl debe ser una URL válida', 400);
  }

  for (const gol of goles) {
    if (!gol.usuarioId && !gol.invitadoId) throw crearError('Falta indicar el jugador del gol', 400);
    if (gol.usuarioId && gol.invitadoId) throw crearError('El gol no puede tener jugador e invitado a la vez', 400);
    if (!clavesElegibles.has(claveJugador(gol.usuarioId, gol.invitadoId))) {
      throw crearError('Jugador no elegible para el resultado', 400);
    }
    if (gol.equipo !== 'A' && gol.equipo !== 'B') throw crearError('equipo debe ser "A" o "B"', 400);
    if (!Number.isInteger(gol.minuto) || gol.minuto < 0) {
      throw crearError('minuto debe ser un entero mayor o igual a 0', 400);
    }
    if (gol.enContra && (gol.asistenciaUsuarioId || gol.asistenciaInvitadoId)) {
      throw crearError('Un gol en contra no puede tener asistencia', 400);
    }
    if (gol.asistenciaUsuarioId && gol.asistenciaInvitadoId) {
      throw crearError('La asistencia no puede tener jugador e invitado a la vez', 400);
    }
    if (gol.asistenciaUsuarioId || gol.asistenciaInvitadoId) {
      const claveGol = claveJugador(gol.usuarioId, gol.invitadoId);
      const claveAsistencia = claveJugador(gol.asistenciaUsuarioId, gol.asistenciaInvitadoId);
      if (claveAsistencia === claveGol) {
        throw crearError('La asistencia no puede ser del mismo jugador que anotó el gol', 400);
      }
      if (!clavesElegibles.has(claveAsistencia)) {
        throw crearError('Jugador no elegible para el resultado', 400);
      }
    }
  }
  for (const sancion of sanciones) {
    if (!sancion.usuarioId && !sancion.invitadoId) throw crearError('Falta indicar el jugador de la sanción', 400);
    if (sancion.usuarioId && sancion.invitadoId) {
      throw crearError('La sanción no puede tener jugador e invitado a la vez', 400);
    }
    if (!clavesElegibles.has(claveJugador(sancion.usuarioId, sancion.invitadoId))) {
      throw crearError('Jugador no elegible para el resultado', 400);
    }
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
        `INSERT INTO Goles (id, partidoId, usuarioId, invitadoId, asistenciaUsuarioId, asistenciaInvitadoId, equipo, minuto, enContra)
         VALUES (@id, @partidoId, @usuarioId, @invitadoId, @asistenciaUsuarioId, @asistenciaInvitadoId, @equipo, @minuto, @enContra)`
      ).run({
        id: crypto.randomUUID(),
        partidoId,
        usuarioId: gol.usuarioId || null,
        invitadoId: gol.invitadoId || null,
        asistenciaUsuarioId: gol.enContra ? null : gol.asistenciaUsuarioId || null,
        asistenciaInvitadoId: gol.enContra ? null : gol.asistenciaInvitadoId || null,
        equipo: gol.equipo,
        minuto: gol.minuto,
        enContra: gol.enContra ? 1 : 0,
      });
    }
    for (const sancion of sanciones) {
      db.prepare(
        `INSERT INTO SancionesPartido (id, partidoId, usuarioId, invitadoId, motivo)
         VALUES (@id, @partidoId, @usuarioId, @invitadoId, @motivo)`
      ).run({
        id: crypto.randomUUID(),
        partidoId,
        usuarioId: sancion.usuarioId || null,
        invitadoId: sancion.invitadoId || null,
        motivo: sancion.motivo,
      });
    }
    db.prepare(
      `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, fechaCarga)
       VALUES (@id, @partidoId, NULL, @fechaCarga)`
    ).run({ id: crypto.randomUUID(), partidoId, fechaCarga: new Date().toISOString() });
    db.prepare("UPDATE Partidos SET estado = 'jugado', beelupUrl = ? WHERE id = ?").run(
      beelupUrl || null,
      partidoId
    );
  });
  guardar();

  return obtenerResultado(partidoId, grupoId);
}

async function obtenerResultado(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const resultado = db.prepare('SELECT * FROM Resultados WHERE partidoId = ?').get(partidoId);
  if (!resultado) return null;

  // Resuelve el nombre de un jugador real o invitado a partir de cualquiera de
  // los dos ids (uno de los dos siempre viene null).
  async function nombreDe(usuarioId, invitadoId) {
    if (usuarioId) {
      const usuario = await usuariosService.obtenerUsuario(usuarioId);
      return usuario?.nombre || 'Jugador';
    }
    if (invitadoId) {
      const invitado = invitadosService.obtenerInvitado(grupoId, invitadoId);
      return invitado?.nombre || 'Jugador';
    }
    return null;
  }

  const filasGoles = db.prepare('SELECT * FROM Goles WHERE partidoId = ? ORDER BY minuto ASC').all(partidoId);
  const goles = await Promise.all(
    filasGoles.map(async (gol) => {
      const nombre = await nombreDe(gol.usuarioId, gol.invitadoId);
      const asistenciaNombre = await nombreDe(gol.asistenciaUsuarioId, gol.asistenciaInvitadoId);
      return {
        id: gol.id,
        usuarioId: gol.usuarioId,
        invitadoId: gol.invitadoId,
        nombre,
        equipo: gol.equipo,
        minuto: gol.minuto,
        enContra: !!gol.enContra,
        asistenciaUsuarioId: gol.asistenciaUsuarioId,
        asistenciaInvitadoId: gol.asistenciaInvitadoId,
        asistenciaNombre,
      };
    })
  );

  const marcador = { A: 0, B: 0 };
  for (const gol of filasGoles) marcador[gol.equipo] += 1;

  const elegibles = await obtenerElegibles(partidoId);
  const elegiblesObjetivo = await obtenerElegiblesJugadores(partidoId, grupoId);
  const promediosPorJugador = new Map(
    db
      .prepare(
        `SELECT jugadorId, invitadoId, AVG(puntaje) as promedio, COUNT(*) as votos
         FROM RendimientosJugador WHERE partidoId = ? GROUP BY jugadorId, invitadoId`
      )
      .all(partidoId)
      .map((fila) => [claveJugador(fila.jugadorId, fila.invitadoId), fila])
  );
  const rendimientos = elegiblesObjetivo.map((jugador) => {
    const fila = promediosPorJugador.get(claveJugador(jugador.usuarioId, jugador.invitadoId));
    return {
      usuarioId: jugador.usuarioId,
      invitadoId: jugador.invitadoId,
      nombre: jugador.nombre,
      promedio: fila ? Math.round(fila.promedio * 10) / 10 : null,
      votos: fila ? fila.votos : 0,
    };
  });

  const filasSanciones = db.prepare('SELECT * FROM SancionesPartido WHERE partidoId = ?').all(partidoId);
  const sanciones = await Promise.all(
    filasSanciones.map(async (fila) => ({
      usuarioId: fila.usuarioId,
      invitadoId: fila.invitadoId,
      nombre: await nombreDe(fila.usuarioId, fila.invitadoId),
      motivo: fila.motivo,
    }))
  );

  const votosMvp = db
    .prepare(
      `SELECT jugadorId, invitadoId, COUNT(*) as votos FROM VotosMvp
       WHERE partidoId = ? GROUP BY jugadorId, invitadoId ORDER BY votos DESC`
    )
    .all(partidoId);
  const maxVotosMvp = votosMvp.length > 0 ? votosMvp[0].votos : 0;
  const jugadoresDestacados = await Promise.all(
    votosMvp
      .filter((fila) => fila.votos === maxVotosMvp)
      .map(async (fila) => ({
        usuarioId: fila.jugadorId,
        invitadoId: fila.invitadoId,
        nombre: await nombreDe(fila.jugadorId, fila.invitadoId),
      }))
  );
  const jugadorDestacado = {
    jugadores: jugadoresDestacados,
    votos: maxVotosMvp,
    totalElegibles: elegibles.length,
  };

  return {
    marcador,
    goles,
    rendimientos,
    sanciones,
    jugadorDestacado,
    fechaCarga: resultado.fechaCarga,
    votacionCerrada: Boolean(partido.votacionCerrada),
  };
}

function eliminarPorPartido(partidoId) {
  db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM VotosMvp WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
  db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);
}

module.exports = {
  obtenerElegibles,
  obtenerElegiblesJugadores,
  claveJugador,
  guardarResultado,
  obtenerResultado,
  eliminarPorPartido,
};
