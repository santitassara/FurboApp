const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const gruposService = require('../../src/services/gruposService');

function insertarUsuario(uid, nombre = 'Usuario') {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (?, ?, ?, 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, `${uid}@gmail.com`);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
});

describe('gruposService.crearGrupo', () => {
  it('rechaza con 400 si el nombre está vacío', async () => {
    insertarUsuario('admin-1');
    await expect(gruposService.crearGrupo({ nombre: '  ', creadoPor: 'admin-1' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('crea el grupo y deja al creador como admin', async () => {
    insertarUsuario('admin-1');

    const grupo = await gruposService.crearGrupo({ nombre: 'Fútbol de los Jueves', creadoPor: 'admin-1' });

    expect(grupo).toMatchObject({ nombre: 'Fútbol de los Jueves', creadoPor: 'admin-1' });
    expect(grupo.codigoInvitacion).toMatch(/^[A-Z0-9]+-[A-F0-9]{4}$/);

    const membresia = await gruposService.obtenerMembresia(grupo.id, 'admin-1');
    expect(membresia).toMatchObject({ rol: 'admin', estaSancionado: false });
  });
});

describe('gruposService.unirseAGrupo', () => {
  it('rechaza con 404 si el código no existe', async () => {
    insertarUsuario('u1');
    await expect(
      gruposService.unirseAGrupo({ codigoInvitacion: 'NO-EXISTE', usuarioId: 'u1' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('agrega al usuario como jugador cuando el código es válido', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Jueves', creadoPor: 'admin-1' });

    const resultado = await gruposService.unirseAGrupo({
      codigoInvitacion: grupo.codigoInvitacion,
      usuarioId: 'u1',
    });

    expect(resultado.id).toBe(grupo.id);
    const membresia = await gruposService.obtenerMembresia(grupo.id, 'u1');
    expect(membresia).toMatchObject({ rol: 'jugador', estaSancionado: false });
  });

  it('rechaza con 409 si ya es miembro', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Jueves', creadoPor: 'admin-1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, usuarioId: 'u1' });

    await expect(
      gruposService.unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, usuarioId: 'u1' })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('gruposService.listarMisGrupos', () => {
  it('incluye codigoInvitacion solo para el admin', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Jueves', creadoPor: 'admin-1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, usuarioId: 'u1' });

    const gruposAdmin = await gruposService.listarMisGrupos('admin-1');
    const gruposJugador = await gruposService.listarMisGrupos('u1');

    expect(gruposAdmin[0].codigoInvitacion).toBe(grupo.codigoInvitacion);
    expect(gruposJugador[0].codigoInvitacion).toBeUndefined();
  });
});

describe('gruposService.sancionar / perdonarSancion / listarSancionados', () => {
  it('sanciona, lista y perdona dentro del grupo correcto', async () => {
    insertarUsuario('admin-1');
    insertarUsuario('u1', 'Jugador Uno');
    const grupoA = await gruposService.crearGrupo({ nombre: 'Grupo A', creadoPor: 'admin-1' });
    const grupoB = await gruposService.crearGrupo({ nombre: 'Grupo B', creadoPor: 'admin-1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupoA.codigoInvitacion, usuarioId: 'u1' });
    await gruposService.unirseAGrupo({ codigoInvitacion: grupoB.codigoInvitacion, usuarioId: 'u1' });

    await gruposService.sancionar(grupoA.id, 'u1');

    expect(await gruposService.listarSancionados(grupoA.id)).toEqual([{ uid: 'u1', nombre: 'Jugador Uno' }]);
    expect(await gruposService.listarSancionados(grupoB.id)).toEqual([]);

    await gruposService.perdonarSancion(grupoA.id, 'u1');
    expect(await gruposService.listarSancionados(grupoA.id)).toEqual([]);
  });

  it('perdonarSancion rechaza con 404 si no hay membresía', async () => {
    insertarUsuario('admin-1');
    const grupo = await gruposService.crearGrupo({ nombre: 'Grupo A', creadoPor: 'admin-1' });

    await expect(gruposService.perdonarSancion(grupo.id, 'no-existe')).rejects.toMatchObject({ status: 404 });
  });
});
