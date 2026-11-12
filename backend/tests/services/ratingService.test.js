const crypto = require('node:crypto');
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');
const { inicializarHabilidades, procesarPartido } = require('../../src/services/ratingService');
const { CAMPOS_HABILIDAD } = require('../../src/services/usuariosService');

const GRUPO_ID = 'grupo-1';

async function crearUsuario(overrides = {}) {
  return usuariosService.sincronizarUsuario({
    uid: 'u1',
    email: 'u1@gmail.com',
    nombre: 'Usuario Uno',
    ...overrides,
  });
}

async function crearPartido(overrides = {}) {
  const admin = await crearUsuario({ uid: 'admin-1', email: 'admin@gmail.com' });
  return partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 1,
    creadoPor: admin.uid,
    grupoId: GRUPO_ID,
    ...overrides,
  });
}

function insertarInscripcion({ id, partidoId, usuarioId, tipo = 'titular', posicionPrincipal = 'delantero', equipo = null }) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, equipo)
       VALUES (@id, @partidoId, @usuarioId, 'anotado', @tipo, 0, '2026-01-01T00:00:00.000Z', @posicionPrincipal, @equipo)`
    )
    .run({ id, partidoId, usuarioId, tipo, posicionPrincipal, equipo });
}

function insertarVotos({ partidoId, jugadorId, votos }) {
  // votos is an array of { votanteId, puntaje }
  for (const v of votos) {
    mockDb
      .prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
         VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)`
      )
      .run({ id: crypto.randomUUID(), partidoId, jugadorId, votanteId: v.votanteId, puntaje: v.puntaje });
  }
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM VotosMvp');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (?, 'Grupo de test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run(GRUPO_ID);
});

describe('inicializarHabilidades', () => {
  test('distributes rating by position weights', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 20, pegada: 15, tocaPase: 20, gambeta: 15, marcaDefensa: 15, fisico: 15 };
    const puntajeEscalado = 70;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    // Weighted: each skill = puntajeEscalado * (peso / totalPeso)
    // Total = 100, so skills = 70 * (weight/100)
    expect(result.velocidad).toBeCloseTo(14); // 70 * 0.20
    expect(result.pegada).toBeCloseTo(10.5); // 70 * 0.15
  });

  test('works with decimal weights summing to 1 (PESOS_POSICION format)', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 0.225, pegada: 0.275, tocaPase: 0.125, gambeta: 0.25, marcaDefensa: 0.05, fisico: 0.075 };
    const puntajeEscalado = 80;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    // Total = 1.0, so skills = 80 * weight
    expect(result.velocidad).toBeCloseTo(18); // 80 * 0.225
    expect(result.pegada).toBeCloseTo(22); // 80 * 0.275
    expect(result.tocaPase).toBeCloseTo(10); // 80 * 0.125
    expect(result.gambeta).toBeCloseTo(20); // 80 * 0.25
    expect(result.marcaDefensa).toBeCloseTo(4); // 80 * 0.05
    expect(result.fisico).toBeCloseTo(6); // 80 * 0.075
  });

  test('uses 0 for missing weight fields', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 50, pegada: 50 }; // missing other fields
    const puntajeEscalado = 60;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    expect(result.velocidad).toBeCloseTo(30); // 60 * 0.5
    expect(result.pegada).toBeCloseTo(30); // 60 * 0.5
    expect(result.tocaPase).toBe(0);
    expect(result.gambeta).toBe(0);
    expect(result.marcaDefensa).toBe(0);
    expect(result.fisico).toBe(0);
  });

  test('returns all 6 CAMPOS_HABILIDAD fields', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 100 };
    const puntajeEscalado = 50;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    for (const campo of CAMPOS_HABILIDAD) {
      expect(result).toHaveProperty(campo);
      expect(typeof result[campo]).toBe('number');
    }
  });

  test('rounds to 2 decimal places', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 33, pegada: 33, tocaPase: 34 }; // totals to 100
    const puntajeEscalado = 100;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    // 100 * 33/100 = 33, 100 * 34/100 = 34
    expect(result.velocidad).toBe(33);
    expect(result.pegada).toBe(33);
    expect(result.tocaPase).toBe(34);
  });
});

describe('procesarPartido', () => {
  test('initializes skills for new player with all null skills', async () => {
    const partido = await crearPartido();
    await crearUsuario({ uid: 'nuevo-jugador', email: 'nuevo@gmail.com', nombre: 'Nuevo Jugador' });
    insertarInscripcion({
      id: 'i1',
      partidoId: partido.id,
      usuarioId: 'nuevo-jugador',
      tipo: 'titular',
      posicionPrincipal: 'delantero',
      equipo: 'A'
    });
    // Add votes from teammates - need at least 2 voters for olympic average
    await crearUsuario({ uid: 'votante1', email: 'v1@gmail.com', nombre: 'Votante 1' });
    await crearUsuario({ uid: 'votante2', email: 'v2@gmail.com', nombre: 'Votante 2' });
    insertarInscripcion({
      id: 'i2',
      partidoId: partido.id,
      usuarioId: 'votante1',
      tipo: 'titular',
      posicionPrincipal: 'mediocampista',
      equipo: 'B'
    });
    insertarInscripcion({
      id: 'i3',
      partidoId: partido.id,
      usuarioId: 'votante2',
      tipo: 'titular',
      posicionPrincipal: 'defensor',
      equipo: 'A'
    });

    // Mark partido as played
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {});

    // Add votes for nuevo-jugador (average = 7, olympic average = 7)
    insertarVotos({
      partidoId: partido.id,
      jugadorId: 'nuevo-jugador',
      votos: [
        { votanteId: 'votante1', puntaje: 7 },
        { votanteId: 'votante2', puntaje: 7 },
      ]
    });

    // Call procesarPartido
    const elegibles = (await resultadosService.obtenerElegibles(partido.id)).filter(id => id === 'nuevo-jugador');
    const result = procesarPartido(partido.id, elegibles);

    // Assert: player in procesados (not saltados), skills initialized
    expect(result.procesados).toHaveLength(1);
    expect(result.procesados[0].usuarioId).toBe('nuevo-jugador');
    expect(result.procesados[0].inicializado).toBe(true);
    expect(result.procesados[0].habilidadesInicializadas).toEqual(CAMPOS_HABILIDAD);
    expect(result.saltados).toHaveLength(0);

    // Verify skills were initialized in DB
    const usuario = mockDb.prepare('SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico FROM Usuarios WHERE uid = ?').get('nuevo-jugador');
    for (const campo of CAMPOS_HABILIDAD) {
      expect(usuario[campo]).not.toBeNull();
      expect(typeof usuario[campo]).toBe('number');
      expect(usuario[campo]).toBeGreaterThanOrEqual(0);
      expect(usuario[campo]).toBeLessThanOrEqual(100);
    }
  });

  test('initializes only missing skills for partial profile', async () => {
    const partido = await crearPartido();
    // Create user with some skills set, some null
    await usuariosService.sincronizarUsuario({
      uid: 'jugador-parcial',
      email: 'parcial@gmail.com',
      nombre: 'Jugador Parcial',
    });
    // Set some skills manually
    mockDb.prepare(
      `UPDATE Usuarios SET
         velocidad = 60,
         pegada = 50,
         tocaPase = NULL,
         gambeta = NULL,
         marcaDefensa = 40,
         fisico = NULL
       WHERE uid = ?`
    ).run('jugador-parcial');

    insertarInscripcion({
      id: 'i1',
      partidoId: partido.id,
      usuarioId: 'jugador-parcial',
      tipo: 'titular',
      posicionPrincipal: 'mediocampista',
      equipo: 'A'
    });
    // Add votes from teammates
    await crearUsuario({ uid: 'votante1', email: 'v1@gmail.com', nombre: 'Votante 1' });
    await crearUsuario({ uid: 'votante2', email: 'v2@gmail.com', nombre: 'Votante 2' });
    await crearUsuario({ uid: 'votante3', email: 'v3@gmail.com', nombre: 'Votante 3' });
    insertarInscripcion({
      id: 'i2',
      partidoId: partido.id,
      usuarioId: 'votante1',
      tipo: 'titular',
      posicionPrincipal: 'delantero',
      equipo: 'B'
    });
    insertarInscripcion({
      id: 'i3',
      partidoId: partido.id,
      usuarioId: 'votante2',
      tipo: 'titular',
      posicionPrincipal: 'defensor',
      equipo: 'A'
    });
    insertarInscripcion({
      id: 'i4',
      partidoId: partido.id,
      usuarioId: 'votante3',
      tipo: 'titular',
      posicionPrincipal: 'arquero',
      equipo: 'B'
    });

    // Mark partido as played
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {});

    // Add votes for jugador-parcial (average = 8, olympic average = 8)
    insertarVotos({
      partidoId: partido.id,
      jugadorId: 'jugador-parcial',
      votos: [
        { votanteId: 'votante1', puntaje: 8 },
        { votanteId: 'votante2', puntaje: 8 },
        { votanteId: 'votante3', puntaje: 8 },
      ]
    });

    // Call procesarPartido
    const elegibles = (await resultadosService.obtenerElegibles(partido.id)).filter(id => id === 'jugador-parcial');
    const result = procesarPartido(partido.id, elegibles);

    // Assert: player in procesados, skills initialized
    expect(result.procesados).toHaveLength(1);
    expect(result.procesados[0].usuarioId).toBe('jugador-parcial');
    expect(result.procesados[0].inicializado).toBe(true);
    // Should have initialized the 3 missing skills: tocaPase, gambeta, fisico
    expect(result.procesados[0].habilidadesInicializadas).toContain('tocaPase');
    expect(result.procesados[0].habilidadesInicializadas).toContain('gambeta');
    expect(result.procesados[0].habilidadesInicializadas).toContain('fisico');
    expect(result.procesados[0].habilidadesInicializadas).not.toContain('velocidad');
    expect(result.procesados[0].habilidadesInicializadas).not.toContain('pegada');
    expect(result.procesados[0].habilidadesInicializadas).not.toContain('marcaDefensa');
    expect(result.saltados).toHaveLength(0);

    // Verify existing skills were preserved (but evolved), missing skills initialized
    const usuario = mockDb.prepare('SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico FROM Usuarios WHERE uid = ?').get('jugador-parcial');
    // Original values: velocidad=60, pegada=50, marcaDefensa=40, tocaPase=null, gambeta=null, fisico=null
    // After initialization with mediocampista weights and puntajeEscalado=80 (8*10), then delta applied
    // The initialized skills should be non-null and the existing ones should have changed
    expect(usuario.tocaPase).not.toBeNull();
    expect(usuario.gambeta).not.toBeNull();
    expect(usuario.fisico).not.toBeNull();
    expect(usuario.velocidad).not.toBe(60); // Should have evolved
    expect(usuario.pegada).not.toBe(50); // Should have evolved
    expect(usuario.marcaDefensa).not.toBe(40); // Should have evolved
  });

  test('normal Elo evolution for player with complete skills', async () => {
    const partido = await crearPartido();
    // Create user with all skills set
    await usuariosService.sincronizarUsuario({
      uid: 'jugador-completo',
      email: 'completo@gmail.com',
      nombre: 'Jugador Completo',
    });
    // Set all skills
    mockDb.prepare(
      `UPDATE Usuarios SET
         velocidad = 60,
         pegada = 55,
         tocaPase = 70,
         gambeta = 65,
         marcaDefensa = 50,
         fisico = 60
       WHERE uid = ?`
    ).run('jugador-completo');

    insertarInscripcion({
      id: 'i1',
      partidoId: partido.id,
      usuarioId: 'jugador-completo',
      tipo: 'titular',
      posicionPrincipal: 'delantero',
      equipo: 'A'
    });
    // Add votes from teammates
    await crearUsuario({ uid: 'votante1', email: 'v1@gmail.com', nombre: 'Votante 1' });
    await crearUsuario({ uid: 'votante2', email: 'v2@gmail.com', nombre: 'Votante 2' });
    insertarInscripcion({
      id: 'i2',
      partidoId: partido.id,
      usuarioId: 'votante1',
      tipo: 'titular',
      posicionPrincipal: 'mediocampista',
      equipo: 'B'
    });
    insertarInscripcion({
      id: 'i3',
      partidoId: partido.id,
      usuarioId: 'votante2',
      tipo: 'titular',
      posicionPrincipal: 'defensor',
      equipo: 'A'
    });

    // Mark partido as played
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {});

    // Add votes for jugador-completo (average = 9, olympic average = 9)
    insertarVotos({
      partidoId: partido.id,
      jugadorId: 'jugador-completo',
      votos: [
        { votanteId: 'votante1', puntaje: 9 },
        { votanteId: 'votante2', puntaje: 9 },
      ]
    });

    // Call procesarPartido
    const elegibles = (await resultadosService.obtenerElegibles(partido.id)).filter(id => id === 'jugador-completo');
    const result = procesarPartido(partido.id, elegibles);

    // Assert: player in procesados, normal evolution (not initialized)
    expect(result.procesados).toHaveLength(1);
    expect(result.procesados[0].usuarioId).toBe('jugador-completo');
    expect(result.procesados[0].inicializado).toBeUndefined();
    expect(result.procesados[0].habilidadesInicializadas).toBeUndefined();
    expect(result.saltados).toHaveLength(0);

    // Verify skills evolved from original values
    const usuario = mockDb.prepare('SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico FROM Usuarios WHERE uid = ?').get('jugador-completo');
    expect(usuario.velocidad).not.toBe(60);
    expect(usuario.pegada).not.toBe(55);
    expect(usuario.tocaPase).not.toBe(70);
    expect(usuario.gambeta).not.toBe(65);
    expect(usuario.marcaDefensa).not.toBe(50);
    expect(usuario.fisico).not.toBe(60);
  });
});