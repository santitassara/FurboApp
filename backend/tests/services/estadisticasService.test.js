const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const estadisticasService = require('../../src/services/estadisticasService');
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

describe('estadisticasService.obtenerEstadisticasJugador', () => {
  test('valoracion equals OVR (average of 6 skills)', async () => {
    // Setup: user with known skills
    await usuariosService.sincronizarUsuario({
      uid: 'jugador-test',
      email: 'test@gmail.com',
      nombre: 'Jugador Test',
    });

    // Set all 6 skills
    mockDb.prepare(
      `UPDATE Usuarios SET
         velocidad = 80,
         pegada = 70,
         tocaPase = 75,
         gambeta = 65,
         marcaDefensa = 60,
         fisico = 70
       WHERE uid = ?`
    ).run('jugador-test');

    // Call obtenerEstadisticasJugador
    const stats = await estadisticasService.obtenerEstadisticasJugador('jugador-test', GRUPO_ID);

    // Assert: valoracion === average of 6 skills (rounded to 1 decimal)
    // (80 + 70 + 75 + 65 + 60 + 70) / 6 = 420 / 6 = 70.0
    expect(stats.valoracion).toBe('70.0');
  });

  test('valoracion is 0.0 when skills are null', async () => {
    // Setup: user with no skills set (all null)
    await usuariosService.sincronizarUsuario({
      uid: 'jugador-sin-habilidades',
      email: 'sin-habilidades@gmail.com',
      nombre: 'Jugador Sin Habilidades',
    });
    // Skills are null by default

    const stats = await estadisticasService.obtenerEstadisticasJugador('jugador-sin-habilidades', GRUPO_ID);

    // Assert: valoracion should be '0.0' when skills are null
    expect(stats.valoracion).toBe('0.0');
  });

  test('valoracion is 0.0 when some skills are null', async () => {
    // Setup: user with some skills set, some null
    await usuariosService.sincronizarUsuario({
      uid: 'jugador-parcial',
      email: 'parcial@gmail.com',
      nombre: 'Jugador Parcial',
    });

    // Set only some skills
    mockDb.prepare(
      `UPDATE Usuarios SET
         velocidad = 80,
         pegada = 70,
         tocaPase = NULL,
         gambeta = 65,
         marcaDefensa = NULL,
         fisico = 70
       WHERE uid = ?`
    ).run('jugador-parcial');

    const stats = await estadisticasService.obtenerEstadisticasJugador('jugador-parcial', GRUPO_ID);

    // Assert: valoracion should be '0.0' when not all skills are set
    expect(stats.valoracion).toBe('0.0');
  });

  test('valoracion rounds to 1 decimal place', async () => {
    // Setup: user with skills that produce decimal average
    await usuariosService.sincronizarUsuario({
      uid: 'jugador-decimal',
      email: 'decimal@gmail.com',
      nombre: 'Jugador Decimal',
    });

    // Set skills that give a decimal average
    // (80 + 70 + 75 + 65 + 60 + 69) / 6 = 419 / 6 = 69.833... -> 69.8
    mockDb.prepare(
      `UPDATE Usuarios SET
         velocidad = 80,
         pegada = 70,
         tocaPase = 75,
         gambeta = 65,
         marcaDefensa = 60,
         fisico = 69
       WHERE uid = ?`
    ).run('jugador-decimal');

    const stats = await estadisticasService.obtenerEstadisticasJugador('jugador-decimal', GRUPO_ID);

    // Assert: valoracion rounded to 1 decimal
    expect(stats.valoracion).toBe('69.8');
  });
});