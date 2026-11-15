const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const crypto = require('node:crypto');
const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');
const apuestasService = require('../../src/services/apuestasService');

const GRUPO_ID = 'grupo-test-1';

async function setupBaseTestData() {
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

  await usuariosService.sincronizarUsuario({
    uid: 'user-4',
    email: 'user4@test.com',
    nombre: 'User Cuatro',
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

  // Add inscriptions (2 titulares + 1 suplente)
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

  // Close performance voting (votacionCerrada = 1) - required for resolution
  mockDb.prepare("UPDATE Partidos SET votacionCerrada = 1 WHERE id = ?").run(partido.id);

  return { partido, grupoId: GRUPO_ID };
}

async function setMatchAsPlayed(partidoId, golesEquipoA = 2, golesEquipoB = 1, mvpUid = 'user-1') {
  // Set match as played
  mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(partidoId);

  // Add resultado
  mockDb.prepare(`
    INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, golesRival, fechaCarga)
    VALUES (?, ?, ?, 0, '2026-01-02T00:00:00.000Z')
  `).run('resultado-1', partidoId, mvpUid);

  // Clear existing goals
  mockDb.exec('DELETE FROM Goles');

  // Add goals for equipo A
  for (let i = 0; i < golesEquipoA; i++) {
    mockDb.prepare(`
      INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, segundo, enContra)
      VALUES (?, ?, 'user-1', 'A', ?, 0, 0)
    `).run(`gol-a-${i}`, partidoId, 10 + i * 5);
  }

  // Add goals for equipo B
  for (let i = 0; i < golesEquipoB; i++) {
    mockDb.prepare(`
      INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, segundo, enContra)
      VALUES (?, ?, 'user-2', 'B', ?, 0, 0)
    `).run(`gol-b-${i}`, partidoId, 20 + i * 5);
  }

  // Clear existing MVP votes
  mockDb.exec('DELETE FROM VotosMvp');

  // Add MVP votes
  mockDb.prepare(`
    INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId, fecha)
    VALUES (?, ?, 'admin-1', ?, '2026-01-02T00:00:00.000Z')
  `).run('voto-mvp-1', partidoId, mvpUid);
}

async function resetMatchToOpen(partidoId) {
  // Reset match to open for betting
  mockDb.prepare("UPDATE Partidos SET estado = 'abierto' WHERE id = ?").run(partidoId);
  // Clear previous bets and results
  mockDb.prepare('DELETE FROM Apuestas WHERE partidoId = ?').run(partidoId);
  mockDb.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
  mockDb.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);
  mockDb.prepare('DELETE FROM VotosMvp WHERE partidoId = ?').run(partidoId);
}

describe('Apuestas Resolution', () => {
  let testData;

  beforeEach(async () => {
    testData = await setupBaseTestData();
  });

  test('resolverPartido: winner bet pays correctly', async () => {
    // Create bets while match is open
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'winner', seleccion: 'A', monto: 50 }] // cuota 1.8
    );

    // Then set match as played
    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalApostado).toBe(50);
    expect(resumen.totalPagado).toBe(90); // 50 * 1.8 = 90
    expect(resumen.excedenteCasa).toBe(-40); // house loses 40
    expect(resumen.porTipo.winner.ganadas).toBe(1);

    // Check user balance
    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(140); // 100 - 50 + 90
  });

  test('resolverPartido: loser bet pays correctly', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'loser', seleccion: 'B', monto: 50 }] // cuota 2.5
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalApostado).toBe(50);
    expect(resumen.totalPagado).toBe(125); // 50 * 2.5 = 125
    expect(resumen.porTipo.loser.ganadas).toBe(1);

    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(175); // 100 - 50 + 125
  });

  test('resolverPartido: exact_score pays high multiplier', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'exact_score', seleccion: '2-1', monto: 20 }] // cuota 9.0
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalApostado).toBe(20);
    expect(resumen.totalPagado).toBe(180); // 20 * 9.0 = 180
    expect(resumen.porTipo.exact_score.ganadas).toBe(1);

    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(260); // 100 - 20 + 180
  });

  test('resolverPartido: exact_score loses on wrong score', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'exact_score', seleccion: '3-0', monto: 20 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(0);
    expect(resumen.porTipo.exact_score.ganadas).toBe(0);
    expect(resumen.porTipo.exact_score.total).toBe(1);

    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(80); // 100 - 20
  });

  test('resolverPartido: goal_scorer_anytime pays if player scored', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_anytime', seleccion: 'user-1', monto: 50 }] // cuota 6.0
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(300); // 50 * 6.0 = 300
    expect(resumen.porTipo.goal_scorer_anytime.ganadas).toBe(1);

    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(350); // 100 - 50 + 300
  });

  test('resolverPartido: goal_scorer_anytime loses if player did not score', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_anytime', seleccion: 'user-3', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(0);
    expect(resumen.porTipo.goal_scorer_anytime.ganadas).toBe(0);
    expect(resumen.porTipo.goal_scorer_anytime.total).toBe(1);

    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(50); // 100 - 50
  });

  test('resolverPartido: goal_scorer_first pays only for first goal', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_first', seleccion: 'user-1', monto: 50 }] // cuota 10.0
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(500); // 50 * 10.0 = 500
    expect(resumen.porTipo.goal_scorer_first.ganadas).toBe(1);
  });

  test('resolverPartido: goal_scorer_first loses if player scored but not first', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_first', seleccion: 'user-2', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(0);
    expect(resumen.porTipo.goal_scorer_first.ganadas).toBe(0);
  });

  test('resolverPartido: assist_provider pays for assists', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'assist_provider', seleccion: 'user-3', monto: 50 }] // cuota 8.0
    );

    await setMatchAsPlayed(testData.partido.id);

    // Add assists to goals (user-3 assisted user-1's goals)
    mockDb.prepare("UPDATE Goles SET asistenciaUsuarioId = 'user-3' WHERE id LIKE 'gol-a-%'").run();

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(400); // 50 * 8.0 = 400
    expect(resumen.porTipo.assist_provider.ganadas).toBe(1);
  });

  test('resolverPartido: mvp pays for top voted player', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'mvp', seleccion: 'user-1', monto: 50 }] // cuota 10.0
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(500); // 50 * 10.0 = 500
    expect(resumen.porTipo.mvp.ganadas).toBe(1);
  });

  test('resolverPartido: mvp loses if player not top voted', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'mvp', seleccion: 'user-2', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(0);
    expect(resumen.porTipo.mvp.ganadas).toBe(0);
  });

  test('resolverPartido: injured player (not in lineup) loses bet', async () => {
    // user-3 is suplente, set equipo = NULL (didn't play)
    mockDb.prepare("UPDATE Inscripciones SET equipo = NULL WHERE usuarioId = 'user-3'").run();

    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_anytime', seleccion: 'user-3', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(0);
    expect(resumen.porTipo.goal_scorer_anytime.ganadas).toBe(0);
    expect(resumen.porTipo.goal_scorer_anytime.total).toBe(1);
  });

  test('resolverPartido: MVP tie broken by first vote timestamp', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'mvp', seleccion: 'user-2', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    // Add another MVP vote for user-2 with earlier timestamp
    mockDb.prepare(`
      INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId, fecha)
      VALUES (?, ?, 'user-3', 'user-2', '2026-01-01T23:00:00.000Z')
    `).run('voto-mvp-2', testData.partido.id);
    // user-1 has vote at 2026-01-02T00:00:00.000Z (later)
    // So user-2 should win MVP due to earlier vote

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(500); // 50 * 10.0 = 500
    expect(resumen.porTipo.mvp.ganadas).toBe(1);
  });

  test('resolverPartido: draw result pays winner.draw odds', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'winner', seleccion: 'draw', monto: 50 }] // cuota 3.2
    );

    // Set match as draw 1-1
    await setMatchAsPlayed(testData.partido.id, 1, 1);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(160); // 50 * 3.2 = 160
    expect(resumen.porTipo.winner.ganadas).toBe(1);
  });

  test('resolverPartido: over/under goals calculated correctly', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'total_goals_over', seleccion: '2.5', monto: 50 }] // cuota 1.9
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(95); // 50 * 1.9 = 95
    expect(resumen.porTipo.total_goals_over.ganadas).toBe(1);

    // Under 2.5 should lose
    await resetMatchToOpen(testData.partido.id);
    // Reset user balance
    mockDb.prepare('DELETE FROM UsuarioPuntos WHERE usuarioId = ?').run('user-1');
    mockDb.prepare('INSERT INTO UsuarioPuntos (usuarioId, saldo, actualizadoEn) VALUES (?, 100, ?)').run('user-1', new Date().toISOString());

    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'total_goals_under', seleccion: '2.5', monto: 50 }] // cuota 1.9
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen2 = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen2.totalPagado).toBe(0);
    expect(resumen2.porTipo.total_goals_under.ganadas).toBe(0);
  });

  test('resolverPartido: total_goals_exact pays correctly', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'total_goals_exact', seleccion: '3', monto: 30 }] // cuota 8.0
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(240); // 30 * 8.0 = 240
    expect(resumen.porTipo.total_goals_exact.ganadas).toBe(1);
  });

  test('resolverPartido: surplus points lost (house keeps)', async () => {
    // user-1 bets on winner A (wins)
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'winner', seleccion: 'A', monto: 50 }] // cuota 1.8 -> pays 90
    );

    // user-2 bets on winner B (loses)
    await usuariosService.sincronizarUsuario({
      uid: 'user-2',
      email: 'user2@test.com',
      nombre: 'User Dos',
      emailVerificado: true,
    });
    mockDb.prepare('INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso) VALUES (?, ?, ?, ?, ?, ?)')
      .run('ug-2', GRUPO_ID, 'user-2', 'jugador', 0, '2026-01-01T00:00:00.000Z');
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-2',
      [{ tipo: 'winner', seleccion: 'B', monto: 30 }] // cuota 1.8 -> would pay 54 but loses
    );

    // user-3 bets on exact score 3-0 (loses)
    await usuariosService.sincronizarUsuario({
      uid: 'user-3',
      email: 'user3@test.com',
      nombre: 'User Tres',
      emailVerificado: true,
    });
    mockDb.prepare('INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso) VALUES (?, ?, ?, ?, ?, ?)')
      .run('ug-3', GRUPO_ID, 'user-3', 'jugador', 0, '2026-01-01T00:00:00.000Z');
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-3',
      [{ tipo: 'exact_score', seleccion: '3-0', monto: 20 }] // cuota 15.0 -> would pay 300 but loses
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    // Total apostado: 50 + 30 + 20 = 100
    // Total pagado: 90 (only user-1 wins)
    // Excedente casa: 100 - 90 = 10 (house keeps 10)
    expect(resumen.totalApostado).toBe(100);
    expect(resumen.totalPagado).toBe(90);
    expect(resumen.excedenteCasa).toBe(10);
  });

  test('resolverPartido: rejects if match not played', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'winner', seleccion: 'A', monto: 50 }]
    );

    // Match is still 'abierto', not 'jugado'
    await expect(apuestasService.resolverPartido(testData.partido.id, GRUPO_ID))
      .rejects.toThrow('El partido no ha finalizado');
  });

  test('resolverPartido: rejects if votacionCerrada is not set', async () => {
    // Reset votacionCerrada to 0
    mockDb.prepare("UPDATE Partidos SET votacionCerrada = 0 WHERE id = ?").run(testData.partido.id);

    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'winner', seleccion: 'A', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    await expect(apuestasService.resolverPartido(testData.partido.id, GRUPO_ID))
      .rejects.toThrow('La votación de performance no está cerrada');
  });

  test('resolverPartido: rejects if resultado not loaded', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'winner', seleccion: 'A', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    mockDb.exec('DELETE FROM Resultados');

    await expect(apuestasService.resolverPartido(testData.partido.id, GRUPO_ID))
      .rejects.toThrow('Resultado no cargado');
  });

  test('resolverPartido: multiple bet types resolved in same match', async () => {
    // Create multiple bets for user-1
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [
        { tipo: 'winner', seleccion: 'A', monto: 30 }, // cuota 1.8 -> 54
        { tipo: 'total_goals_exact', seleccion: '3', monto: 20 }, // cuota 8.0 -> 160
        { tipo: 'goal_scorer_anytime', seleccion: 'user-1', monto: 25 }, // cuota 6.0 -> 150
        { tipo: 'mvp', seleccion: 'user-1', monto: 15 }, // cuota 10.0 -> 150
      ]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalApostado).toBe(90);
    // 54 + 160 + 150 + 150 = 514
    expect(resumen.totalPagado).toBe(514);
    expect(resumen.porTipo.winner.ganadas).toBe(1);
    expect(resumen.porTipo.total_goals_exact.ganadas).toBe(1);
    expect(resumen.porTipo.goal_scorer_anytime.ganadas).toBe(1);
    expect(resumen.porTipo.mvp.ganadas).toBe(1);

    const saldo = await apuestasService.obtenerSaldo('user-1');
    expect(saldo).toBe(524); // 100 - 90 + 514
  });

  test('resolverPartido: suplente who played (has equipo) counts as played', async () => {
    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_anytime', seleccion: 'user-3', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    // Add goal by user-3
    mockDb.prepare(`
      INSERT INTO Goles (id, partidoId, usuarioId, equipo, minuto, segundo, enContra)
      VALUES (?, ?, 'user-3', 'A', 60, 0, 0)
    `).run('gol-a-3', testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(300); // 50 * 6.0 = 300
    expect(resumen.porTipo.goal_scorer_anytime.ganadas).toBe(1);
  });

  test('resolverPartido: suplente who did not play (no equipo) loses bet', async () => {
    // Remove equipo from user-3 (suplente who didn't play)
    mockDb.prepare("UPDATE Inscripciones SET equipo = NULL WHERE usuarioId = 'user-3'").run();

    await apuestasService.crearApuestas(
      testData.partido.id,
      GRUPO_ID,
      'user-1',
      [{ tipo: 'goal_scorer_anytime', seleccion: 'user-3', monto: 50 }]
    );

    await setMatchAsPlayed(testData.partido.id);

    const resumen = await apuestasService.resolverPartido(testData.partido.id, GRUPO_ID);

    expect(resumen.totalPagado).toBe(0);
    expect(resumen.porTipo.goal_scorer_anytime.ganadas).toBe(0);
  });
});