const { crearDocMock, crearColeccionMock } = require('../helpers/mockFirestore');

const mockUsuariosCol = crearColeccionMock();

jest.mock('../../src/config/firebase', () => ({
  db: { collection: jest.fn(() => mockUsuariosCol) },
}));

const usuariosService = require('../../src/services/usuariosService');

describe('usuariosService.sincronizarUsuario', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_EMAILS;
  });

  it('crea un usuario nuevo como jugador si el email no está en ADMIN_EMAILS', async () => {
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: false }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-1',
      email: 'jugador@gmail.com',
      nombre: 'Jugador Uno',
    });

    expect(usuario.rol).toBe('jugador');
    expect(usuario.estaSancionado).toBe(false);
    expect(docMock.set).toHaveBeenCalledWith(expect.objectContaining({ rol: 'jugador' }));
  });

  it('crea un usuario nuevo como admin si el email está en ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com, otro@gmail.com';
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: false }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

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
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: false }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-4',
      email: 'admin@gmail.com',
      nombre: 'Admin Sin Verificar',
      emailVerificado: false,
    });

    expect(usuario.rol).toBe('jugador');
  });

  it('no degrada a un admin existente y devuelve el usuario tal cual si no hay cambios', async () => {
    const usuarioExistente = {
      uid: 'uid-3',
      nombre: 'Jugador Tres',
      email: 'jugador3@gmail.com',
      rol: 'jugador',
      estaSancionado: true,
      fechaCreacion: '2026-01-01T00:00:00.000Z',
    };
    const docMock = crearDocMock({
      get: jest.fn().mockResolvedValue({ exists: true, data: () => usuarioExistente }),
    });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    const usuario = await usuariosService.sincronizarUsuario({
      uid: 'uid-3',
      email: 'jugador3@gmail.com',
      nombre: 'Jugador Tres',
    });

    expect(usuario.rol).toBe('jugador');
    expect(docMock.set).not.toHaveBeenCalled();
  });
});

describe('usuariosService.obtenerUsuario', () => {
  beforeEach(() => jest.clearAllMocks());

  it('devuelve null si el usuario no existe', async () => {
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: false }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    const usuario = await usuariosService.obtenerUsuario('uid-x');

    expect(usuario).toBeNull();
  });

  it('devuelve los datos si el usuario existe', async () => {
    const datos = { uid: 'uid-x', rol: 'jugador' };
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: true, data: () => datos }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    const usuario = await usuariosService.obtenerUsuario('uid-x');

    expect(usuario).toEqual(datos);
  });
});

describe('usuariosService.listarSancionados', () => {
  it('devuelve solo los datos de los docs sancionados', async () => {
    const docs = [{ data: () => ({ uid: '1', estaSancionado: true }) }];
    mockUsuariosCol.get.mockResolvedValue({ docs });

    const sancionados = await usuariosService.listarSancionados();

    expect(sancionados).toEqual([{ uid: '1', estaSancionado: true }]);
    expect(mockUsuariosCol.where).toHaveBeenCalledWith('estaSancionado', '==', true);
  });
});

describe('usuariosService.perdonarSancion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lanza error 404 si el usuario no existe', async () => {
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: false }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    await expect(usuariosService.perdonarSancion('uid-x')).rejects.toMatchObject({ status: 404 });
  });

  it('setea estaSancionado en false si el usuario existe', async () => {
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: true }) });
    mockUsuariosCol.doc.mockReturnValue(docMock);

    await usuariosService.perdonarSancion('uid-x');

    expect(docMock.set).toHaveBeenCalledWith({ estaSancionado: false }, { merge: true });
  });
});
