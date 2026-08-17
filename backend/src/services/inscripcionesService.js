const crypto = require('node:crypto');
const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const partidosService = require('./partidosService');
const gruposService = require('./gruposService');
const { sonPosicionesValidas } = require('../constants/posiciones');
const { LINEAS, POSICION_A_LINEA, generarLineas, splitEquipos } = require('../utils/formacion');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function obtenerInscripcionActiva(partidoId, usuarioId) {
  return (
    db
      .prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado'`)
      .get(partidoId, usuarioId) || null
  );
}

async function contarOcupados(partidoId) {
  const filas = db
    .prepare(`SELECT tipo FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado'`)
    .all(partidoId);
  return {
    titulares: filas.filter((f) => f.tipo === 'titular').length,
    suplentes: filas.filter((f) => f.tipo === 'suplente').length,
  };
}

async function listarTitularesActivos(partidoId) {
  return db
    .prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado' AND tipo = 'titular'`)
    .all(partidoId);
}

async function anotarse(partidoId, grupoId, usuarioId, { posicionPrincipal, posicionSecundaria } = {}) {
  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    throw crearError('Posiciones inválidas', 400);
  }

  const membresia = await gruposService.obtenerMembresia(grupoId, usuarioId);
  if (!membresia) throw crearError('No pertenecés a este grupo', 403);
  if (membresia.estaSancionado) throw crearError('Estás sancionado y no podés anotarte', 403);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido no está abierto', 400);

  const inscripcionActiva = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (inscripcionActiva) throw crearError('Ya estás anotado en este partido', 400);

  const ocupados = await contarOcupados(partidoId);
  let tipo;
  if (ocupados.titulares < partido.cupoTitulares) {
    tipo = 'titular';
  } else if (ocupados.suplentes < partido.cupoSuplentes) {
    tipo = 'suplente';
  } else {
    throw crearError('Partido completo', 400);
  }

  const nuevaInscripcion = {
    id: crypto.randomUUID(),
    partidoId,
    usuarioId,
    estado: 'anotado',
    tipo,
    orden: ocupados.titulares + ocupados.suplentes,
    fechaInscripcion: new Date().toISOString(),
    posicionPrincipal,
    posicionSecundaria,
  };
  db.prepare(
    `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, posicionSecundaria)
     VALUES (@id, @partidoId, @usuarioId, @estado, @tipo, @orden, @fechaInscripcion, @posicionPrincipal, @posicionSecundaria)`
  ).run(nuevaInscripcion);
  return nuevaInscripcion;
}

async function bajarse(partidoId, grupoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('No estás anotado en este partido', 400);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido ya no está abierto', 400);

  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);

  if (inscripcion.tipo === 'titular') {
    await gruposService.sancionar(grupoId, usuarioId);
  }

  return { ...inscripcion, estado: 'dado_de_baja' };
}

async function sancionarManualmente(partidoId, grupoId, usuarioId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'titular') throw crearError('Solo se puede sancionar a jugadores titulares', 400);

  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);
  await gruposService.sancionar(grupoId, usuarioId);

  return { ...inscripcion, estado: 'dado_de_baja' };
}

async function promover(partidoId, grupoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'suplente') throw crearError('El jugador ya es titular', 400);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares >= partido.cupoTitulares) {
    throw crearError('No hay lugares de titular disponibles', 400);
  }

  db.prepare("UPDATE Inscripciones SET tipo = 'titular' WHERE id = ?").run(inscripcion.id);
  return { ...inscripcion, tipo: 'titular' };
}

async function listarActivas(partidoId) {
  return db.prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND estado = 'anotado'`).all(partidoId);
}

function eliminarPorPartido(partidoId) {
  db.prepare('DELETE FROM Inscripciones WHERE partidoId = ?').run(partidoId);
}

async function obtenerFormacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  const habilitado = ocupados.titulares >= partido.cupoTitulares;
  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);
  const lineasEsperadas = { A: generarLineas(cupoPorEquipo.A), B: generarLineas(cupoPorEquipo.B) };

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        equipo: inscripcion.equipo,
        linea: inscripcion.linea,
        ordenLinea: inscripcion.ordenLinea,
      };
    })
  );

  return { habilitado, cupoPorEquipo, lineasEsperadas, jugadores };
}

function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function crearBalanceador(cupoPorEquipo) {
  const estado = {
    A: { restante: cupoPorEquipo.A, total: 0 },
    B: { restante: cupoPorEquipo.B, total: 0 },
  };

  function equiposConCupo() {
    return ['A', 'B'].filter((equipo) => estado[equipo].restante > 0);
  }

  function equipoMenorCarga() {
    const disponibles = equiposConCupo();
    if (disponibles.length === 0) return null;
    return disponibles.reduce((mejor, equipo) => (estado[equipo].total < estado[mejor].total ? equipo : mejor));
  }

  function registrar(equipo, habilidad) {
    estado[equipo].restante -= 1;
    estado[equipo].total += habilidad;
  }

  function equipoAleatorioSesgado(sesgo = 0.7) {
    const disponibles = equiposConCupo();
    if (disponibles.length <= 1) return disponibles[0] || null;
    const menor = equipoMenorCarga();
    const mayor = disponibles.find((equipo) => equipo !== menor);
    return Math.random() < sesgo ? menor : mayor;
  }

  return { equiposConCupo, equipoMenorCarga, equipoAleatorioSesgado, registrar };
}

async function generarFormacionAutomatica(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      const habilidad = (usuario && usuariosService.calcularPromedioHabilidades(usuario)) ?? 50;
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        linea: POSICION_A_LINEA[inscripcion.posicionPrincipal] || 'medio',
        habilidad,
      };
    })
  );

  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);
  const balanceador = crearBalanceador(cupoPorEquipo);
  const asignados = [];

  function asignar(jugador, equipo) {
    balanceador.registrar(equipo, jugador.habilidad);
    asignados.push({ ...jugador, equipo });
  }

  const porLinea = { arquero: [], defensa: [], medio: [], delantero: [] };
  for (const jugador of jugadores) porLinea[jugador.linea].push(jugador);
  for (const linea of LINEAS) porLinea[linea].sort((a, b) => b.habilidad - a.habilidad);

  const pool = [...porLinea.medio];
  for (const linea of ['arquero', 'defensa', 'delantero']) {
    const bucket = porLinea[linea];
    const disponibles = balanceador.equiposConCupo();
    if (bucket.length >= 2 && disponibles.length === 2) {
      const [mejor, segundoMejor] = bucket;
      const primerEquipo = balanceador.equipoAleatorioSesgado();
      const segundoEquipo = primerEquipo === 'A' ? 'B' : 'A';
      asignar(mejor, primerEquipo);
      asignar(segundoMejor, segundoEquipo);
      pool.push(...bucket.slice(2));
    } else {
      pool.push(...bucket);
    }
  }

  const poolMezclado = mezclar(pool);
  for (const jugador of poolMezclado) {
    const equipo = balanceador.equipoMenorCarga();
    asignar(jugador, equipo);
  }

  const contadorLinea = {};
  const jugadoresFinales = asignados.map((jugador) => {
    const clave = `${jugador.equipo}-${jugador.linea}`;
    const ordenLinea = contadorLinea[clave] || 0;
    contadorLinea[clave] = ordenLinea + 1;
    return {
      usuarioId: jugador.usuarioId,
      nombre: jugador.nombre,
      posicionPrincipal: jugador.posicionPrincipal,
      equipo: jugador.equipo,
      linea: jugador.linea,
      ordenLinea,
    };
  });

  const lineasEsperadas = { A: generarLineas(cupoPorEquipo.A), B: generarLineas(cupoPorEquipo.B) };

  return { habilitado: true, cupoPorEquipo, lineasEsperadas, jugadores: jugadoresFinales };
}

async function guardarFormacion(partidoId, grupoId, asignaciones) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }
  if (!Array.isArray(asignaciones)) {
    throw crearError('asignaciones debe ser un arreglo', 400);
  }

  const titulares = await listarTitularesActivos(partidoId);
  const idsTitulares = new Set(titulares.map((t) => t.usuarioId));

  if (asignaciones.length !== idsTitulares.size) {
    throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
  }

  const idsVistos = new Set();
  const asientosVistos = new Set();
  for (const asignacion of asignaciones) {
    if (!asignacion || typeof asignacion !== 'object') {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    const { usuarioId, equipo, linea, ordenLinea } = asignacion;
    if (!idsTitulares.has(usuarioId) || idsVistos.has(usuarioId)) {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    idsVistos.add(usuarioId);
    if (equipo !== 'A' && equipo !== 'B') {
      throw crearError('equipo debe ser "A" o "B"', 400);
    }
    if (!LINEAS.includes(linea)) {
      throw crearError('linea inválida', 400);
    }
    if (!Number.isInteger(ordenLinea) || ordenLinea < 0) {
      throw crearError('ordenLinea debe ser un entero mayor o igual a 0', 400);
    }
    const asiento = `${equipo}-${linea}-${ordenLinea}`;
    if (asientosVistos.has(asiento)) {
      throw crearError(`Hay dos jugadores en la misma posición del equipo ${equipo}`, 400);
    }
    asientosVistos.add(asiento);
  }

  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);

  for (const equipo of ['A', 'B']) {
    const asignacionesDelEquipo = asignaciones.filter((a) => a.equipo === equipo);
    if (asignacionesDelEquipo.length !== cupoPorEquipo[equipo]) {
      throw crearError(`El equipo ${equipo} debe tener exactamente ${cupoPorEquipo[equipo]} jugadores`, 400);
    }
  }

  const actualizar = db.transaction((lista) => {
    for (const asignacion of lista) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea
         WHERE partidoId = @partidoId AND usuarioId = @usuarioId AND estado = 'anotado'`
      ).run({ ...asignacion, partidoId });
    }
  });
  actualizar(asignaciones);

  return obtenerFormacion(partidoId, grupoId);
}

module.exports = {
  anotarse,
  bajarse,
  sancionarManualmente,
  promover,
  contarOcupados,
  obtenerInscripcionActiva,
  listarActivas,
  eliminarPorPartido,
  obtenerFormacion,
  guardarFormacion,
  generarFormacionAutomatica,
};
