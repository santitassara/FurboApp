const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const crypto = require('node:crypto');
const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');
const votosService = require('../../src/services/votosService');
const estadisticasService = require('../../src/services/estadisticasService');
const { cerrarVotacion, procesarPartido } = require('../../src/services/ratingService');
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

describe('Integration: Rating initialization flow', () => {
  test('new player gets skills initialized on first match, valoración reflects OVR', async () => {
    // 1. Create user with null skills
    await usuariosService.sincronizarUsuario({
      uid: 'nuevo-jugador',
      email: 'nuevo@gmail.com',
      nombre: 'Nuevo Jugador',
    });

    // 2. Create match, mark as played
    const partido = await crearPartido();
    insertarInscripcion({
      id: 'i1',
      partidoId: partido.id,
      usuarioId: 'nuevo-jugador',
      tipo: 'titular',
      posicionPrincipal: 'delantero',
      equipo: 'A'
    });
    // Add voters
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

    // 3. Add votes from teammates (average = 7, olympic average = 7)
    insertarVotos({
      partidoId: partido.id,
      jugadorId: 'nuevo-jugador',
      votos: [
        { votanteId: 'votante1', puntaje: 7 },
        { votanteId: 'votante2', puntaje: 7 },
      ]
    });

    // 4. Close voting
    const resultado = await cerrarVotacion(partido.id, GRUPO_ID);

    // 5. Verify: user skills initialized with position weights
    expect(resultado.procesados).toHaveLength(1);
    expect(resultado.procesados[0].usuarioId).toBe('nuevo-jugador');
    expect(resultado.procesados[0].inicializado).toBe(true);
    expect(resultado.procesados[0].habilidadesInicializadas).toEqual(CAMPOS_HABILIDAD);

    // Check skills in DB
    const usuario = mockDb.prepare('SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico FROM Usuarios WHERE uid = ?').get('nuevo-jugador');
    for (const campo of CAMPOS_HABILIDAD) {
      expect(usuario[campo]).not.toBeNull();
      expect(typeof usuario[campo]).toBe('number');
      expect(usuario[campo]).toBeGreaterThanOrEqual(0);
      expect(usuario[campo]).toBeLessThanOrEqual(100);
    }

    // 6. Call obtenerEstadisticasJugador
    const stats = await estadisticasService.obtenerEstadisticasJugador('nuevo-jugador', GRUPO_ID);

    // 7. Verify: valoracion === OVR
    // Calculate expected OVR from the skills
    const ovr = CAMPOS_HABILIDAD.reduce((sum, c) => sum + usuario[c], 0) / CAMPOS_HABILIDAD.length;
    const expectedValoracion = parseFloat(ovr).toFixed(1);
    expect(stats.valoracion).toBe(expectedValoracion);

    // 8. Second match: verify normal Elo evolution
    // Create second match
    const partido2 = await crearPartido({ fecha: '2099-01-08T20:00:00.000Z' });
    insertarInscripcion({
      id: 'i4',
      partidoId: partido2.id,
      usuarioId: 'nuevo-jugador',
      tipo: 'titular',
      posicionPrincipal: 'delantero',
      equipo: 'A'
    });
    // Voters also play in second match
    insertarInscripcion({
      id: 'i5',
      partidoId: partido2.id,
      usuarioId: 'votante1',
      tipo: 'titular',
      posicionPrincipal: 'mediocampista',
      equipo: 'B'
    });
    insertarInscripcion({
      id: 'i6',
      partidoId: partido2.id,
      usuarioId: 'votante2',
      tipo: 'titular',
      posicionPrincipal: 'defensor',
      equipo: 'A'
    });

    // Mark partido2 as played
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partido2.id);
    await resultadosService.guardarResultado(partido2.id, GRUPO_ID, {});

    // Add votes for second match (higher rating = 9)
    insertarVotos({
      partidoId: partido2.id,
      jugadorId: 'nuevo-jugador',
      votos: [
        { votanteId: 'votante1', puntaje: 9 },
        { votanteId: 'votante2', puntaje: 9 },
      ]
    });

    // Close voting for second match
    const resultado2 = await cerrarVotacion(partido2.id, GRUPO_ID);

    // Verify: normal Elo evolution (not initialized)
    expect(resultado2.procesados).toHaveLength(1);
    expect(resultado2.procesados[0].usuarioId).toBe('nuevo-jugador');
    expect(resultado2.procesados[0].inicializado).toBeUndefined();
    expect(resultado2.procesados[0].habilidadesInicializadas).toBeUndefined();

    // Skills should have evolved from first match values
    const usuario2 = mockDb.prepare('SELECT velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico FROM Usuarios WHERE uid = ?').get('nuevo-jugador');
    for (const campo of CAMPOS_HABILIDAD) {
      expect(usuario2[campo]).not.toBe(usuario[campo]); // Should have changed
    }

    // Check stats again - valoracion should reflect updated OVR
    const stats2 = await estadisticasService.obtenerEstadisticasJugador('nuevo-jugador', GRUPO_ID);
    const ovr2 = CAMPOS_HABILIDAD.reduce((sum, c) => sum + usuario2[c], 0) / CAMPOS_HABILIDAD.length;
    const expectedValoracion2 = parseFloat(ovr2).toFixed(1);
    expect(stats2.valoracion).toBe(expectedValoracion2);
  });
});