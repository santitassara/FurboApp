const crypto = require('node:crypto');
const { db } = require('../config/db');
const partidosService = require('./partidosService');
const usuariosService = require('./usuariosService');
const invitadosService = require('./invitadosService');
const notificacionesService = require('./notificacionesService');
const whatsappNotificacionesService = require('./whatsappNotificacionesService');

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
      `SELECT usuarioId, invitadoId, equipo, linea, ordenLinea, lado FROM Inscripciones
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

const MAX_OPCIONES_POR_PROPUESTA = 3;

function claveJugador(fila) {
  return fila.usuarioId ? `u:${fila.usuarioId}` : `i:${fila.invitadoId}`;
}

function claveDesdeParametro(jugador) {
  if (jugador?.usuarioId) return `u:${jugador.usuarioId}`;
  if (jugador?.invitadoId) return `i:${jugador.invitadoId}`;
  return null;
}

function obtenerDetalle(propuestaId) {
  return db
    .prepare('SELECT usuarioId, invitadoId, equipo, linea, ordenLinea, lado FROM FormacionesPropuestasDetalle WHERE propuestaId = ?')
    .all(propuestaId);
}

// Cruza los asientos de dos jugadores: cada uno ocupa el lugar (equipo, línea, orden, lado) del otro.
function aplicarIntercambio(detalle, claveA, claveB) {
  const asientoA = detalle.find((fila) => claveJugador(fila) === claveA);
  const asientoB = detalle.find((fila) => claveJugador(fila) === claveB);
  if (!asientoA || !asientoB) return detalle;
  const campos = ({ equipo, linea, ordenLinea, lado }) => ({ equipo, linea, ordenLinea, lado });
  const camposA = campos(asientoA);
  const camposB = campos(asientoB);
  return detalle.map((fila) => {
    if (fila === asientoA) return { ...fila, ...camposB };
    if (fila === asientoB) return { ...fila, ...camposA };
    return fila;
  });
}

function claveOpcion(opcion) {
  return {
    claveA: opcion.jugadorAUsuarioId ? `u:${opcion.jugadorAUsuarioId}` : `i:${opcion.jugadorAInvitadoId}`,
    claveB: opcion.jugadorBUsuarioId ? `u:${opcion.jugadorBUsuarioId}` : `i:${opcion.jugadorBInvitadoId}`,
  };
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
        `INSERT INTO FormacionesPropuestasDetalle (id, propuestaId, usuarioId, invitadoId, equipo, linea, ordenLinea, lado)
         VALUES (@id, @propuestaId, @usuarioId, @invitadoId, @equipo, @linea, @ordenLinea, @lado)`
      ).run({ id: crypto.randomUUID(), propuestaId, ...titular });
    }
  });
  crear();

  if (numero === 5) {
    notificacionesService.enviarNotificacionVotacionAbierta(partidoId).catch((error) => {
      console.error('Error enviando notificación de votación abierta:', error.message);
    });
    whatsappNotificacionesService.enviarWhatsappVotacionAbierta(partidoId).catch((error) => {
      console.error('Error enviando WhatsApp de votación abierta:', error.message);
    });
  }
}

async function listarPropuestas(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const propuestas = db
    .prepare('SELECT id, numero FROM FormacionesPropuestas WHERE partidoId = ? ORDER BY numero ASC')
    .all(partidoId);

  const cacheNombres = new Map();
  async function conNombre(fila) {
    const clave = claveJugador(fila);
    if (!cacheNombres.has(clave)) {
      const usuario = fila.usuarioId ? await usuariosService.obtenerUsuario(fila.usuarioId) : null;
      const invitado = fila.invitadoId ? invitadosService.obtenerInvitado(grupoId, fila.invitadoId) : null;
      cacheNombres.set(clave, {
        nombre: usuario?.nombre || invitado?.nombre || 'Jugador',
        posicionPrincipal: usuario?.posicionPrincipal || invitado?.posicionPrincipal || null,
      });
    }
    return { ...fila, ...cacheNombres.get(clave) };
  }
  const separarEquipos = (detalle) => ({
    equipoA: detalle.filter((jugador) => jugador.equipo === 'A'),
    equipoB: detalle.filter((jugador) => jugador.equipo === 'B'),
  });

  const propuestasConDetalle = await Promise.all(
    propuestas.map(async (propuesta) => {
      const detalle = await Promise.all(obtenerDetalle(propuesta.id).map(conNombre));
      const votos = db
        .prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE propuestaId = ? AND opcionId IS NULL')
        .get(propuesta.id).total;

      const opcionesDb = db
        .prepare('SELECT * FROM OpcionesIntercambio WHERE propuestaId = ? ORDER BY fechaCreacion ASC')
        .all(propuesta.id);
      const opciones = await Promise.all(
        opcionesDb.map(async (opcion, indice) => {
          const { claveA, claveB } = claveOpcion(opcion);
          const proponente = await usuariosService.obtenerUsuario(opcion.proponenteId);
          const jugadorA = detalle.find((fila) => claveJugador(fila) === claveA);
          const jugadorB = detalle.find((fila) => claveJugador(fila) === claveB);
          return {
            id: opcion.id,
            numero: indice + 1,
            proponenteId: opcion.proponenteId,
            proponenteNombre: proponente?.nombre || 'Jugador',
            jugadorA: jugadorA ? { usuarioId: jugadorA.usuarioId, invitadoId: jugadorA.invitadoId, nombre: jugadorA.nombre } : null,
            jugadorB: jugadorB ? { usuarioId: jugadorB.usuarioId, invitadoId: jugadorB.invitadoId, nombre: jugadorB.nombre } : null,
            votos: db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE opcionId = ?').get(opcion.id).total,
            ...separarEquipos(aplicarIntercambio(detalle, claveA, claveB)),
          };
        })
      );

      return { id: propuesta.id, numero: propuesta.numero, votos, ...separarEquipos(detalle), opciones };
    })
  );

  const titularesActivos = new Set(listarTitularesConAsiento(partidoId).map((t) => t.usuarioId));
  let miVoto = null;
  let miVotoOpcionId = null;
  if (titularesActivos.has(usuarioId)) {
    const fila = db
      .prepare('SELECT propuestaId, opcionId FROM VotosFormacion WHERE partidoId = ? AND usuarioId = ?')
      .get(partidoId, usuarioId);
    if (fila) {
      miVotoOpcionId = fila.opcionId || null;
      miVoto = fila.opcionId ? null : fila.propuestaId;
    }
  }

  return {
    votacionEquiposCerrada: Boolean(partido.votacionEquiposCerrada),
    propuestaGanadoraId: partido.propuestaGanadoraId || null,
    opcionGanadoraId: partido.opcionGanadoraId || null,
    miVoto,
    miVotoOpcionId,
    propuestas: propuestasConDetalle,
  };
}

async function crearOpcionIntercambio(partidoId, grupoId, propuestaId, proponenteId, { jugadorA, jugadorB }) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const propuesta = db.prepare('SELECT id FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').get(propuestaId, partidoId);
  if (!propuesta) throw crearError('Propuesta no encontrada', 404);

  const anotado = db
    .prepare(`SELECT id FROM Inscripciones WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado'`)
    .get(partidoId, proponenteId);
  if (!anotado) throw crearError('Solo los jugadores anotados pueden proponer un intercambio', 403);

  const claveA = claveDesdeParametro(jugadorA);
  const claveB = claveDesdeParametro(jugadorB);
  if (!claveA || !claveB) throw crearError('Indicá los dos jugadores a intercambiar', 400);

  const detalle = obtenerDetalle(propuestaId);
  const asientoA = detalle.find((fila) => claveJugador(fila) === claveA);
  const asientoB = detalle.find((fila) => claveJugador(fila) === claveB);
  if (!asientoA || !asientoB) throw crearError('Los jugadores deben ser titulares de esta formación', 400);
  if (asientoA.equipo !== 'A' || asientoB.equipo !== 'B') {
    throw crearError('Elegí un jugador del Equipo A y uno del Equipo B', 400);
  }

  const existentes = db.prepare('SELECT * FROM OpcionesIntercambio WHERE propuestaId = ?').all(propuestaId);
  if (existentes.length >= MAX_OPCIONES_POR_PROPUESTA) {
    throw crearError(`Ya hay ${MAX_OPCIONES_POR_PROPUESTA} opciones de intercambio para esta formación`, 400);
  }
  if (existentes.some((opcion) => opcion.proponenteId === proponenteId)) {
    throw crearError('Ya propusiste un intercambio para esta formación', 400);
  }
  if (existentes.some((opcion) => {
    const claves = claveOpcion(opcion);
    return claves.claveA === claveA && claves.claveB === claveB;
  })) {
    throw crearError('Ese intercambio ya fue propuesto', 400);
  }

  db.prepare(
    `INSERT INTO OpcionesIntercambio
       (id, propuestaId, proponenteId, jugadorAUsuarioId, jugadorAInvitadoId, jugadorBUsuarioId, jugadorBInvitadoId, fechaCreacion)
     VALUES (@id, @propuestaId, @proponenteId, @jugadorAUsuarioId, @jugadorAInvitadoId, @jugadorBUsuarioId, @jugadorBInvitadoId, @fechaCreacion)`
  ).run({
    id: crypto.randomUUID(),
    propuestaId,
    proponenteId,
    jugadorAUsuarioId: asientoA.usuarioId,
    jugadorAInvitadoId: asientoA.invitadoId,
    jugadorBUsuarioId: asientoB.usuarioId,
    jugadorBInvitadoId: asientoB.invitadoId,
    fechaCreacion: new Date().toISOString(),
  });
}

async function eliminarOpcionAdmin(partidoId, grupoId, propuestaId, opcionId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const opcion = db
    .prepare(
      `SELECT o.id FROM OpcionesIntercambio o
       JOIN FormacionesPropuestas p ON p.id = o.propuestaId
       WHERE o.id = ? AND o.propuestaId = ? AND p.partidoId = ?`
    )
    .get(opcionId, propuestaId, partidoId);
  if (!opcion) throw crearError('Opción no encontrada', 404);

  db.transaction(() => {
    db.prepare('DELETE FROM VotosFormacion WHERE opcionId = ?').run(opcionId);
    db.prepare('DELETE FROM OpcionesIntercambio WHERE id = ?').run(opcionId);
  })();
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
    db.prepare('DELETE FROM OpcionesIntercambio WHERE propuestaId = ?').run(propuestaId);
    db.prepare('DELETE FROM FormacionesPropuestasDetalle WHERE propuestaId = ?').run(propuestaId);
    db.prepare('DELETE FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').run(propuestaId, partidoId);
  });
  borrar();
}

function elegirGanadora(partidoId) {
  const propuestas = db
    .prepare('SELECT id, numero FROM FormacionesPropuestas WHERE partidoId = ? ORDER BY numero ASC')
    .all(partidoId);
  const candidatos = [];
  for (const propuesta of propuestas) {
    const votosBase = db
      .prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE propuestaId = ? AND opcionId IS NULL')
      .get(propuesta.id).total;
    candidatos.push({ propuestaId: propuesta.id, opcionId: null, votos: votosBase });
    const opciones = db
      .prepare('SELECT id FROM OpcionesIntercambio WHERE propuestaId = ? ORDER BY fechaCreacion ASC')
      .all(propuesta.id);
    for (const opcion of opciones) {
      const votos = db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE opcionId = ?').get(opcion.id).total;
      candidatos.push({ propuestaId: propuesta.id, opcionId: opcion.id, votos });
    }
  }
  // Orden estable: gana el de más votos; en empate, el primero (menor número de formación, base antes que sus opciones).
  return candidatos.reduce((mejor, actual) => (!mejor || actual.votos > mejor.votos ? actual : mejor), null);
}

function aplicarGanadora(partidoId, ganadora) {
  let detalle = obtenerDetalle(ganadora.propuestaId);
  if (ganadora.opcionId) {
    const opcion = db.prepare('SELECT * FROM OpcionesIntercambio WHERE id = ?').get(ganadora.opcionId);
    const { claveA, claveB } = claveOpcion(opcion);
    detalle = aplicarIntercambio(detalle, claveA, claveB);
  }

  const cerrar = db.transaction(() => {
    for (const asiento of detalle) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea, lado = @lado
         WHERE partidoId = @partidoId AND estado = 'anotado'
           AND ((usuarioId IS NOT NULL AND usuarioId = @usuarioId) OR (invitadoId IS NOT NULL AND invitadoId = @invitadoId))`
      ).run({ ...asiento, partidoId });
    }
    db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 1, propuestaGanadoraId = ?, opcionGanadoraId = ? WHERE id = ?').run(
      ganadora.propuestaId,
      ganadora.opcionId,
      partidoId
    );
  });
  cerrar();

  notificacionesService.enviarNotificacionVotacionCerrada(partidoId).catch((error) => {
    console.error('Error enviando notificación de votación cerrada:', error.message);
  });
  whatsappNotificacionesService.enviarWhatsappVotacionCerrada(partidoId).catch((error) => {
    console.error('Error enviando WhatsApp de votación cerrada:', error.message);
  });
}

async function votar(partidoId, grupoId, propuestaId, usuarioId, opcionId = null) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const propuesta = db.prepare('SELECT id FROM FormacionesPropuestas WHERE id = ? AND partidoId = ?').get(propuestaId, partidoId);
  if (!propuesta) throw crearError('Propuesta no encontrada', 404);

  if (opcionId) {
    const opcion = db.prepare('SELECT id FROM OpcionesIntercambio WHERE id = ? AND propuestaId = ?').get(opcionId, propuestaId);
    if (!opcion) throw crearError('Opción no encontrada', 404);
  }

  const esTitular = listarTitularesConAsiento(partidoId).some((titular) => titular.usuarioId === usuarioId);
  if (!esTitular) throw crearError('Solo los titulares pueden votar', 403);

  db.prepare(
    `INSERT INTO VotosFormacion (id, partidoId, usuarioId, propuestaId, opcionId, fecha)
     VALUES (@id, @partidoId, @usuarioId, @propuestaId, @opcionId, @fecha)
     ON CONFLICT(partidoId, usuarioId) DO UPDATE SET propuestaId = excluded.propuestaId, opcionId = excluded.opcionId, fecha = excluded.fecha`
  ).run({ id: crypto.randomUUID(), partidoId, usuarioId, propuestaId, opcionId, fecha: new Date().toISOString() });

  const totalVotos = db.prepare('SELECT COUNT(*) AS total FROM VotosFormacion WHERE partidoId = ?').get(partidoId).total;
  if (totalVotos >= contarTitularesActivos(partidoId)) {
    const ganadora = elegirGanadora(partidoId);
    aplicarGanadora(partidoId, ganadora);
  }
}

async function cerrarManual(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.votacionEquiposCerrada) throw crearError('La votación de equipos ya cerró', 400);

  const ganadora = elegirGanadora(partidoId);
  if (!ganadora) throw crearError('No hay propuestas para determinar una ganadora', 400);
  aplicarGanadora(partidoId, ganadora);
}

async function reiniciarVotacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (!partido.votacionEquiposCerrada) throw crearError('La votación de equipos no está cerrada', 400);

  borrarPropuestasYVotos(partidoId);
  db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 0, propuestaGanadoraId = NULL, opcionGanadoraId = NULL WHERE id = ?').run(partidoId);
}

function borrarPropuestasYVotos(partidoId) {
  const propuestas = db.prepare('SELECT id FROM FormacionesPropuestas WHERE partidoId = ?').all(partidoId);
  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM VotosFormacion WHERE partidoId = ?').run(partidoId);
    for (const propuesta of propuestas) {
      db.prepare('DELETE FROM OpcionesIntercambio WHERE propuestaId = ?').run(propuesta.id);
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
    db.prepare('UPDATE Partidos SET votacionEquiposCerrada = 0, propuestaGanadoraId = NULL, opcionGanadoraId = NULL WHERE id = ?').run(partidoId);
  }
}

function eliminarPorPartido(partidoId) {
  borrarPropuestasYVotos(partidoId);
}

module.exports = {
  crearPropuesta,
  listarPropuestas,
  eliminarPropuestaAdmin,
  crearOpcionIntercambio,
  eliminarOpcionAdmin,
  votar,
  cerrarManual,
  reiniciarVotacion,
  manejarBajaDeTitular,
  eliminarPorPartido,
};
