const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const crypto = require('node:crypto');
const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');
const apuestasService = require('../../src/services/apuestasService');

const GRUPO_ID = 'grupo-test-1';

async function setupTestData() {
  // Clean up
  mockDb.exec('DELETE FROM Apuestas');
  mockDb.exec('DELETE FROM UsuarioPuntos');
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM VotosMvp');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  mockDb.exec('DELETE FROM Invitados');

  // Create grupo
  mockDb.prepare(`
    INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion, modo)
    VALUES (?, 'Grupo Test', 'TEST-001', 'admin-1', '2026-01-01T00:00:00.000Z', 'convocatoria')
  `).run(GRUPO_ID);

  // Create admin user
  await usuariosService.sincronizarUsuario({
    uid: 'admin-1',
    email: 'admin@test.com',
    nombre: 'Admin User',
    emailVerificado: true,
  });

  // Create regular users
  await usuariosService.sincronizarUsuario({
    uid: 'user-1',
    email: 'user1@test.com',
    nombre: 'User Uno',
    emailVerificado: true,
  });

  await usuariosService.sincronizarUsuario({
    uid: 'user-2',
    email: 'user2@test.com',
    nombre: 'User Dos',
    emailVerificado: true,
  });

  await usuariosService.sincronizarUsuario({
    uid: 'user-3',
    email: 'user3@test.com',
    nombre: 'User Tres',
    emailVerificado: true,
  });

  // Create match with full capacity (titulares)
  const partido = await partidosService.crearPartido({
    fecha: '2099-01-01T20:00:00.000Z',
    cupoTitulares: 2,
    cupoSuplentes: 1,
    creadoPor: 'admin-1',
    grupoId: GRUPO_ID,
  });

  // Add inscriptions (2 titulares per team = 4 total, but cupoTitulares=2 means 2 per team)
  // For convocatoria mode: 2 titulares total (1 per team) or 2 per team?
  // Let's assume 2 titulares total = 1 per team
  mockDb.prepare(`
    INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, equipo)
    VALUES (?, ?, ?, 'anotado', 'titular', ?, '2026-01-01T00:00:00.000Z', 'delantero', ?)
  `).run('ins-1', partido.id, 'user-1', 1, 'A');
  mockDb.prepare(`
    INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, equipo)
    VALUES (?, ?, ?, 'anotado', 'titular', ?, '2026-01-01T00:00:00.000Z', 'delantero', ?)
  `).run('ins-2', partido.id, 'user-2', 1, 'B');
  mockDb.prepare(`
    INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, posicionPrincipal, equipo)
    VALUES (?, ?, ?, 'anotado', 'suplente', ?, '2026-01-01T00:00:00.000Z', 'mediocampista', ?)
  `).run('ins-3', partido.id, 'user-3', 2, 'A');

  // Set formation (final)
  mockDb.prepare(`
    UPDATE Inscripciones SET
      equipo = CASE WHEN usuarioId = 'user-1' THEN 'A' WHEN usuarioId = 'user-2' THEN 'B' ELSE 'A' END,
      linea = 'delantera',
      ordenLinea = 1,
      lado = 'centro'
    WHERE partidoId = ?
  `).run(partido.id);

  // Close team voting (votacionEquiposCerrada = 1)
  mockDb.prepare("UPDATE Partidos SET votacionEquiposCerrada = 1 WHERE id = ?").run(partido.id);

  return { partido, grupoId: GRUPO_ID };
}

describe('Apuestas Service', () => {
  let testData;

  beforeEach(async () => {
    testData = await setupTestData();
  });

  describe('obtenerSaldo', () => {
    test('returns 100 for new user', async () => {
      const saldo = await apuestasService.obtenerSaldo('user-1');
      expect(saldo).toBe(100);
    });

    test('returns 0 for non-existent user (or creates with 100?)', async () => {
      // Based on our design, all users should have UsuarioPuntos from auth sync
      // But let's test the service handles missing rows gracefully
      const saldo = await apuestasService.obtenerSaldo('non-existent-user');
      expect(saldo).toBe(0); // or should it throw? We'll decide
    });
  });

  describe('obtenerPartidosApostables', () => {
    test('returns match with votacionEquiposCerrada and formaciones', async () => {
      const partidos = await apuestasService.obtenerPartidosApostables(testData.grupoId);
      expect(partidos).toHaveLength(1);
      expect(partidos[0].id).toBe(testData.partido.id);
      expect(partidos[0].votacionEquiposCerrada).toBe(1);
    });

    test('excludes matches without votacionEquiposCerrada', async () => {
      // Create another match without closed voting
      const partido2 = await partidosService.crearPartido({
        fecha: '2099-01-08T20:00:00.000Z',
        cupoTitulares: 2,
        cupoSuplentes: 1,
        creadoPor: 'admin-1',
        grupoId: GRUPO_ID,
      });
      const partidos = await apuestasService.obtenerPartidosApostables(GRUPO_ID);
      expect(partidos).toHaveLength(1); // Only the first one
    });

    test('excludes matches that are not estado=abierto', async () => {
      mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(testData.partido.id);
      const partidos = await apuestasService.obtenerPartidosApostables(GRUPO_ID);
      expect(partidos).toHaveLength(0);
    });
  });

  describe('obtenerOpcionesPartido', () => {
    test('returns all bet types with correct options and odds', async () => {
      const opciones = await apuestasService.obtenerOpcionesPartido(testData.partido.id, GRUPO_ID);

      expect(opciones.winner).toBeDefined();
      expect(opciones.winner.length).toBeGreaterThan(0);
      expect(opciones.loser).toBeDefined();
      expect(opciones.total_goals_exact).toBeDefined();
      expect(opciones.total_goals_over).toBeDefined();
      expect(opciones.total_goals_under).toBeDefined();
      expect(opciones.goal_scorer_anytime).toBeDefined();
      expect(opciones.goal_scorer_first).toBeDefined();
      expect(opciones.assist_provider).toBeDefined();
      expect(opciones.mvp).toBeDefined();
      expect(opciones.exact_score).toBeDefined();

      // Check structure of options
      expect(opciones.winner[0]).toHaveProperty('valor');
      expect(opciones.winner[0]).toHaveProperty('etiqueta');
      expect(opciones.winner[0]).toHaveProperty('cuota');
    });

    test('goal_scorer options include players from match', async () => {
      const opciones = await apuestasService.obtenerOpcionesPartido(testData.partido.id, GRUPO_ID);

      const scorerOptions = opciones.goal_scorer_anytime;
      expect(scorerOptions.length).toBeGreaterThan(0);
      expect(scorerOptions[0]).toHaveProperty('jugador');
      expect(scorerOptions[0].jugador).toHaveProperty('uid');
      expect(scorerOptions[0].jugador).toHaveProperty('nombre');
    });
  });

  describe('crearApuestas', () => {
    test('creates bet and reserves balance', async () => {
      const result = await apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'winner', seleccion: 'A', monto: 50 }]
      );

      expect(result.apuestas).toHaveLength(1);
      expect(result.apuestas[0].estado).toBe('pendiente');
      expect(result.apuestas[0].gananciaPotencial).toBe(90); // 50 * 1.8
      expect(result.nuevoSaldo).toBe(50); // 100 - 50 reserved
    });

    test('rejects insufficient balance', async () => {
      await expect(apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'winner', seleccion: 'A', monto: 200 }] // More than 100
      )).rejects.toThrow('Saldo insuficiente');
    });

    test('rejects zero or negative amount', async () => {
      await expect(apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'winner', seleccion: 'A', monto: 0 }]
      )).rejects.toThrow('Monto inválido');
    });

    test('allows multiple bets in one call', async () => {
      const result = await apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [
          { tipo: 'winner', seleccion: 'A', monto: 30 },
          { tipo: 'total_goals_exact', seleccion: '2', monto: 20 }
        ]
      );

      expect(result.apuestas).toHaveLength(2);
      expect(result.nuevoSaldo).toBe(50); // 100 - 30 - 20
    });

    test('rejects bet on non-apostable match', async () => {
      // Create match without closed voting
      const partido2 = await partidosService.crearPartido({
        fecha: '2099-01-08T20:00:00.000Z',
        cupoTitulares: 2,
        cupoSuplentes: 1,
        creadoPor: 'admin-1',
        grupoId: GRUPO_ID,
      });

      await expect(apuestasService.crearApuestas(
        partido2.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'winner', seleccion: 'A', monto: 50 }]
      )).rejects.toThrow('Partido no disponible para apostar');
    });

    test('rejects invalid bet type', async () => {
      await expect(apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'invalid_type', seleccion: 'A', monto: 50 }]
      )).rejects.toThrow('Tipo de apuesta inválido');
    });

    test('rejects invalid selection for bet type', async () => {
      await expect(apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'winner', seleccion: 'C', monto: 50 }] // No team C
      )).rejects.toThrow('Selección inválida');
    });
  });

  describe('obtenerMisApuestas', () => {
    test('returns user bets with match info', async () => {
      // Create some bets
      await apuestasService.crearApuestas(
        testData.partido.id,
        GRUPO_ID,
        'user-1',
        [{ tipo: 'winner', seleccion: 'A', monto: 50 }]
      );

      const apuestas = await apuestasService.obtenerMisApuestas('user-1', GRUPO_ID);
      expect(apuestas).toHaveLength(1);
      expect(apuestas[0].tipo).toBe('winner');
      expect(apuestas[0].monto).toBe(50);
      expect(apuestas[0].partidoId).toBe(testData.partido.id);
    });
  });
});