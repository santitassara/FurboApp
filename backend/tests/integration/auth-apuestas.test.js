const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');

describe('Auth Sync - Apuestas Integration', () => {
  beforeEach(() => {
    // Clear test tables
    mockDb.exec('DELETE FROM Apuestas');
    mockDb.exec('DELETE FROM UsuarioPuntos');
    mockDb.exec('DELETE FROM Usuarios');
    mockDb.exec('DELETE FROM Grupos');
    mockDb.exec('DELETE FROM UsuariosGrupos');
    mockDb.exec('DELETE FROM Partidos');
    mockDb.exec('DELETE FROM Inscripciones');
  });

  test('sincronizarUsuario creates UsuarioPuntos with 100 for new Google user', async () => {
    const userData = {
      uid: 'google-user-1',
      email: 'google1@test.com',
      nombre: 'Google User 1',
      emailVerificado: true,
    };

    const result = await usuariosService.sincronizarUsuario(userData);

    expect(result.uid).toBe('google-user-1');
    expect(result.nombre).toBe('Google User 1');

    // Check UsuarioPuntos was created with 100
    const puntos = mockDb.prepare('SELECT * FROM UsuarioPuntos WHERE usuarioId = ?').get('google-user-1');
    expect(puntos).toBeDefined();
    expect(puntos.saldo).toBe(100);
    expect(puntos.actualizadoEn).toBeDefined();
  });

  test('sincronizarUsuario does NOT reset points for existing user', async () => {
    const userData = {
      uid: 'existing-user',
      email: 'existing@test.com',
      nombre: 'Existing User',
      emailVerificado: true,
    };

    // First sync - creates user and points
    await usuariosService.sincronizarUsuario(userData);

    // Simulate user spending some points
    mockDb.prepare('UPDATE UsuarioPuntos SET saldo = 50 WHERE usuarioId = ?').run('existing-user');

    // Second sync - should NOT reset points
    const result = await usuariosService.sincronizarUsuario(userData);

    expect(result.uid).toBe('existing-user');

    const puntos = mockDb.prepare('SELECT * FROM UsuarioPuntos WHERE usuarioId = ?').get('existing-user');
    expect(puntos.saldo).toBe(50); // Should remain 50, not reset to 100
  });

  test('registrarConPassword creates UsuarioPuntos with 100 for new email/password user', async () => {
    const userData = {
      nombre: 'Password User',
      email: 'password@test.com',
      password: 'password123',
    };

    const result = await usuariosService.registrarConPassword(userData);

    expect(result.uid).toBeDefined();
    expect(result.nombre).toBe('Password User');
    expect(result.email).toBe('password@test.com');

    // Check UsuarioPuntos was created with 100
    const puntos = mockDb.prepare('SELECT * FROM UsuarioPuntos WHERE usuarioId = ?').get(result.uid);
    expect(puntos).toBeDefined();
    expect(puntos.saldo).toBe(100);
    expect(puntos.actualizadoEn).toBeDefined();
  });
});