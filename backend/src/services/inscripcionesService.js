const crypto = require('node:crypto');
const { db } = require('../config/db');
const usuariosService = require('./usuariosService');
const partidosService = require('./partidosService');
const gruposService = require('./gruposService');
const invitadosService = require('./invitadosService');
const { sonPosicionesValidas } = require('../constants/posiciones');
const { LINEAS, POSICION_A_LINEA, splitEquipos } = require('../utils/formacion');
const formacionesPropuestasService = require('./formacionesPropuestasService');

function crearError(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// Identidad de asiento: un jugador real o un invitado, nunca ambos (ver CHECK de Inscripciones).
function claveJugador(usuarioId, invitadoId) {
  return usuarioId ? `u:${usuarioId}` : `i:${invitadoId}`;
}

const DOS_DIAS_MS = 2 * 24 * 60 * 60 * 1000;

function faltaMenosDeDosDias(fechaPartido) {
  return new Date(fechaPartido).getTime() - Date.now() < DOS_DIAS_MS;
}

async function obtenerInscripcionActiva(partidoId, usuarioId) {
  return (
    db
      .prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado'`)
      .get(partidoId, usuarioId) || null
  );
}

async function obtenerInscripcionActivaInvitado(partidoId, invitadoId) {
  return (
    db
      .prepare(`SELECT * FROM Inscripciones WHERE partidoId = ? AND invitadoId = ? AND estado = 'anotado'`)
      .get(partidoId, invitadoId) || null
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
    if (faltaMenosDeDosDias(partido.fecha)) {
      await gruposService.sancionar(grupoId, usuarioId);
    }
    formacionesPropuestasService.manejarBajaDeTitular(partidoId);
  }

  return { ...inscripcion, estado: 'dado_de_baja' };
}

async function anotarInvitado(partidoId, grupoId, invitadoId, { posicionPrincipal, posicionSecundaria } = {}) {
  if (!sonPosicionesValidas(posicionPrincipal, posicionSecundaria)) {
    throw crearError('Posiciones inválidas', 400);
  }

  const invitado = invitadosService.obtenerInvitado(grupoId, invitadoId);
  if (!invitado) throw crearError('Invitado no encontrado', 404);
  if (invitado.estado !== 'aprobado') throw crearError('El invitado no está aprobado', 403);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido no está abierto', 400);

  const inscripcionActiva = await obtenerInscripcionActivaInvitado(partidoId, invitadoId);
  if (inscripcionActiva) throw crearError('El invitado ya está anotado en este partido', 400);

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
    invitadoId,
    estado: 'anotado',
    tipo,
    orden: ocupados.titulares + ocupados.suplentes,
    fechaInscripcion: new Date().toISOString(),
    posicionPrincipal,
    posicionSecundaria,
  };
  db.prepare(
    `INSERT INTO Inscripciones (id, partidoId, invitadoId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, posicionSecundaria)
     VALUES (@id, @partidoId, @invitadoId, @estado, @tipo, @orden, @fechaInscripcion, @posicionPrincipal, @posicionSecundaria)`
  ).run(nuevaInscripcion);
  return nuevaInscripcion;
}

async function bajarInvitado(partidoId, grupoId, invitadoId) {
  const inscripcion = await obtenerInscripcionActivaInvitado(partidoId, invitadoId);
  if (!inscripcion) throw crearError('El invitado no está anotado en este partido', 400);

  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);
  if (partido.estado !== 'abierto') throw crearError('El partido ya no está abierto', 400);

  db.prepare("UPDATE Inscripciones SET estado = 'dado_de_baja' WHERE id = ?").run(inscripcion.id);

  // Sin sanción: el invitado no tiene fila en UsuariosGrupos (ver invitadosService).
  if (inscripcion.tipo === 'titular') {
    formacionesPropuestasService.manejarBajaDeTitular(partidoId);
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
  formacionesPropuestasService.manejarBajaDeTitular(partidoId);

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

const {
  resolverLineas,
  capacidadBroad,
  TODAS_LAS_LINEAS,
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  LINEAS_CAMPO,
} = require('../data/formaciones');

// En modo plantel no hay dos equipos: todos los titulares juegan en un único equipo
// (nuestro propio) y se persisten con equipo fijo en 'A'.
const EQUIPO_PLANEL = 'A';

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

  const grupo = gruposService.obtenerGrupo(grupoId);
  if (grupo?.modo === 'plantel') {
    return obtenerFormacionPlantel(partido, partidoId, grupoId);
  }

  const ocupados = await contarOcupados(partidoId);
  const habilitado = ocupados.titulares + ocupados.suplentes >= partido.cupoTitulares;
  const cupoPorEquipo = splitEquipos(partido.cupoTitulares);

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = inscripcion.usuarioId ? await usuariosService.obtenerUsuario(inscripcion.usuarioId) : null;
      const invitado = inscripcion.invitadoId ? invitadosService.obtenerInvitado(grupoId, inscripcion.invitadoId) : null;
      return {
        usuarioId: inscripcion.usuarioId,
        invitadoId: inscripcion.invitadoId,
        nombre: usuario?.nombre || invitado?.nombre || 'Jugador',
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

// Pizarra táctica del modo plantel: un solo equipo, con el esquema (formación)
// elegido por el admin persistido en el partido.
async function obtenerFormacionPlantel(partido, partidoId, grupoId) {
  const ocupados = await contarOcupados(partidoId);
  const habilitado = ocupados.titulares >= partido.cupoTitulares;

  const titulares = await listarTitularesActivos(partidoId);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = inscripcion.usuarioId ? await usuariosService.obtenerUsuario(inscripcion.usuarioId) : null;
      const invitado = inscripcion.invitadoId
        ? invitadosService.obtenerInvitado(grupoId, inscripcion.invitadoId)
        : null;
      return {
        usuarioId: inscripcion.usuarioId,
        invitadoId: inscripcion.invitadoId,
        nombre: usuario?.nombre || invitado?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        posicionSecundaria: inscripcion.posicionSecundaria,
        piernaHabil: usuario?.piernaHabil || null,
        equipo: inscripcion.equipo,
        linea: inscripcion.linea,
        ordenLinea: inscripcion.ordenLinea,
        lado: inscripcion.lado,
      };
    })
  );

  return {
    habilitado,
    modo: 'plantel',
    cupo: partido.cupoTitulares,
    formacionCodigo: partido.formacionCodigo || CODIGO_AUTOMATICO,
    jugadores,
  };
}

// Guarda la pizarra táctica del modo plantel: todos los anotados titulares deben
// quedar ubicados en el único equipo, respetando el esquema elegido (catálogo o libre).
async function guardarFormacionPlantel(partido, grupoId, payload = {}) {
  const cupo = partido.cupoTitulares;
  const asignaciones = Array.isArray(payload) ? payload : payload?.asignaciones;
  if (!Array.isArray(asignaciones)) throw crearError('asignaciones debe ser un arreglo', 400);

  const ocupados = await contarOcupados(partido.id);
  if (ocupados.titulares < cupo) {
    throw crearError('El cupo de titulares no está completo', 400);
  }

  const lineas = payload.lineasLibres
    ? resolverLineas(cupo, { codigo: CODIGO_LIBRE, lineas: payload.lineasLibres })
    : resolverLineas(cupo, { codigo: payload.formacionCodigo || CODIGO_AUTOMATICO });
  const cupoPorLinea = new Map(lineas.map((linea) => [linea.key, linea.cantidad]));

  const titulares = await listarTitularesActivos(partido.id);
  const idsTitulares = new Set(titulares.map((t) => claveJugador(t.usuarioId, t.invitadoId)));
  if (asignaciones.length !== idsTitulares.size) {
    throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
  }

  const idsVistos = new Set();
  const asientosVistos = new Set();
  const vistosPorLinea = {};
  for (const asignacion of asignaciones) {
    if (!asignacion || typeof asignacion !== 'object') {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    const { usuarioId = null, invitadoId = null, linea, ordenLinea, lado = null } = asignacion;
    const clave = claveJugador(usuarioId, invitadoId);
    if (!idsTitulares.has(clave) || idsVistos.has(clave)) {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    idsVistos.add(clave);
    if (!TODAS_LAS_LINEAS.includes(linea)) throw crearError('linea inválida', 400);
    const cupoLinea = linea === 'arquero' ? 1 : cupoPorLinea.get(linea);
    if (cupoLinea === undefined) {
      throw crearError(`La línea "${linea}" no forma parte de la formación elegida`, 400);
    }
    if (!Number.isInteger(ordenLinea) || ordenLinea < 0 || ordenLinea >= cupoLinea) {
      throw crearError('Posición fuera de la formación elegida', 400);
    }
    if (lado !== null && lado !== 'izquierda' && lado !== 'derecha') {
      throw crearError('lado inválido', 400);
    }
    const asiento = `${linea}-${ordenLinea}`;
    if (asientosVistos.has(asiento)) {
      throw crearError('Hay dos jugadores en la misma posición', 400);
    }
    asientosVistos.add(asiento);
    vistosPorLinea[linea] = (vistosPorLinea[linea] || 0) + 1;
  }

  for (const { key, cantidad } of lineas) {
    if ((vistosPorLinea[key] || 0) !== cantidad) {
      throw crearError(`La línea ${key} debe tener exactamente ${cantidad} jugadores`, 400);
    }
  }
  if ((vistosPorLinea.arquero || 0) !== 1) {
    throw crearError('Falta el arquero en la pizarra', 400);
  }

  const formacionCodigoFinal =
    payload.formacionCodigo || (Array.isArray(payload.lineasLibres) ? CODIGO_LIBRE : CODIGO_AUTOMATICO);

  const actualizar = db.transaction((lista) => {
    db.prepare('UPDATE Partidos SET formacionCodigo = ? WHERE id = ?').run(formacionCodigoFinal, partido.id);
    for (const asignacion of lista) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = @equipo, linea = @linea, ordenLinea = @ordenLinea, lado = @lado
         WHERE partidoId = @partidoId AND estado = 'anotado'
           AND ((usuarioId IS NOT NULL AND usuarioId = @usuarioId) OR (invitadoId IS NOT NULL AND invitadoId = @invitadoId))`
      ).run({
        equipo: EQUIPO_PLANEL,
        linea: asignacion.linea,
        ordenLinea: asignacion.ordenLinea,
        lado: asignacion.lado ?? null,
        partidoId: partido.id,
        usuarioId: asignacion.usuarioId || null,
        invitadoId: asignacion.invitadoId || null,
      });
    }
  });
  actualizar(asignaciones);

  return obtenerFormacion(partido.id, grupoId);
}

// Diferencia de habilidad acumulada por debajo de la cual dos equipos se consideran
// "empatados": permite que el balanceador varíe entre corridas sin romper la paridad.
const MARGEN_EMPATE_HABILIDAD = 5;

function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
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
    const diferencia = Math.abs(estado[a].total - estado[b].total);
    if (diferencia > MARGEN_EMPATE_HABILIDAD) return estado[a].total < estado[b].total ? a : b;
    return Math.random() < 0.5 ? a : b;
  }

  function elegirCualquierEquipoConCupo() {
    for (const linea of LINEAS) {
      const disponibles = equiposConCupo(linea);
      if (disponibles.length > 0) {
        const minimo = Math.min(...disponibles.map((equipo) => estado[equipo].total));
        const empatados = disponibles.filter((equipo) => estado[equipo].total - minimo <= MARGEN_EMPATE_HABILIDAD);
        const equipo = empatados[Math.floor(Math.random() * empatados.length)];
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

  const grupo = gruposService.obtenerGrupo(grupoId);
  if (grupo?.modo === 'plantel') {
    // El frontend de plantel manda el esquema bajo la clave "A" (el único equipo).
    return generarFormacionAutomaticaPlantel(partido, grupoId, seleccion?.A || seleccion);
  }

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
      const usuario = inscripcion.usuarioId ? await usuariosService.obtenerUsuario(inscripcion.usuarioId) : null;
      const invitado = inscripcion.invitadoId ? invitadosService.obtenerInvitado(grupoId, inscripcion.invitadoId) : null;
      const habilidad = usuario
        ? usuariosService.calcularPromedioHabilidades(usuario) ?? 50
        : invitado?.habilidadPromedio ?? 50;
      return {
        usuarioId: inscripcion.usuarioId,
        invitadoId: inscripcion.invitadoId,
        nombre: usuario?.nombre || invitado?.nombre || 'Jugador',
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
  // Barajar antes de ordenar: con stable sort, empates de habilidad quedan en
  // orden aleatorio en vez de repetir siempre el mismo orden de la consulta a la BD.
  for (const linea of LINEAS) porLinea[linea] = barajar(porLinea[linea]).sort((a, b) => b.habilidad - a.habilidad);

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
      invitadoId: jugador.invitadoId,
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

// payload: { asignaciones: [...], formacionCodigo?, lineasLibres? }. Acepta también
// un arreglo directo (llamadas legacy de modo convocatoria).
async function guardarFormacion(partidoId, grupoId, payload = {}) {
  const partido = await partidosService.obtenerPartido(partidoId, grupoId);
  if (!partido) throw crearError('Partido no encontrado', 404);

  const grupo = gruposService.obtenerGrupo(grupoId);
  if (grupo?.modo === 'plantel') {
    return guardarFormacionPlantel(partido, grupoId, payload);
  }

  const asignaciones = Array.isArray(payload) ? payload : payload?.asignaciones;
  const ocupados = await contarOcupados(partidoId);
  if (ocupados.titulares < partido.cupoTitulares) {
    throw crearError('El cupo de titulares no está completo', 400);
  }
  if (!Array.isArray(asignaciones)) {
    throw crearError('asignaciones debe ser un arreglo', 400);
  }

  const titulares = await listarTitularesActivos(partidoId);
  const idsTitulares = new Set(titulares.map((t) => claveJugador(t.usuarioId, t.invitadoId)));

  if (asignaciones.length !== idsTitulares.size) {
    throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
  }

  const idsVistos = new Set();
  const asientosVistos = new Set();
  for (const asignacion of asignaciones) {
    if (!asignacion || typeof asignacion !== 'object') {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    const { usuarioId = null, invitadoId = null, equipo, linea, ordenLinea } = asignacion;
    const clave = claveJugador(usuarioId, invitadoId);
    if (!idsTitulares.has(clave) || idsVistos.has(clave)) {
      throw crearError('La formación debe incluir a todos los titulares, sin repetidos', 400);
    }
    idsVistos.add(clave);
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
         WHERE partidoId = @partidoId AND estado = 'anotado'
           AND ((usuarioId IS NOT NULL AND usuarioId = @usuarioId) OR (invitadoId IS NOT NULL AND invitadoId = @invitadoId))`
      ).run({ ...asignacion, partidoId, usuarioId: asignacion.usuarioId || null, invitadoId: asignacion.invitadoId || null });
    }
  });
  actualizar(asignaciones);

  return obtenerFormacion(partidoId, grupoId);
}

// Rellena la pizarra del modo plantel con los anotados titulares: arquero preferido,
// y luego cada línea del esquema tomando primero por posición principal, después por
// secundaria y al final cualquier jugador disponible (mismo esquema de fallbacks que
// la generación de equipos de convocatoria, pero sobre un único equipo).
async function generarFormacionAutomaticaPlantel(partido, grupoId, seleccion = {}) {
  const cupo = partido.cupoTitulares;
  const ocupados = await contarOcupados(partido.id);
  if (ocupados.titulares < cupo) {
    throw crearError('El cupo de titulares no está completo', 400);
  }

  const lineas = resolverLineas(cupo, seleccion);
  const disponibles = new Set();
  const porId = new Map();
  const titulares = await listarTitularesActivos(partido.id);
  const jugadores = await Promise.all(
    titulares.map(async (inscripcion) => {
      const usuario = inscripcion.usuarioId ? await usuariosService.obtenerUsuario(inscripcion.usuarioId) : null;
      const invitado = inscripcion.invitadoId
        ? invitadosService.obtenerInvitado(grupoId, inscripcion.invitadoId)
        : null;
      const habilidad = usuario
        ? usuariosService.calcularPromedioHabilidades(usuario) ?? 50
        : invitado?.habilidadPromedio ?? 50;
      const jugador = {
        usuarioId: inscripcion.usuarioId,
        invitadoId: inscripcion.invitadoId,
        nombre: usuario?.nombre || invitado?.nombre || 'Jugador',
        posicionPrincipal: inscripcion.posicionPrincipal,
        posicionSecundaria: inscripcion.posicionSecundaria,
        lineaBroad: POSICION_A_LINEA[inscripcion.posicionPrincipal] || 'medio',
        piernaHabil: usuario?.piernaHabil || null,
        habilidad,
      };
      const id = claveJugador(jugador.usuarioId, jugador.invitadoId);
      disponibles.add(id);
      porId.set(id, jugador);
      return jugador;
    })
  );

  function tomarPorPreferencia(lineaBroad) {
    // 1º posición principal, 2º secundaria, 3º cualquiera. Barajado para no repetir
    // siempre el mismo orden entre jugadores de igual posición.
    const orden = barajar([...disponibles]);
    const conPrincipal = orden.filter((id) => porId.get(id).lineaBroad === lineaBroad);
    const conSecundaria = orden.filter(
      (id) =>
        porId.get(id).lineaBroad !== lineaBroad &&
        POSICION_A_LINEA[porId.get(id).posicionSecundaria] === lineaBroad
    );
    const elegido = conPrincipal[0] || conSecundaria[0] || orden[0];
    if (!elegido) return null;
    disponibles.delete(elegido);
    return porId.get(elegido);
  }

  const asignaciones = [];
  const contadorLinea = {};
  const conteoPiernaLinea = {};

  // El arquero se ubica primero (si nadie se anotó de arquero, el primero disponible).
  const primeroArquero = jugadores.find((j) => j.posicionPrincipal === 'arquero');
  const idArquero = primeroArquero
    ? claveJugador(primeroArquero.usuarioId, primeroArquero.invitadoId)
    : null;
  const arquero =
    idArquero && disponibles.has(idArquero)
      ? (disponibles.delete(idArquero), porId.get(idArquero))
      : tomarPorPreferencia('arquero');
  if (arquero) {
    asignaciones.push({
      usuarioId: arquero.usuarioId,
      invitadoId: arquero.invitadoId,
      nombre: arquero.nombre,
      linea: 'arquero',
      ordenLinea: 0,
      lado: null,
    });
  }

  for (const { key, cantidad } of lineas) {
    const lineaBroad = key === 'medioContencion' || key === 'medioOfensivo' ? 'medio' : key;
    for (let i = 0; i < cantidad; i += 1) {
      const jugador = tomarPorPreferencia(lineaBroad);
      if (!jugador) break;
      const claveConteo = `${key}-${jugador.piernaHabil}`;
      const conteoActual = conteoPiernaLinea[claveConteo] || 0;
      conteoPiernaLinea[claveConteo] = conteoActual + 1;
      let lado = null;
      if (jugador.piernaHabil === 'zurdo') {
        lado = conteoActual === 0 ? 'izquierda' : 'derecha';
      } else if (jugador.piernaHabil === 'diestro') {
        lado = conteoActual === 0 ? 'derecha' : 'izquierda';
      }
      contadorLinea[key] = (contadorLinea[key] || 0) + 1;
      asignaciones.push({
        usuarioId: jugador.usuarioId,
        invitadoId: jugador.invitadoId,
        nombre: jugador.nombre,
        linea: key,
        ordenLinea: contadorLinea[key] - 1,
        lado,
      });
    }
  }

  const formacionCodigoFinal =
    seleccion?.codigo && seleccion.codigo !== CODIGO_AUTOMATICO ? seleccion.codigo : CODIGO_AUTOMATICO;

  const actualizar = db.transaction(() => {
    db.prepare('UPDATE Partidos SET formacionCodigo = ? WHERE id = ?').run(formacionCodigoFinal, partido.id);
    for (const jugador of asignaciones) {
      db.prepare(
        `UPDATE Inscripciones SET equipo = ?, linea = ?, ordenLinea = ?, lado = ?
         WHERE partidoId = ? AND estado = 'anotado'
           AND ((usuarioId IS NOT NULL AND usuarioId = ?) OR (invitadoId IS NOT NULL AND invitadoId = ?))`
      ).run(
        EQUIPO_PLANEL,
        jugador.linea,
        jugador.ordenLinea,
        jugador.lado,
        partido.id,
        jugador.usuarioId,
        jugador.invitadoId
      );
    }
  });
  actualizar();

  return obtenerFormacion(partido.id, grupoId);
}

module.exports = {
  anotarse,
  bajarse,
  anotarInvitado,
  bajarInvitado,
  sancionarManualmente,
  promover,
  contarOcupados,
  obtenerInscripcionActiva,
  obtenerInscripcionActivaInvitado,
  listarActivas,
  eliminarPorPartido,
  obtenerFormacion,
  guardarFormacion,
  generarFormacionAutomatica,
};
