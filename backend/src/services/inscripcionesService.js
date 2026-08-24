const crypto = require('node:crypto');
const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const partidosService = require('./partidosService');
const gruposService = require('./gruposService');
const { sonPosicionesValidas } = require('../constants/posiciones');
const { LINEAS, POSICION_A_LINEA, splitEquipos } = require('../utils/formacion');

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

const { resolverLineas, capacidadBroad, TODAS_LAS_LINEAS, CODIGO_AUTOMATICO, LINEAS_CAMPO } = require('../data/formaciones');

function derivarLineasEsperadas(jugadores) {
  const conteo = { A: {}, B: {} };
  for (const jugador of jugadores) {
    if (!jugador.equipo || !jugador.linea || jugador.linea === 'arquero') continue;
    conteo[jugador.equipo][jugador.linea] = (conteo[jugador.equipo][jugador.linea] || 0) + 1;
  }
  function ordenarPorLineaCampo(entradas) {
    return entradas
      .map(([key, cantidad]) => ({ key, cantidad }))
      .sort((a, b) => LINEAS_CAMPO.indexOf(a.key) - LINEAS_CAMPO.indexOf(b.key));
  }
  return {
    A: ordenarPorLineaCampo(Object.entries(conteo.A)),
    B: ordenarPorLineaCampo(Object.entries(conteo.B)),
  };
}

async function obtenerFormacion(partidoId, grupoId) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  const habilitado = ocupados.titulares >= partido.cupoTitulares;
  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);

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
        lado: inscripcion.lado,
      };
    })
  );

  const lineasEsperadas = derivarLineasEsperadas(jugadores);

  return { habilitado, cupoPorEquipo, lineasEsperadas, jugadores };
}

function crearBalanceadorConCapacidad(cupoPorEquipo, capBroad) {
  const estado = {
    A: { restante: cupoPorEquipo.A, total: 0, porLinea: {} },
    B: { restante: cupoPorEquipo.B, total: 0, porLinea: {} },
  };

  function tieneCupo(equipo, linea) {
    return estado[equipo].restante > 0 && (estado[equipo].porLinea[linea] || 0) < capBroad[equipo][linea];
  }

  function equiposConCupo(linea) {
    return ['A', 'B'].filter((equipo) => tieneCupo(equipo, linea));
  }

  function registrar(equipo, habilidad, linea) {
    estado[equipo].restante -= 1;
    estado[equipo].total += habilidad;
    estado[equipo].porLinea[linea] = (estado[equipo].porLinea[linea] || 0) + 1;
  }

  // A capacidad igual (o ambos con cupo), desempata por menor habilidad acumulada;
  // si empata también, al azar. La paridad de cantidad por línea ya la garantiza el
  // cupo exacto de la formación elegida, así que no hace falta desempatar por conteo.
  function elegirEquipo(linea) {
    const disponibles = equiposConCupo(linea);
    if (disponibles.length === 0) return null;
    if (disponibles.length === 1) return disponibles[0];
    const [a, b] = disponibles;
    if (estado[a].total !== estado[b].total) return estado[a].total < estado[b].total ? a : b;
    return Math.random() < 0.5 ? a : b;
  }

  function elegirCualquierEquipoConCupo() {
    for (const linea of LINEAS) {
      const disponibles = equiposConCupo(linea);
      if (disponibles.length > 0) {
        const equipo = disponibles.sort((x, y) => estado[x].total - estado[y].total)[0];
        return { equipo, linea };
      }
    }
    throw new Error('No hay cupo disponible en ninguna línea (no debería pasar: la capacidad total siempre iguala al cupo total)');
  }

  return { elegirEquipo, elegirCualquierEquipoConCupo, registrar };
}

async function generarFormacionAutomatica(partidoId, grupoId, seleccion = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }

  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);
  const resuelto = {
    A: resolverLineas(cupoPorEquipo.A, seleccion.A || { codigo: CODIGO_AUTOMATICO }),
    B: resolverLineas(cupoPorEquipo.B, seleccion.B || { codigo: CODIGO_AUTOMATICO }),
  };
  const capBroad = { A: capacidadBroad(resuelto.A), B: capacidadBroad(resuelto.B) };

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = await usuariosService.obtenerUsuario(inscripcion.usuarioId);
      const habilidad = (usuario && usuariosService.calcularPromedioHabilidades(usuario)) ?? 50;
      return {
        usuarioId: inscripcion.usuarioId,
        nombre: usuario?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        posicionSecundaria: inscripcion.posicionSecundaria,
        lineaBroad: POSICION_A_LINEA[inscripcion.posicionPrincipal] || 'medio',
        piernaHabil: usuario?.piernaHabil || null,
        habilidad,
      };
    })
  );

  const balanceador = crearBalanceadorConCapacidad(cupoPorEquipo, capBroad);
  const asignados = [];

  function asignar(jugador, equipo, lineaBroad) {
    balanceador.registrar(equipo, jugador.habilidad, lineaBroad);
    asignados.push({ ...jugador, equipo, lineaBroad });
  }

  const porLinea = { arquero: [], defensa: [], medio: [], delantero: [] };
  for (const jugador of jugadores) porLinea[jugador.lineaBroad].push(jugador);
  for (const linea of LINEAS) porLinea[linea].sort((a, b) => b.habilidad - a.habilidad);

  const sinAsignar = [];
  for (const linea of LINEAS) {
    for (const jugador of porLinea[linea]) {
      const equipo = balanceador.elegirEquipo(linea);
      if (equipo) asignar(jugador, equipo, linea);
      else sinAsignar.push(jugador);
    }
  }

  const siguenSinAsignar = [];
  for (const jugador of sinAsignar) {
    const lineaSecundaria = POSICION_A_LINEA[jugador.posicionSecundaria] || null;
    const equipo = lineaSecundaria ? balanceador.elegirEquipo(lineaSecundaria) : null;
    if (equipo) asignar(jugador, equipo, lineaSecundaria);
    else siguenSinAsignar.push(jugador);
  }

  for (const jugador of siguenSinAsignar) {
    const { equipo, linea } = balanceador.elegirCualquierEquipoConCupo();
    asignar(jugador, equipo, linea);
  }

  // Dividir "medio" en medioContencion/medioOfensivo cuando la formación del equipo lo pida.
  const mediosPorEquipo = { A: [], B: [] };
  for (const jugador of asignados) {
    if (jugador.lineaBroad === 'medio') mediosPorEquipo[jugador.equipo].push(jugador);
  }
  for (const equipo of ['A', 'B']) {
    const subLineas = resuelto[equipo].filter((l) => l.key === 'medioContencion' || l.key === 'medioOfensivo');
    if (subLineas.length === 0) continue;
    const cantidadContencion = subLineas.find((l) => l.key === 'medioContencion')?.cantidad || 0;
    mediosPorEquipo[equipo].forEach((jugador, indice) => {
      jugador.lineaFinal = indice < cantidadContencion ? 'medioContencion' : 'medioOfensivo';
    });
  }
  for (const jugador of asignados) {
    if (!jugador.lineaFinal) jugador.lineaFinal = jugador.lineaBroad;
  }

  const contadorLinea = {};
  const conteoPiernaLinea = {};
  const jugadoresFinales = asignados.map((jugador) => {
    const clave = `${jugador.equipo}-${jugador.lineaFinal}`;
    const ordenLinea = contadorLinea[clave] || 0;
    contadorLinea[clave] = ordenLinea + 1;

    let lado = null;
    if (jugador.lineaFinal !== 'arquero') {
      const claveConteo = `${jugador.equipo}-${jugador.lineaFinal}-${jugador.piernaHabil}`;
      const conteoActual = conteoPiernaLinea[claveConteo] || 0;
      conteoPiernaLinea[claveConteo] = conteoActual + 1;

      if (jugador.piernaHabil === 'zurdo') {
        lado = conteoActual === 0 ? 'izquierda' : 'derecha';
      } else if (jugador.piernaHabil === 'diestro') {
        lado = conteoActual === 0 ? 'derecha' : 'izquierda';
      }
    }

    return {
      usuarioId: jugador.usuarioId,
      nombre: jugador.nombre,
      posicionPrincipal: jugador.posicionPrincipal,
      equipo: jugador.equipo,
      linea: jugador.lineaFinal,
      ordenLinea,
      lado,
    };
  });

  return { habilitado: true, cupoPorEquipo, lineasEsperadas: resuelto, jugadores: jugadoresFinales };
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
    if (!TODAS_LAS_LINEAS.includes(linea)) {
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
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea, lado = @lado
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
