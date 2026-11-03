const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

const GRUPO_ID = 'grupo-equipos';
const ADMIN_UID = 'admin-equipos';

function limpiarTablas() {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Invitados');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  mockDb.exec('DELETE FROM UsuariosGrupos');
}

function insertarUsuario(uid, nombre) {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (?, ?, ?, 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, `${uid}@gmail.com`);
}

function insertarGrupo({ id = GRUPO_ID, nombre = 'Grupo Equipos', modo = 'convocatoria' } = {}) {
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, modo, creadoPor, fechaCreacion)
       VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`
    )
    .run(id, nombre, `EQ-${id.slice(-4).toUpperCase()}`, modo, ADMIN_UID);
}

function insertarMembresia(grupoId = GRUPO_ID, usuarioId = ADMIN_UID, id = 'mem-1') {
  mockDb
    .prepare(
      `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
       VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(id, grupoId, usuarioId);
}

function insertarPartido({ id = 'p1', grupoId = GRUPO_ID, creadoPor = ADMIN_UID, estado = 'jugado' } = {}) {
  mockDb
    .prepare(
      `INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes, recordatorioEnviado, recordatorioPostPartidoEnviado, votacionCerrada)
       VALUES (?, '2099-01-01T20:00:00.000Z', ?, ?, ?, 10, 5, 0, 0, 0)`
    )
    .run(id, estado, creadoPor, grupoId);
  return { id, grupoId, estado };
}

function insertarInscripcion({ id, partidoId, usuarioId, invitadoId, tipo = 'titular', equipo = null }) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, invitadoId, estado, tipo, orden, fechaInscripcion, equipo)
       VALUES (?, ?, ?, ?, 'anotado', ?, 0, '2026-01-01T00:00:00.000Z', ?)`
    )
    .run(id, partidoId, usuarioId, invitadoId, tipo, equipo);
}

function insertarInvitado(id, grupoId, nombre) {
  mockDb
    .prepare(
      `INSERT INTO Invitados
        (id, grupoId, propuestoPor, nombre, edad, posicionPrincipal, posicionSecundaria, resistencia,
         habilidadPromedio, velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico, estado, fechaCreacion)
       VALUES
        (?, ?, ?, ?, null, 'arquero', null, null, 50, 50, 50, 50, 50, 50, 50, 'aprobado', '2026-01-01T00:00:00.000Z')`
    )
    .run(id, grupoId, ADMIN_UID, nombre);
}

function equipoDe(formacion, usuarioId, invitadoId) {
  return formacion.jugadores.find((j) => j.usuarioId === usuarioId && j.invitadoId === invitadoId);
}

beforeEach(() => {
  limpiarTablas();
  insertarUsuario(ADMIN_UID, 'Admin');
  insertarGrupo();
});

describe('inscripcionesService.modificarEquipos', () => {
  it('rechaza si el partido no existe', async () => {
    await expect(
      inscripcionesService.modificarEquipos('no-existe', GRUPO_ID, [])
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza si el partido está abierto', async () => {
    insertarPartido({ id: 'p-abierto', estado: 'abierto' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p-abierto', usuarioId: 'u1', equipo: 'A' });
    await expect(
      inscripcionesService.modificarEquipos('p-abierto', GRUPO_ID, [{ usuarioId: 'u1', equipo: 'B' }])
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza un equipo inválido', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        equipos: [{ usuarioId: 'u1', equipo: 'C' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza un jugador que no es titular del partido', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    insertarUsuario('u2', 'Jugador Dos');
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        equipos: [{ usuarioId: 'u2', equipo: 'B' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza indicar usuario e invitado a la vez', async () => {
    insertarPartido({ id: 'p1' });
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        equipos: [{ usuarioId: 'u1', invitadoId: 'inv-1', equipo: 'A' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza indicar un jugador repetido', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        equipos: [
          { usuarioId: 'u1', equipo: 'A' },
          { usuarioId: 'u1', equipo: 'B' },
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('cambia el equipo de un usuario titular de A a B', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [{ usuarioId: 'u1', equipo: 'B' }],
    });
    expect(equipoDe(formacion, 'u1', null).equipo).toBe('B');
  });

  it('saca a un jugador del equipo (equipo null)', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [{ usuarioId: 'u1', equipo: null }],
    });
    expect(equipoDe(formacion, 'u1', null).equipo).toBeNull();
  });

  it('devuelve a un jugador sin equipo al equipo A', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: null });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [{ usuarioId: 'u1', equipo: 'A' }],
    });
    expect(equipoDe(formacion, 'u1', null).equipo).toBe('A');
  });

  it('cambia el equipo de un invitado titular', async () => {
    insertarPartido({ id: 'p1' });
    insertarInvitado('inv-1', GRUPO_ID, 'Invitado Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', invitadoId: 'inv-1', equipo: 'B' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [{ invitadoId: 'inv-1', equipo: 'A' }],
    });
    expect(equipoDe(formacion, null, 'inv-1').equipo).toBe('A');
  });

  it('intercambia dos usuarios entre equipos', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarUsuario('u2', 'Jugador Dos');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    insertarInscripcion({ id: 'i2', partidoId: 'p1', usuarioId: 'u2', equipo: 'B' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [
        { usuarioId: 'u1', equipo: 'B' },
        { usuarioId: 'u2', equipo: 'A' },
      ],
    });
    expect(equipoDe(formacion, 'u1', null).equipo).toBe('B');
    expect(equipoDe(formacion, 'u2', null).equipo).toBe('A');
  });

  it('acepta una actualización parcial de solo algunos jugadores', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarUsuario('u2', 'Jugador Dos');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    insertarInscripcion({ id: 'i2', partidoId: 'p1', usuarioId: 'u2', equipo: 'B' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [{ usuarioId: 'u1', equipo: 'B' }],
    });
    expect(equipoDe(formacion, 'u1', null).equipo).toBe('B');
    expect(equipoDe(formacion, 'u2', null).equipo).toBe('B');
  });

  it('funciona en un partido cerrado', async () => {
    insertarPartido({ id: 'p1', estado: 'cerrado' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      equipos: [{ usuarioId: 'u1', equipo: 'B' }],
    });
    expect(equipoDe(formacion, 'u1', null).equipo).toBe('B');
  });

  it('agrega un usuario no inscrito al equipo A', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarUsuario('u2', 'Jugador Dos');
    insertarMembresia(GRUPO_ID, 'u2', 'mem-u2');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      agregar: [{ usuarioId: 'u2', equipo: 'B' }],
    });
    const agregado = equipoDe(formacion, 'u2', null);
    expect(agregado).toBeDefined();
    expect(agregado.equipo).toBe('B');
  });

  it('agrega un invitado aprobado no inscrito al equipo B', async () => {
    insertarPartido({ id: 'p1' });
    insertarInvitado('inv-1', GRUPO_ID, 'Invitado Uno');
    const formacion = await inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
      agregar: [{ invitadoId: 'inv-1', equipo: 'B' }],
    });
    const agregado = equipoDe(formacion, null, 'inv-1');
    expect(agregado).toBeDefined();
    expect(agregado.equipo).toBe('B');
  });

  it('rechaza agregar un usuario que no pertenece al grupo', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u2', 'Jugador Dos');
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        agregar: [{ usuarioId: 'u2', equipo: 'A' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza agregar un invitado que no está aprobado', async () => {
    insertarPartido({ id: 'p1' });
    insertarInvitado('inv-pendiente', GRUPO_ID, 'Invitado Pendiente');
    // insertarInvitado usa estado 'aprobado'; forzamos pendiente directamente
    mockDb
      .prepare(`UPDATE Invitados SET estado = 'pendiente' WHERE id = ?`)
      .run('inv-pendiente');
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        agregar: [{ invitadoId: 'inv-pendiente', equipo: 'A' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza agregar un jugador ya inscrito', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u1', 'Jugador Uno');
    insertarInscripcion({ id: 'i1', partidoId: 'p1', usuarioId: 'u1', equipo: 'A' });
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        agregar: [{ usuarioId: 'u1', equipo: 'B' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza equipo inválido al agregar', async () => {
    insertarPartido({ id: 'p1' });
    insertarUsuario('u2', 'Jugador Dos');
    await expect(
      inscripcionesService.modificarEquipos('p1', GRUPO_ID, {
        agregar: [{ usuarioId: 'u2', equipo: 'C' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});