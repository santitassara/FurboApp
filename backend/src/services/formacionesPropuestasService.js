const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');
const notificacionesService = require('./notificacionesService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function contarTitularesActivos(partidoId) {
  return db
    .prepare(`SELECT COUNT(*) AS total FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`)
    .get(partidoId).total;
}

function listarTitularesConAsiento(partidoId) {
  return db
    .prepare(
      `SELECT usuarioId, equipo, linea, ordenLinea, lado FROM Inscripciones
       WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`
    )
    .all(partidoId);
}

function siguienteNumeroLibre(partidoId) {
  const usados = new Set(
    db.prepare('SELECT numero FROM FormacionesPropuestas WHERE partidoId = ?').all(partidoId).map((f) => f.numero)
  );
  for (let numero = 1; numero <= 5; numero += 1) {
    if (!usados.has(numero)) return numero;
  }
  return null;
}

async function crearPropuesta(partidoId, grupoId, creadoPor) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const titulares = listarTitularesConAsiento(partidoId);
  if (titulares.length < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }
  if (titulares.some((titular) => !titular.equipo)) {
    throw crearError('Armá la formación en el mapa antes de proponerla para votación', 400);
  }

  const numero = siguienteNumeroLibre(partidoId);
  if (numero === null) throw crearError('Ya hay 5 propuestas para este partido', 400);

  const propuestaId = crypto.randomUUID();
  const crear = db.transaction(() => {
    db.prepare(
      `INSERT INTO FormacionesPropuestas (id, partidoId, numero, creadoPor, fechaCreacion)
       VALUES (@id, @partidoId, @numero, @creadoPor, @fechaCreacion)`
    ).run({ id: propuestaId, partidoId, numero, creadoPor, fechaCreacion: new Date().toISOString() });

    for (const titular of titulares) {
      db.prepare(
        `INSERT INTO FormacionesPropuestasDetalle (id, propuestaId, usuarioId, equipo, linea, ordenLinea, lado)
         VALUES (@id, @propuestaId, @usuarioId, @equipo, @linea, @ordenLinea, @lado)`
      ).run({ id: crypto.randomUUID(), propuestaId, ...titular });
    }
  });
  crear();

  if (numero === 5) {
    notificacionesService.enviarNotificacionVotacionAbierta(partidoId).catch((error) => {
      console.error('Error enviando notificación de votación abierta:', error.message);
    });
  }
}

async function listarPropuestas(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const propuestas = db
    .prepare('SELECT id, numero FROM FormacionesPropuestas WHERE partidoId = ? ORDER BY numero ASC')
    .all(partidoId);

  const propuestasConDetalle = await Promise.all(
    propuestas.map(async (propuesta) => {
      const detalle = db
        .prepare('SELECT usuarioId, equipo, linea, ordenLinea, lado FROM FormacionesPropuestasDetalle WHERE propuestaId = ?')
        .all(propuesta.id);
      const conNombre = await Promise.all(
        detalle.map(async (fila) => {
          const usuario = await usuariosService.obtenerUsuario(fila.usuarioId);
          return { ...fila, nombre: usuario?.nombre || 'Jugador', posicionPrincipal: usuario?.posicionPrincipal || null };
        })
      );
      const votos = db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE propuestaId = ?').get(propuesta.id).total;
      return {
        id: propuesta.id,
        numero: propuesta.numero,
        votos,
        equipoA: conNombre.filter((jugador) => jugador.equipo === 'A'),
        equipoB: conNombre.filter((jugador) => jugador.equipo === 'B'),
      };
    })
  );

  const titularesActivos = new Set(listarTitularesConAsiento(partidoId).map((t) => t.usuarioId));
  let miVoto = null;
  if (titularesActivos.has(usuarioId)) {
    const fila = db.prepare('SELECT propuestaId FROM VotosFormacion WHERE partidoId = ? AND usuarioId = ?').get(partidoId, usuarioId);
    miVoto = fila ? fila.propuestaId : null;
  }

  return {
    votacionEquiposCerrada: Boolean(partido.votacionEquiposCerrada),
    propuestaGanadoraId: partido.propuestaGanadoraId || null,
    miVoto,
    propuestas: propuestasConDetalle,
  };
}

async function eliminarPropuestaAdmin(partidoId, grupoId, propuestaId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  // Check if propuesta belongs to this partido BEFORE transaction
  const propuesta = db.prepare('SELECT id FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').get(propuestaId, partidoId);
  if (!propuesta) throw crearError('Propuesta no encontrada', 404);

  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM VotosFormacion WHERE propuestaId = ?').run(propuestaId);
    db.prepare('DELETE FROM FormacionesPropuestasDetalle WHERE propuestaId = ?').run(propuestaId);
    db.prepare('DELETE FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').run(propuestaId, partidoId);
  });
  borrar();
}

function elegirGanadora(partidoId) {
  const filas = db
    .prepare(
      `SELECT p.id, p.numero, COUNT(v.id) AS votos
       FROM FormacionesPropuestas p
       LEFT JOIN VotosFormacion v ON v.propuestaId = p.id
       WHERE p.partidoId = ?
       GROUP BY p.id
       ORDER BY votos DESC, p.numero ASC`
    )
    .all(partidoId);
  return filas[0] || null;
}

function aplicarGanadora(partidoId, ganadoraId) {
  const detalle = db
    .prepare('SELECT usuarioId, equipo, linea, ordenLinea, lado FROM FormacionesPropuestasDetalle WHERE propuestaId = ?')
    .all(ganadoraId);

  const cerrar = db.transaction(() => {
    for (const asiento of detalle) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea, lado = @lado
         WHERE partidoId = @partidoId AND usuarioId = @usuarioId AND estado = 'anotado'`
      ).run({ ...asiento, partidoId });
    }
    db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 1, propuestaGanadoraId = ? WHERE id = ?').run(ganadoraId, partidoId);
  });
  cerrar();

  notificacionesService.enviarNotificacionVotacionCerrada(partidoId).catch((error) => {
    console.error('Error enviando notificación de votación cerrada:', error.message);
  });
}

async function votar(partidoId, grupoId, propuestaId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const propuesta = db.prepare('SELECT id FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').get(propuestaId, partidoId);
  if (!propuesta) throw crearError('Propuesta no encontrada', 404);

  const esTitular = listarTitularesConAsiento(partidoId).some((titular) => titular.usuarioId === usuarioId);
  if (!esTitular) throw crearError('Solo los titulares pueden votar', 403);

  db.prepare(
    `INSERT INTO VotosFormacion (id, partidoId, usuarioId, propuestaId, fecha)
     VALUES (@id, @partidoId, @usuarioId, @propuestaId, @fecha)
     ON CONFLICT(partidoId, usuarioId) DO UPDATE SET propuestaId = excluded.propuestaId, fecha = excluded.fecha`
  ).run({ id: crypto.randomUUID(), partidoId, usuarioId, propuestaId, fecha: new Date().toISOString() });

  const totalVotos = db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE partidoId = ?').get(partidoId).total;
  if (totalVotos >= contarTitularesActivos(partidoId)) {
    const ganadora = elegirGanadora(partidoId);
    aplicarGanadora(partidoId, ganadora.id);
  }
}

async function cerrarManual(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const ganadora = elegirGanadora(partidoId);
  if (!ganadora) throw crearError('No hay propuestas para determinar una ganadora', 400);
  aplicarGanadora(partidoId, ganadora.id);
}

async function reiniciarVotacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (!partido.votacionEquiposCerrada) throw crearError('La votación de equipos no está cerrada', 400);

  borrarPropuestasYVotos(partidoId);
  db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 0, propuestaGanadoraId = NULL WHERE id = ?').run(partidoId);
}

function borrarPropuestasYVotos(partidoId) {
  const propuestas = db.prepare('SELECT id FROM FormacionesPropuestas WHERE partidoId = ?').all(partidoId);
  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM VotosFormacion WHERE partidoId = ?').run(partidoId);
    for (const propuesta of propuestas) {
      db.prepare('DELETE FROM FormacionesPropuestasDetalle WHERE propuestaId = ?').run(propuesta.id);
    }
    db.prepare('DELETE FROM FormacionesPropuestas WHERE partidoId = ?').run(partidoId);
  });
  borrar();
}

function manejarBajaDeTitular(partidoId) {
  const partido = db.prepare('SELECT votacionEquiposCerrada FROM Partidos WHERE id = ?').get(partidoId);
  if (!partido) return;
  borrarPropuestasYVotos(partidoId);
  if (partido.votacionEquiposCerrada) {
    db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 0, propuestaGanadoraId = NULL WHERE id = ?').run(partidoId);
  }
}

function eliminarPorPartido(partidoId) {
  borrarPropuestasYVotos(partidoId);
}

module.exports = {
  crearPropuesta,
  listarPropuestas,
  eliminarPropuestaAdmin,
  votar,
  cerrarManual,
  reiniciarVotacion,
  manejarBajaDeTitular,
  eliminarPorPartido,
};
