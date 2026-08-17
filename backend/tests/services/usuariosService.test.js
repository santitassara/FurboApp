const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');

function insertarUsuario(overrides = {}) {
  const usuario = {
    uid: 'uid-x',
    nombre: 'Jugador X',
    email: 'x@gmail.com',
    esSuperAdmin: 0,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (@uid, @nombre, @email, @esSuperAdmin, @fechaCreacion)`
    )
    .run(usuario);
  return usuario;
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Usuarios');
  delete process.env.ADMIN_EMAILS;
});

describe('usuariosService.sincronizarUsuario', () => {
  it('crea un usuario nuevo sin esSuperAdmin si el email no está en ADMIN_EMAILS', async () => {
    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-1',
      email: 'jugador@gmail.com',
      nombre: 'Jugador Uno',
    });

    expect(usuario.esSuperAdmin).toBe(false);

    const fila = mockDb.prepare('SELECT * FROM Usuarios WHERE uid = ?').get('uid-1');
    expect(fila.esSuperAdmin).toBe(0);
  });

  it('crea un usuario nuevo con esSuperAdmin si el email está en ADMIN_EMAILS y verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-2',
      email: 'admin@gmail.com',
      nombre: 'Admin Uno',
      emailVerificado: true,
    });

    expect(usuario.esSuperAdmin).toBe(true);
  });

  it('no marca esSuperAdmin si el email está en ADMIN_EMAILS pero no está verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-4',
      email: 'admin@gmail.com',
      nombre: 'Admin Sin Verificar',
      emailVerificado: false,
    });

    expect(usuario.esSuperAdmin).toBe(false);
  });

  it('no degrada a super admin existente y devuelve el usuario tal cual si no hay cambios', async () => {
    insertarUsuario({ uid: 'uid-3', email: 'jugador3@gmail.com', esSuperAdmin: 1 });

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-3',
      email: 'jugador3@gmail.com',
      nombre: 'Jugador Tres',
    });

    expect(usuario.esSuperAdmin).toBe(true);
  });

  it('promueve a super admin un usuario existente cuando su email está en ADMIN_EMAILS y verificado', async () => {
    insertarUsuario({ uid: 'uid-5', email: 'nuevo-admin@gmail.com', esSuperAdmin: 0 });
    process.env.ADMIN_EMAILS = 'nuevo-admin@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-5',
      email: 'nuevo-admin@gmail.com',
      nombre: 'Nuevo Admin',
      emailVerificado: true,
    });

    expect(usuario.esSuperAdmin).toBe(true);

    const fila = mockDb.prepare('SELECT esSuperAdmin FROM Usuarios WHERE uid = ?').get('uid-5');
    expect(fila.esSuperAdmin).toBe(1);
  });
});

describe('usuariosService.obtenerUsuario', () => {
  it('devuelve null si el usuario no existe', async () => {
    const usuario = await usuariosService.obtenerUsuario('uid-x');

    expect(usuario).toBeNull();
  });

  it('devuelve los datos si el usuario existe', async () => {
    insertarUsuario({ uid: 'uid-x' });

    const usuario = await usuariosService.obtenerUsuario('uid-x');

    expect(usuario).toMatchObject({ uid: 'uid-x', esSuperAdmin: false });
  });
});
