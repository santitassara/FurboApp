const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const gruposService = require('../../src/services/gruposService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');
const resultadosService = require('../../src/services/resultadosService');
const estadisticasService = require('../../src/services/estadisticasService');

const ADMIN_UID = 'admin-plantel';
const GRUPO_ID = 'grupo-plantel';

function insertarUsuario(uid, nombre) {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (?, ?, ?, 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, `${uid}@gmail.com`);
}

function insertarGrupo({ id = GRUPO_ID, nombre = 'Peña del Plantel', modo = 'plantel' } = {}) {
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, modo, creadoPor, fechaCreacion)
       VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`
    )
    .run(id, nombre, `PLA-${id.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase()}`, modo, ADMIN_UID);
}

function insertarMembresia(grupoId = GRUPO_ID, usuarioId = ADMIN_UID, id = 'mem-1') {
  mockDb
    .prepare(
      `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
       VALUES (?, ?, ?, 'admin', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(id, grupoId, usuarioId);
}

async function crearPartidoPlantel(overrides = {}) {
  return partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 11,
    cupoSuplentes: 3,
    creadoPor: ADMIN_UID,
    grupoId: GRUPO_ID,
    ...overrides,
  });
}

function insertarInscripcion({ id, partidoId, usuarioId, tipo = 'titular', equipo = null, posicionPrincipal = null }) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo, posicionPrincipal)
       VALUES (?, ?, ?, 'anotado', ?, 0, '2026-01-01T00:00:00.000Z', ?, ?)`
    )
    .run(id, partidoId, usuarioId, tipo, equipo, posicionPrincipal);
}

// 11 titulares anotados, con posiciones que respetan un 4-3-3 (arquero, 4 defensores,
// 3 mediocampistas, 3 delanteros).
const POSICIONES_ONCE = [
  'arquero',
  'defensor', 'defensor', 'defensor', 'defensor',
  'mediocampista', 'mediocampista', 'mediocampista',
  'delantero', 'delantero', 'delantero',
];

async function crearPartidoConOnce(partidoId) {
  for (let i = 0; i < POSICIONES_ONCE.length; i += 1) {
    const uid = `jug-${i + 1}`;
    insertarUsuario(uid, `Jugador ${i + 1}`);
    insertarInscripcion({ id: `ins-${i + 1}`, partidoId, usuarioId: uid, tipo: 'titular', posicionPrincipal: POSICIONES_ONCE[i] });
  }
}

// Asignaciones para 4-3-3: jug-1 arquero, jug-2..5 defensa, jug-6..8 medio, jug-9..11 delantero.
function asignaciones433() {
  return [
    { usuarioId: 'jug-1', linea: 'arquero', ordenLinea: 0 },
    ...['jug-2', 'jug-3', 'jug-4', 'jug-5'].map((usuarioId, i) => ({ usuarioId, linea: 'defensa', ordenLinea: i })),
    ...['jug-6', 'jug-7', 'jug-8'].map((usuarioId, i) => ({ usuarioId, linea: 'medio', ordenLinea: i })),
    ...['jug-9', 'jug-10', 'jug-11'].map((usuarioId, i) => ({ usuarioId, linea: 'delantero', ordenLinea: i })),
  ];
}

// Asignaciones para 4-4-2: jug-1 arquero, jug-2..5 defensa, jug-6..9 medio, jug-10..11 delantero.
function asignaciones442() {
  return [
    { usuarioId: 'jug-1', linea: 'arquero', ordenLinea: 0 },
    ...['jug-2', 'jug-3', 'jug-4', 'jug-5'].map((usuarioId, i) => ({ usuarioId, linea: 'defensa', ordenLinea: i })),
    ...['jug-6', 'jug-7', 'jug-8', 'jug-9'].map((usuarioId, i) => ({ usuarioId, linea: 'medio', ordenLinea: i })),
    ...['jug-10', 'jug-11'].map((usuarioId, i) => ({ usuarioId, linea: 'delantero', ordenLinea: i })),
  ];
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM VotosMvp');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuario(ADMIN_UID, 'Admin Planta');
  insertarGrupo();
  insertarMembresia();
});

describe('gruposService.crearGrupo — modo de grupo', () => {
  it('por defecto crea en modo convocatoria', async () => {
    const grupo = await gruposService.crearGrupo({ nombre: 'La convocatoria', creadoPor: ADMIN_UID });

    expect(grupo.modo).toBe('convocatoria');
  });

  it('crea en modo plantel cuando se pide', async () => {
    const grupo = await gruposService.crearGrupo({ nombre: 'La peña', creadoPor: ADMIN_UID, modo: 'plantel' });

    expect(grupo.modo).toBe('plantel');
    const guardado = mockDb.prepare('SELECT modo FROM Grupos WHERE id = ?').get(grupo.id);
    expect(guardado.modo).toBe('plantel');
  });

  it('rechaza un modo inválido', async () => {
    await expect(
      gruposService.crearGrupo({ nombre: 'La peña', creadoPor: ADMIN_UID, modo: 'tabla-redonda' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('listarMisGrupos devuelve el modo de cada grupo', async () => {
    await gruposService.crearGrupo({ nombre: 'La convocatoria', creadoPor: ADMIN_UID });

    const grupos = await gruposService.listarMisGrupos(ADMIN_UID);
    const porNombre = Object.fromEntries(grupos.map((g) => [g.nombre, g]));

    expect(porNombre['Peña del Plantel'].modo).toBe('plantel');
    expect(porNombre['La convocatoria'].modo).toBe('convocatoria');
  });
});

describe('partidosService.crearPartido — bitácora del torneo', () => {
  it('guarda rival y notas tácticas limpias', async () => {
    const partido = await crearPartidoPlantel({
      rival: '  Racing de Avellaneda  ',
      notasTacticas: 'Atacan mucho por las bandas',
    });

    const guardado = mockDb.prepare('SELECT rival, notasTacticas FROM Partidos WHERE id = ?').get(partido.id);
    expect(guardado.rival).toBe('Racing de Avellaneda');
    expect(guardado.notasTacticas).toBe('Atacan mucho por las bandas');
  });

  it('convierte rival y notas vacíos en null', async () => {
    const partido = await crearPartidoPlantel({ rival: '   ', notasTacticas: '' });

    expect(partido.rival).toBeNull();
    expect(partido.notasTacticas).toBeNull();
  });
});

describe('partidosService.listarFixture', () => {
  it('devuelve solo los partidos en pie, ordenados por fecha ascendente', async () => {
    const tercero = await crearPartidoPlantel({ fecha: '2099-01-03T20:00:00.000Z', rival: 'Tercero' });
    const primero = await crearPartidoPlantel({ fecha: '2099-01-01T20:00:00.000Z', rival: 'Primero' });
    const jugado = await crearPartidoPlantel({ fecha: '2098-01-01T20:00:00.000Z', rival: 'Ya pasó' });
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(jugado.id);

    const fixture = await partidosService.listarFixture(GRUPO_ID);

    expect(fixture.map((p) => p.id)).toEqual([primero.id, tercero.id]);
  });

  it('incluye los partidos cerrados que todavía no cargaron el resultado', async () => {
    const partido = await crearPartidoPlantel();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    const fixture = await partidosService.listarFixture(GRUPO_ID);

    expect(fixture).toHaveLength(1);
    expect(fixture[0].estado).toBe('cerrado');
  });
});

describe('partidosService.actualizarPartido', () => {
  it('actualiza rival, notas tácticas y fecha de un partido abierto', async () => {
    const partido = await crearPartidoPlantel({ rival: 'Racing', notasTacticas: 'salen mal por la derecha' });

    const actualizado = await partidosService.actualizarPartido(partido.id, GRUPO_ID, {
      rival: 'River',
      notasTacticas: 'El arquero sale mal',
      fecha: '2099-02-01T20:00:00.000Z',
    });

    expect(actualizado.rival).toBe('River');
    expect(actualizado.notasTacticas).toBe('El arquero sale mal');
    expect(actualizado.fecha).toBe('2099-02-01T20:00:00.000Z');
  });

  it('permite borrar rival y notas pasando texto vacío', async () => {
    const partido = await crearPartidoPlantel({ rival: 'Racing', notasTacticas: 'nota' });

    const actualizado = await partidosService.actualizarPartido(partido.id, GRUPO_ID, {
      rival: '',
      notasTacticas: '   ',
    });

    expect(actualizado.rival).toBeNull();
    expect(actualizado.notasTacticas).toBeNull();
  });

  it('rechaza editar un partido cerrado', async () => {
    const partido = await crearPartidoPlantel();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(partidosService.actualizarPartido(partido.id, GRUPO_ID, { rival: 'River' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rechaza una fecha inválida', async () => {
    const partido = await crearPartidoPlantel();

    await expect(partidosService.actualizarPartido(partido.id, GRUPO_ID, { fecha: 'no-es-fecha' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rechaza con 404 si el partido pertenece a otro grupo', async () => {
    insertarGrupo({ id: 'grupo-otro', nombre: 'Otro grupo', modo: 'plantel' });
    const partido = await crearPartidoPlantel();

    await expect(partidosService.actualizarPartido(partido.id, 'grupo-otro', { rival: 'River' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('inscripcionesService.obtenerFormacion — plantel', () => {
  it('devuelve el modo plantel, el cupo y la formación guardada (o "automatico")', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);

    const formacion = await inscripcionesService.obtenerFormacion(partido.id, GRUPO_ID);

    expect(formacion.modo).toBe('plantel');
    expect(formacion.cupo).toBe(11);
    expect(formacion.formacionCodigo).toBe('automatico');
    expect(formacion.habilitado).toBe(true);
    expect(formacion.jugadores).toHaveLength(11);
  });

  it('habilitado es false si todavía no hay todos los titulares', async () => {
    const partido = await crearPartidoPlantel();
    insertarUsuario('jug-1', 'Jugador 1');
    insertarInscripcion({ id: 'ins-1', partidoId: partido.id, usuarioId: 'jug-1', tipo: 'titular' });

    const formacion = await inscripcionesService.obtenerFormacion(partido.id, GRUPO_ID);

    expect(formacion.habilitado).toBe(false);
    expect(formacion.jugadores).toHaveLength(1);
  });
});

describe('inscripcionesService.guardarFormacion — plantel', () => {
  it('guarda la pizarra de 11 con el esquema elegido y lo persiste en el partido', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);

    const formacion = await inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
      asignaciones: asignaciones433(),
      formacionCodigo: '4-3-3',
    });

    expect(formacion.modo).toBe('plantel');
    expect(formacion.formacionCodigo).toBe('4-3-3');
    expect(formacion.jugadores).toHaveLength(11);
    expect(formacion.jugadores.every((j) => j.equipo === 'A')).toBe(true);
    const codigoGuardado = mockDb.prepare('SELECT formacionCodigo FROM Partidos WHERE id = ?').get(partido.id);
    expect(codigoGuardado.formacionCodigo).toBe('4-3-3');
  });

  it('rechaza si falta un titular o aparece uno repetido', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    const mal = asignaciones433().slice(0, 10);
    mal.push({ ...mal[0] });

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: mal,
        formacionCodigo: '4-3-3',
      })
    ).rejects.toMatchObject({ status: 400, message: 'La formación debe incluir a todos los titulares, sin repetidos' });
  });

  it('rechaza a un jugador que no es titular del partido', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    insertarUsuario('supl-1', 'Suplente Uno');
    insertarInscripcion({ id: 'ins-sup', partidoId: partido.id, usuarioId: 'supl-1', tipo: 'suplente' });
    const mal = [...asignaciones433().slice(0, 10), { usuarioId: 'supl-1', linea: 'defensa', ordenLinea: 0 }];

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: mal,
        formacionCodigo: '4-3-3',
      })
    ).rejects.toMatchObject({ status: 400, message: 'La formación debe incluir a todos los titulares, sin repetidos' });
  });

  it('rechaza una posición que no existe en la formación elegida', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    const mal = asignaciones442();
    mal[1].linea = 'medioContencion';

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: mal,
        formacionCodigo: '4-4-2',
      })
    ).rejects.toMatchObject({
      status: 400,
      message: 'La línea "medioContencion" no forma parte de la formación elegida',
    });
  });

  it('rechaza un lado inválido', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    const mal = asignaciones433();
    mal[1].lado = 'centro';

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: mal,
        formacionCodigo: '4-3-3',
      })
    ).rejects.toMatchObject({ status: 400, message: 'lado inválido' });
  });

  it('rechaza dos jugadores en el mismo asiento', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    const mal = asignaciones433();
    mal[1].ordenLinea = mal[2].ordenLinea;

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: mal,
        formacionCodigo: '4-3-3',
      })
    ).rejects.toMatchObject({ status: 400, message: 'Hay dos jugadores en la misma posición' });
  });

  it('rechaza un ordenLinea fuera del alcance de la línea elegida', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    const mal = asignaciones433();
    // defensa tiene 4 asientos (0..3) en 4-3-3; ordenLinea 4 no existe.
    mal[1].ordenLinea = 4;

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: mal,
        formacionCodigo: '4-3-3',
      })
    ).rejects.toMatchObject({ status: 400, message: 'Posición fuera de la formación elegida' });
  });

  it('rechaza si el cupo de titulares no está completo', async () => {
    const partido = await crearPartidoPlantel();
    for (let i = 0; i < 10; i += 1) {
      insertarUsuario(`jug-${i + 1}`, `Jugador ${i + 1}`);
      insertarInscripcion({
        id: `ins-${i + 1}`,
        partidoId: partido.id,
        usuarioId: `jug-${i + 1}`,
        tipo: 'titular',
        posicionPrincipal: POSICIONES_ONCE[i],
      });
    }
    const diez = asignaciones433().slice(0, 10);

    await expect(
      inscripcionesService.guardarFormacion(partido.id, GRUPO_ID, {
        asignaciones: diez,
        formacionCodigo: '4-3-3',
      })
    ).rejects.toMatchObject({ status: 400, message: 'El cupo de titulares no está completo' });
  });
});

describe('inscripcionesService.generarFormacionAutomatica — plantel', () => {
  it('rellena los 11 asientos en el único equipo respetando el esquema elegido', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);

    const formacion = await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {
      A: { codigo: '4-3-3' },
    });

    expect(formacion.jugadores).toHaveLength(11);
    expect(formacion.jugadores.every((j) => j.equipo === 'A')).toBe(true);
    expect(formacion.formacionCodigo).toBe('4-3-3');
    const conteo = {};
    for (const jugador of formacion.jugadores) conteo[jugador.linea] = (conteo[jugador.linea] || 0) + 1;
    expect(conteo).toEqual({ arquero: 1, defensa: 4, medio: 3, delantero: 3 });
    const asientos = formacion.jugadores.map((j) => `${j.linea}-${j.ordenLinea}`);
    expect(new Set(asientos).size).toBe(11);
  });

  it('ubica al arquero anotado en el arco y acepta la selección sin equipo "A"', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);

    const formacion = await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {
      codigo: '4-4-2',
    });

    const arqueroEnCancha = formacion.jugadores.find((j) => j.linea === 'arquero');
    expect(arqueroEnCancha.usuarioId).toBe('jug-1');
    const conteo = {};
    for (const jugador of formacion.jugadores) conteo[jugador.linea] = (conteo[jugador.linea] || 0) + 1;
    expect(conteo).toEqual({ arquero: 1, defensa: 4, medio: 4, delantero: 2 });
  });

  it('rechaza si el cupo de titulares no está completo', async () => {
    const partido = await crearPartidoPlantel();
    insertarUsuario('jug-1', 'Jugador 1');
    insertarInscripcion({ id: 'ins-1', partidoId: partido.id, usuarioId: 'jug-1', tipo: 'titular' });

    await expect(inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {})).rejects.toMatchObject({
      status: 400,
      message: 'El cupo de titulares no está completo',
    });
  });
});

describe('resultadosService.guardarResultado — plantel', () => {
  async function crearPartidoCerradoConOnce() {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    return partido;
  }

  it('guarda goles sin selector de equipo, goles del rival y la figura elegida por el admin', async () => {
    const partido = await crearPartidoCerradoConOnce();

    const resultado = await resultadosService.guardarResultado(partido.id, GRUPO_ID, {
      goles: [
        { usuarioId: 'jug-9', minuto: 12, asistenciaUsuarioId: 'jug-6' },
        { usuarioId: 'jug-10', minuto: 34 },
      ],
      golesRival: 2,
      jugadorDestacadoId: 'jug-9',
    });

    expect(resultado.marcador).toEqual({ A: 2, B: 2 });
    expect(resultado.golesRival).toBe(2);
    expect(mockDb.prepare('SELECT estado FROM Partidos WHERE id = ?').get(partido.id).estado).toBe('jugado');
    const golesGuardados = mockDb
      .prepare('SELECT equipo, usuarioId FROM Goles WHERE partidoId = ? ORDER BY minuto')
      .all(partido.id);
    expect(golesGuardados).toHaveLength(2);
    expect(golesGuardados.every((g) => g.equipo === 'A')).toBe(true);
    const figura = mockDb.prepare('SELECT jugadorDestacadoId FROM Resultados WHERE partidoId = ?').get(partido.id);
    expect(figura.jugadorDestacadoId).toBe('jug-9');
  });

  it('los goles en contra suman para el rival en el marcador', async () => {
    const partido = await crearPartidoCerradoConOnce();

    const resultado = await resultadosService.guardarResultado(partido.id, GRUPO_ID, {
      goles: [
        { usuarioId: 'jug-9', minuto: 5 },
        { usuarioId: 'jug-3', minuto: 20, enContra: true },
      ],
      golesRival: 1,
    });

    expect(resultado.marcador).toEqual({ A: 1, B: 2 });
  });

  it('rechaza una figura que no es titular del partido', async () => {
    const partido = await crearPartidoCerradoConOnce();
    insertarUsuario('supl-1', 'Suplente Uno');
    insertarInscripcion({ id: 'ins-sup', partidoId: partido.id, usuarioId: 'supl-1', tipo: 'suplente' });

    await expect(
      resultadosService.guardarResultado(partido.id, GRUPO_ID, {
        goles: [],
        jugadorDestacadoId: 'supl-1',
      })
    ).rejects.toMatchObject({ status: 400, message: 'La figura debe ser uno de los titulares del partido' });
  });

  it('rechaza golesRival no numérico o negativo', async () => {
    const partido = await crearPartidoCerradoConOnce();

    await expect(
      resultadosService.guardarResultado(partido.id, GRUPO_ID, { goles: [], golesRival: -1 })
    ).rejects.toMatchObject({ status: 400, message: 'golesRival debe ser un entero mayor o igual a 0' });
  });

  it('rechaza un gol de un jugador que no está anotado', async () => {
    const partido = await crearPartidoCerradoConOnce();

    await expect(
      resultadosService.guardarResultado(partido.id, GRUPO_ID, {
        goles: [{ usuarioId: 'jug-99', minuto: 1 }],
      })
    ).rejects.toMatchObject({ status: 400, message: 'Jugador no elegible para el resultado' });
  });

  it('un gol en contra no puede llevar asistencia', async () => {
    const partido = await crearPartidoCerradoConOnce();

    await expect(
      resultadosService.guardarResultado(partido.id, GRUPO_ID, {
        goles: [{ usuarioId: 'jug-3', minuto: 20, enContra: true, asistenciaUsuarioId: 'jug-6' }],
      })
    ).rejects.toMatchObject({ status: 400, message: 'Un gol en contra no puede tener asistencia' });
  });
});

describe('resultadosService.obtenerResultado — figura en plantel', () => {
  it('devuelve la figura elegida por el admin en lugar del MVP votado', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    await inscripcionesService.generarFormacionAutomatica(partido.id, GRUPO_ID, {});
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {
      goles: [],
      golesRival: 0,
      jugadorDestacadoId: 'jug-5',
    });

    const resultado = await resultadosService.obtenerResultado(partido.id, GRUPO_ID);

    expect(resultado.jugadorDestacado.votos).toBeNull();
    expect(resultado.jugadorDestacado.totalElegibles).toBe(11);
    expect(resultado.jugadorDestacado.jugadores).toHaveLength(1);
    expect(resultado.jugadorDestacado.jugadores[0]).toMatchObject({
      usuarioId: 'jug-5',
      nombre: 'Jugador 5',
    });
  });
});

describe('estadisticasService — modo plantel', () => {
  it('cuenta partidos jugados, goles (sin en contra), asistencias y la figura como MVP', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partido.id);
    mockDb.prepare("UPDATE Inscripciones SET equipo = 'A' WHERE partidoId = ?").run(partido.id);
    mockDb
      .prepare(
        `INSERT INTO Goles (id, partidoId, usuarioId, asistenciaUsuarioId, equipo, minuto, enContra)
         VALUES ('g1', ?, 'jug-9', 'jug-6', 'A', 10, 0)`
      )
      .run(partido.id);
    mockDb
      .prepare(`INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, enContra) VALUES ('g2', ?, 'jug-9', 'A', 55, 1)`)
      .run(partido.id);
    mockDb
      .prepare(
        `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, golesRival, fechaCarga)
         VALUES ('r1', ?, 'jug-5', 1, '2026-01-01T00:00:00.000Z')`
      )
      .run(partido.id);

    const goleador = estadisticasService.obtenerEstadisticasJugador('jug-9', GRUPO_ID);
    expect(goleador.pj).toBe(1);
    expect(goleador.goles).toBe(1);
    const asistidor = estadisticasService.obtenerEstadisticasJugador('jug-6', GRUPO_ID);
    expect(asistidor.asistencias).toBe(1);
    expect(asistidor.goles).toBe(0);
    expect(estadisticasService.obtenerEstadisticasJugador('jug-5', GRUPO_ID).mvps).toBe(1);
    expect(estadisticasService.obtenerEstadisticasJugador('jug-1', GRUPO_ID).mvps).toBe(0);
  });

  it('la figura de plantel suma en los MVPs totales junto a los MVPs votados en otro grupo', async () => {
    const partido = await crearPartidoPlantel();
    await crearPartidoConOnce(partido.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partido.id);
    mockDb
      .prepare(
        `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, golesRival, fechaCarga)
         VALUES ('r-plantel', ?, 'jug-5', 0, '2026-01-01T00:00:00.000Z')`
      )
      .run(partido.id);

    insertarGrupo({ id: 'grupo-conv', nombre: 'La Convocatoria', modo: 'convocatoria' });
    insertarMembresia('grupo-conv', ADMIN_UID, 'mem-2');
    const partidoConv = await partidosService.crearPartido({
      fecha: '2098-01-01T20:00:00.000Z',
      cupoTitulares: 2,
      cupoSuplentes: 1,
      creadoPor: ADMIN_UID,
      grupoId: 'grupo-conv',
    });
    mockDb
      .prepare(`INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId) VALUES ('v-conv', ?, 'votante-1', 'jug-5')`)
      .run(partidoConv.id);

    const totales = estadisticasService.obtenerEstadisticasTotalesJugador('jug-5');

    expect(totales.mvps).toBe(2);
  });
});
