const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');

function insertarUsuario(overrides = {}) {
  const usuario = {
    uid: 'uid-x',
    nombre: 'Jugador X',
    email: 'x@gmail.com',
    rol: 'jugador',
    estaSancionado: 0,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES (@uid, @nombre, @email, @rol, @estaSancionado, @fechaCreacion)`
    )
    .run(usuario);
  return usuario;
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Usuarios');
  delete process.env.ADMIN_EMAILS;
});

describe('usuariosService.sincronizarUsuario', () => {
  it('crea un usuario nuevo como jugador si el email no está en ADMIN_EMAILS', async () => {
    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-1',
      email: 'jugador@gmail.com',
      nombre: 'Jugador Uno',
    });

    expect(usuario.rol).toBe('jugador');
    expect(usuario.estaSancionado).toBe(false);

    const fila = mockDb.prepare('SELECT * FROM Usuarios WHERE uid = ?').get('uid-1');
    expect(fila.rol).toBe('jugador');
  });

  it('crea un usuario nuevo como admin si el email está en ADMIN_EMAILS y verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-2',
      email: 'admin@gmail.com',
      nombre: 'Admin Uno',
      emailVerificado: true,
    });

    expect(usuario.rol).toBe('admin');
  });

  it('crea un usuario nuevo como jugador si el email está en ADMIN_EMAILS pero no está verificado', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-4',
      email: 'admin@gmail.com',
      nombre: 'Admin Sin Verificar',
      emailVerificado: false,
    });

    expect(usuario.rol).toBe('jugador');
  });

  it('no degrada a un admin existente y devuelve el usuario tal cual si no hay cambios', async () => {
    insertarUsuario({ uid: 'uid-3', email: 'jugador3@gmail.com', estaSancionado: 1 });

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-3',
      email: 'jugador3@gmail.com',
      nombre: 'Jugador Tres',
    });

    expect(usuario.rol).toBe('jugador');
    expect(usuario.estaSancionado).toBe(true);
  });

  it('promueve a admin un usuario existente que era jugador cuando su email está en ADMIN_EMAILS y verificado', async () => {
    insertarUsuario({ uid: 'uid-5', email: 'nuevo-admin@gmail.com', rol: 'jugador' });
    process.env.ADMIN_EMAILS = 'nuevo-admin@gmail.com';

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-5',
      email: 'nuevo-admin@gmail.com',
      nombre: 'Nuevo Admin',
      emailVerificado: true,
    });

    expect(usuario.rol).toBe('admin');

    const fila = mockDb.prepare('SELECT rol FROM Usuarios WHERE uid = ?').get('uid-5');
    expect(fila.rol).toBe('admin');
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

    expect(usuario).toMatchObject({ uid: 'uid-x', rol: 'jugador', estaSancionado: false });
  });
});

describe('usuariosService.listarSancionados', () => {
  it('devuelve solo los usuarios sancionados', async () => {
    insertarUsuario({ uid: '1', email: 's@gmail.com', estaSancionado: 1 });
    insertarUsuario({ uid: '2', email: 'ns@gmail.com', estaSancionado: 0 });

    const sancionados = await usuariosService.listarSancionados();

    expect(sancionados).toEqual([expect.objectContaining({ uid: '1', estaSancionado: true })]);
  });
});

describe('usuariosService.perdonarSancion', () => {
  it('lanza error 404 si el usuario no existe', async () => {
    await expect(usuariosService.perdonarSancion('uid-x')).rejects.toMatchObject({ status: 404 });
  });

  it('setea estaSancionado en false si el usuario existe', async () => {
    insertarUsuario({ uid: 'uid-x', estaSancionado: 1 });

    await usuariosService.perdonarSancion('uid-x');

    const fila = mockDb.prepare('SELECT estaSancionado FROM Usuarios WHERE uid = ?').get('uid-x');
    expect(fila.estaSancionado).toBe(0);
  });
});

describe('usuariosService.sancionar', () => {
  it('setea estaSancionado en true', async () => {
    insertarUsuario({ uid: 'uid-y', estaSancionado: 0 });

    await usuariosService.sancionar('uid-y');

    const fila = mockDb.prepare('SELECT estaSancionado FROM Usuarios WHERE uid = ?').get('uid-y');
    expect(fila.estaSancionado).toBe(1);
  });
});
