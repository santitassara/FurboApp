const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const gruposService = require('../../src/services/gruposService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

const POSICIONES_DEFAULT = { posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' };
const GRUPO_ID = 'grupo-1';

async function crearUsuario(overrides = {}) {
  const usuario = await usuariosService.sincronizarUsuario({
    uid: 'u1',
    email: 'u1@gmail.com',
    nombre: 'Usuario Uno',
    ...overrides,
  });
  const yaMiembro = await gruposService.obtenerMembresia(GRUPO_ID, usuario.uid);
  if (!yaMiembro) {
    mockDb
      .prepare(
        `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
         VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
      )
      .run(`ug-${usuario.uid}`, GRUPO_ID, usuario.uid);
  }
  return usuario;
}

async function crearPartidoAbierto(overrides = {}) {
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

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (?, 'Grupo de test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run(GRUPO_ID);
});

describe('inscripcionesService.anotarse', () => {
  it('rechaza con 400 si las posiciones son inválidas', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', {
        posicionPrincipal: 'arquero',
        posicionSecundaria: 'arquero',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 403 si el usuario no existe (no tiene membresía en el grupo)', async () => {
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'no-existe', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 403 si el usuario está sancionado', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await gruposService.sancionar(GRUPO_ID, 'u1');
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 400 si ya tiene una inscripción activa', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('asigna tipo titular si hay lugar y persiste las posiciones', async () => {
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    const partido = await crearPartidoAbierto();

    const inscripcion = await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    expect(inscripcion.tipo).toBe('titular');
    expect(inscripcion.posicionPrincipal).toBe('defensor');
    expect(inscripcion.posicionSecundaria).toBe('mediocampista');
  });

  it('asigna tipo suplente si los titulares están completos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    const inscripcion = await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);

    expect(inscripcion.tipo).toBe('suplente');
  });

  it('rechaza con 400 "Partido completo" si titulares y suplentes están llenos', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await crearUsuario({ uid: 'u3', email: 'u3@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u3', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si el partido no está abierto', async () => {
    const partido = await crearPartidoAbierto();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('inscripcionesService.anotarse — aislamiento por grupo', () => {
  it('rechaza con 403 si el usuario no es miembro del grupo', async () => {
    const partido = await crearPartidoAbierto();

    await expect(
      inscripcionesService.anotarse(partido.id, GRUPO_ID, 'usuario-de-otro-grupo', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 404 si el partido pertenece a otro grupo', async () => {
    mockDb
      .prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES ('grupo-2', 'Otro grupo', 'TEST-0002', 'admin-1', '2026-01-01T00:00:00.000Z')`
      )
      .run();
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    // u1 también es miembro de grupo-2, para que el test ejercite el scoping del
    // partido (no el de membresía, ya cubierto por el test anterior).
    mockDb
      .prepare(
        `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
         VALUES ('ug-u1-grupo-2', 'grupo-2', 'u1', 'jugador', 0, '2026-01-01T00:00:00.000Z')`
      )
      .run();

    await expect(
      inscripcionesService.anotarse(partido.id, 'grupo-2', 'u1', POSICIONES_DEFAULT)
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('inscripcionesService.bajarse', () => {
  it('rechaza con 400 si no hay inscripción activa', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('sanciona al usuario si era titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    await inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u1');

    const membresia = await gruposService.obtenerMembresia(GRUPO_ID, 'u1');
    expect(membresia.estaSancionado).toBe(true);
  });

  it('NO sanciona al usuario si era suplente', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);

    await inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u2');

    const membresia = await gruposService.obtenerMembresia(GRUPO_ID, 'u2');
    expect(membresia.estaSancionado).toBe(false);
  });

  it('rechaza con 400 si el partido no está abierto', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u1')).rejects.toMatchObject({ status: 400 });
  });
});

describe('inscripcionesService.promover', () => {
  it('rechaza con 404 si el usuario no tiene inscripción activa', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.promover(partido.id, GRUPO_ID, 'u1')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 400 si el usuario ya es titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    await expect(inscripcionesService.promover(partido.id, GRUPO_ID, 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si no hay cupo de titular libre', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);

    await expect(inscripcionesService.promover(partido.id, GRUPO_ID, 'u2')).rejects.toMatchObject({ status: 400 });
  });

  it('promueve a titular si hay cupo libre', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);
    await inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u1');

    const inscripcion = await inscripcionesService.promover(partido.id, GRUPO_ID, 'u2');

    expect(inscripcion.tipo).toBe('titular');
  });

  it('rechaza con 404 si el partido no existe', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);
    mockDb.prepare('DELETE FROM Partidos WHERE id = ?').run(partido.id);

    await expect(inscripcionesService.promover(partido.id, GRUPO_ID, 'u2')).rejects.toMatchObject({ status: 404 });
  });
});

describe('inscripcionesService.sancionarManualmente', () => {
  it('rechaza con 404 si no hay inscripción activa', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });

    await expect(inscripcionesService.sancionarManualmente(partido.id, GRUPO_ID, 'u1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rechaza con 400 si el jugador es suplente', async () => {
    const partido = await crearPartidoAbierto({ cupoTitulares: 1, cupoSuplentes: 1 });
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);

    await expect(inscripcionesService.sancionarManualmente(partido.id, GRUPO_ID, 'u2')).rejects.toMatchObject({
      status: 400,
    });

    const membresia = await gruposService.obtenerMembresia(GRUPO_ID, 'u2');
    expect(membresia.estaSancionado).toBe(false);
  });

  it('da de baja y sanciona al usuario si es titular', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);

    const inscripcion = await inscripcionesService.sancionarManualmente(partido.id, GRUPO_ID, 'u1');

    expect(inscripcion.estado).toBe('dado_de_baja');
    const membresia = await gruposService.obtenerMembresia(GRUPO_ID, 'u1');
    expect(membresia.estaSancionado).toBe(true);
  });
});

describe('inscripcionesService.listarActivas', () => {
  it('devuelve solo inscripciones con estado anotado', async () => {
    const partido = await crearPartidoAbierto();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u1', POSICIONES_DEFAULT);
    await inscripcionesService.anotarse(partido.id, GRUPO_ID, 'u2', POSICIONES_DEFAULT);
    await inscripcionesService.bajarse(partido.id, GRUPO_ID, 'u2');

    const activas = await inscripcionesService.listarActivas(partido.id);

    expect(activas.map((i) => i.usuarioId)).toEqual(['u1']);
  });
});
