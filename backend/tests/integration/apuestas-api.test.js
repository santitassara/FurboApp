const crypto = require('node:crypto');
const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

// Mock token verification BEFORE requiring app
jest.mock('../../src/utils/verificarTokenValor', () => {
  return jest.fn(async (token) => {
    const uid = token.replace('test-token-', '');
    // Verify user exists in DB
    const user = mockDb.prepare('SELECT * FROM Usuarios WHERE uid = ?').get(uid);
    if (!user) return null;
    return { uid, email: user.email, nombre: user.nombre };
  });
});

const request = require('supertest');
const app = require('../../src/app');
const usuariosService = require('../../src/services/usuariosService');
const gruposService = require('../../src/services/gruposService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

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
  // Add admin to group
  mockDb.prepare(`
    INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
    VALUES (?, ?, 'admin-1', 'admin', 0, '2026-01-01T00:00:00.000Z')
  `).run(crypto.randomUUID(), GRUPO_ID);

  // Create regular users
  await usuariosService.sincronizarUsuario({
    uid: 'user-1',
    email: 'user1@test.com',
    nombre: 'User Uno',
    emailVerificado: true,
  });
  mockDb.prepare(`
    INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
    VALUES (?, ?, 'user-1', 'jugador', 0, '2026-01-01T00:00:00.000Z')
  `).run(crypto.randomUUID(), GRUPO_ID);

  await usuariosService.sincronizarUsuario({
    uid: 'user-2',
    email: 'user2@test.com',
    nombre: 'User Dos',
    emailVerificado: true,
  });
  mockDb.prepare(`
    INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
    VALUES (?, ?, 'user-2', 'jugador', 0, '2026-01-01T00:00:00.000Z')
  `).run(crypto.randomUUID(), GRUPO_ID);

  await usuariosService.sincronizarUsuario({
    uid: 'user-3',
    email: 'user3@test.com',
    nombre: 'User Tres',
    emailVerificado: true,
  });
  mockDb.prepare(`
    INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
    VALUES (?, ?, 'user-3', 'jugador', 0, '2026-01-01T00:00:00.000Z')
  `).run(crypto.randomUUID(), GRUPO_ID);

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

describe('Apuestas API Routes', () => {
  let testData;
  let agent;

  beforeEach(async () => {
    testData = await setupTestData();
    agent = request.agent(app);
  });

  // Helper to get auth header for a user
  function getAuthHeader(uid) {
    return { Authorization: `Bearer test-token-${uid}` };
  }

  describe('GET /api/grupos/:grupoId/apuestas/partidos-disponibles', () => {
    test('returns empty array when no matches available', async () => {
      // Create another grupo with no matches
      const grupoVacio = 'grupo-vacio';
      mockDb.prepare(`
        INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion, modo)
        VALUES (?, 'Grupo Vacio', 'VACIO-001', 'admin-1', '2026-01-01T00:00:00.000Z', 'convocatoria')
      `).run(grupoVacio);
      mockDb.prepare(`
        INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
        VALUES (?, ?, 'user-1', 'jugador', 0, '2026-01-01T00:00:00.000Z')
      `).run(crypto.randomUUID(), grupoVacio);

      const response = await agent
        .get(`/api/grupos/${grupoVacio}/apuestas/partidos-disponibles`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('returns matches with votacionEquiposCerrada and formaciones', async () => {
      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partidos-disponibles`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(testData.partido.id);
      expect(response.body[0].votacionEquiposCerrada).toBe(1);
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

      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partidos-disponibles`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body).toHaveLength(1); // Only the first one
      expect(response.body[0].id).toBe(testData.partido.id);
    });

    test('excludes matches that are not estado=abierto', async () => {
      mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(testData.partido.id);

      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partidos-disponibles`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    test('returns 401 without auth token', async () => {
      await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partidos-disponibles`)
        .expect(401);
    });

    test('returns 403 for non-member', async () => {
      // user-1 is not in GRUPO_ID in this test (they would be, but let's test with outsider)
      await usuariosService.sincronizarUsuario({
        uid: 'outsider',
        email: 'outsider@test.com',
        nombre: 'Outsider',
        emailVerificado: true,
      });

      await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partidos-disponibles`)
        .set(getAuthHeader('outsider'))
        .expect(403);
    });
  });

  describe('GET /api/grupos/:grupoId/apuestas/saldo', () => {
    test('returns user balance', async () => {
      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/saldo`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body).toHaveProperty('saldo');
      expect(response.body.saldo).toBe(100);
    });

    test('returns 401 without auth token', async () => {
      await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/saldo`)
        .expect(401);
    });
  });

  describe('GET /api/grupos/:grupoId/apuestas/partido/:partidoId/opciones', () => {
    test('returns bet catalog with all bet types', async () => {
      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/opciones`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body.winner).toBeDefined();
      expect(response.body.loser).toBeDefined();
      expect(response.body.total_goals_exact).toBeDefined();
      expect(response.body.total_goals_over).toBeDefined();
      expect(response.body.total_goals_under).toBeDefined();
      expect(response.body.goal_scorer_anytime).toBeDefined();
      expect(response.body.goal_scorer_first).toBeDefined();
      expect(response.body.assist_provider).toBeDefined();
      expect(response.body.mvp).toBeDefined();
      expect(response.body.exact_score).toBeDefined();

      // Check structure
      expect(response.body.winner[0]).toHaveProperty('valor');
      expect(response.body.winner[0]).toHaveProperty('etiqueta');
      expect(response.body.winner[0]).toHaveProperty('cuota');
    });

    test('goal_scorer options include players from match', async () => {
      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/opciones`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      const scorerOptions = response.body.goal_scorer_anytime;
      expect(scorerOptions.length).toBeGreaterThan(0);
      expect(scorerOptions[0]).toHaveProperty('jugador');
      expect(scorerOptions[0].jugador).toHaveProperty('uid');
      expect(scorerOptions[0].jugador).toHaveProperty('nombre');
    });

    test('returns 404 for non-existent match', async () => {
      await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partido/non-existent/opciones`)
        .set(getAuthHeader('user-1'))
        .expect(404);
    });

    test('returns 403 for non-member', async () => {
      await usuariosService.sincronizarUsuario({
        uid: 'outsider',
        email: 'outsider@test.com',
        nombre: 'Outsider',
        emailVerificado: true,
      });

      await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/opciones`)
        .set(getAuthHeader('outsider'))
        .expect(403);
    });
  });

  describe('POST /api/grupos/:grupoId/apuestas/partido/:partidoId/apostar', () => {
    test('creates bet and reserves balance', async () => {
      const response = await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(201);

      expect(response.body.apuestas).toHaveLength(1);
      expect(response.body.apuestas[0].estado).toBe('pendiente');
      expect(response.body.apuestas[0].gananciaPotencial).toBe(90); // 50 * 1.8
      expect(response.body.nuevoSaldo).toBe(50); // 100 - 50 reserved
    });

    test('rejects insufficient balance', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 200 }] })
        .expect(400);
    });

    test('rejects zero or negative amount', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 0 }] })
        .expect(400);
    });

    test('allows multiple bets in one call', async () => {
      const response = await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({
          apuestas: [
            { tipo: 'winner', seleccion: 'A', monto: 30 },
            { tipo: 'total_goals_exact', seleccion: '2', monto: 20 }
          ]
        })
        .expect(201);

      expect(response.body.apuestas).toHaveLength(2);
      expect(response.body.nuevoSaldo).toBe(50); // 100 - 30 - 20
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

      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${partido2.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(400);
    });

    test('rejects invalid bet type', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'invalid_type', seleccion: 'A', monto: 50 }] })
        .expect(400);
    });

    test('rejects invalid selection for bet type', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'C', monto: 50 }] }) // No team C
        .expect(400);
    });

    test('rejects empty apuestas array', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [] })
        .expect(400);
    });

    test('returns 401 without auth token', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(401);
    });

    test('returns 403 for non-member', async () => {
      await usuariosService.sincronizarUsuario({
        uid: 'outsider',
        email: 'outsider@test.com',
        nombre: 'Outsider',
        emailVerificado: true,
      });

      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('outsider'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(403);
    });
  });

  describe('GET /api/grupos/:grupoId/apuestas/mis-apuestas', () => {
    test('returns user bets with match info', async () => {
      // Create some bets
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(201);

      const response = await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/mis-apuestas`)
        .set(getAuthHeader('user-1'))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].tipo).toBe('winner');
      expect(response.body[0].monto).toBe(50);
      expect(response.body[0].partidoId).toBe(testData.partido.id);
    });

    test('returns 401 without auth token', async () => {
      await agent
        .get(`/api/grupos/${GRUPO_ID}/apuestas/mis-apuestas`)
        .expect(401);
    });
  });

  describe('POST /api/grupos/:grupoId/apuestas/partido/:partidoId/resolver (admin)', () => {
    test('resolves bets for admin', async () => {
      // First create a bet
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(201);

      // Set match as played with result
      mockDb.prepare("UPDATE Partidos SET estado = 'jugado', votacionCerrada = 1 WHERE id = ?").run(testData.partido.id);

      // Add result (Equipo A wins 2-1)
      mockDb.prepare(`
        INSERT INTO Resultados (id, partidoId, golesRival, fechaCarga)
        VALUES (?, ?, 1, ?)
      `).run('result-1', testData.partido.id, new Date().toISOString());

      // Add goals for Equipo A (2 goals by user-1)
      mockDb.prepare(`
        INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, segundo, enContra)
        VALUES (?, ?, ?, 'A', 10, 0, 0)
      `).run('gol-1', testData.partido.id, 'user-1');
      mockDb.prepare(`
        INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, segundo, enContra)
        VALUES (?, ?, ?, 'A', 20, 0, 0)
      `).run('gol-2', testData.partido.id, 'user-1');

      // Add goal for Equipo B (1 goal by user-2)
      mockDb.prepare(`
        INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, segundo, enContra)
        VALUES (?, ?, ?, 'B', 30, 0, 0)
      `).run('gol-3', testData.partido.id, 'user-2');

      // Add MVP vote for user-1
      mockDb.prepare(`
        INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId, fecha)
        VALUES (?, ?, ?, ?, ?)
      `).run('mvp-1', testData.partido.id, 'user-2', 'user-1', new Date().toISOString());

      const response = await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/resolver`)
        .set(getAuthHeader('admin-1'))
        .expect(200);

      expect(response.body).toHaveProperty('totalApostado');
      expect(response.body).toHaveProperty('totalPagado');
      expect(response.body).toHaveProperty('excedenteCasa');
      expect(response.body).toHaveProperty('porTipo');
    });

    test('rejects non-admin', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/resolver`)
        .set(getAuthHeader('user-1'))
        .expect(403);
    });
  });

  describe('POST /api/grupos/:grupoId/apuestas/partido/:partidoId/reembolsar (admin)', () => {
    test('refunds bets for admin', async () => {
      // First create a bet
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/apostar`)
        .set(getAuthHeader('user-1'))
        .send({ apuestas: [{ tipo: 'winner', seleccion: 'A', monto: 50 }] })
        .expect(201);

      const response = await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/reembolsar`)
        .set(getAuthHeader('admin-1'))
        .expect(200);

      expect(response.body).toHaveProperty('reembolsadas', 1);
    });

    test('rejects non-admin', async () => {
      await agent
        .post(`/api/grupos/${GRUPO_ID}/apuestas/partido/${testData.partido.id}/reembolsar`)
        .set(getAuthHeader('user-1'))
        .expect(403);
    });
  });
});