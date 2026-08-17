const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const partidosService = require('../../src/services/partidosService');

const GRUPO_ID = 'grupo-1';

function insertarUsuarioAdmin() {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES ('admin-1', 'Admin Uno', 'admin@gmail.com', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run();
}

function insertarGrupo() {
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (?, 'Grupo de test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run(GRUPO_ID);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM VotosMvp');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM UsuariosGrupos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuarioAdmin();
  insertarGrupo();
});

describe('partidosService.crearPartido', () => {
  it('rechaza una fecha pasada', async () => {
    await expect(
      partidosService.crearPartido({
        fecha: '2020-01-01T20:00:00.000Z',
        cupoTitulares: 10,
        cupoSuplentes: 5,
        creadoPor: 'admin-1',
        grupoId: GRUPO_ID,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza cupoTitulares no numérico o <= 0', async () => {
    await expect(
      partidosService.crearPartido({
        fecha: '2099-01-01T20:00:00.000Z',
        cupoTitulares: 0,
        cupoSuplentes: 5,
        creadoPor: 'admin-1',
        grupoId: GRUPO_ID,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('crea el partido con estado abierto cuando los datos son válidos', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    expect(partido).toMatchObject({
      id: expect.any(String),
      estado: 'abierto',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
  });
});

describe('partidosService.obtenerPartido', () => {
  it('devuelve null si no existe', async () => {
    const partido = await partidosService.obtenerPartido('no-existe', GRUPO_ID);

    expect(partido).toBeNull();
  });

  it('devuelve el partido con id si existe', async () => {
    const creado = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    const partido = await partidosService.obtenerPartido(creado.id, GRUPO_ID);

    expect(partido).toEqual(creado);
  });
});

describe('partidosService.obtenerPartido — aislamiento por grupo', () => {
  it('devuelve null si el partido pertenece a otro grupo', async () => {
    mockDb
      .prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES ('grupo-2', 'Otro grupo', 'TEST-0002', 'admin-1', '2026-01-01T00:00:00.000Z')`
      )
      .run();
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    const resultado = await partidosService.obtenerPartido(partido.id, 'grupo-2');

    expect(resultado).toBeNull();
  });
});

describe('partidosService.listarPartidosVisibles', () => {
  it('devuelve los partidos abiertos cuando no hay ningún cerrado ni jugado', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    const partidos = await partidosService.listarPartidosVisibles(GRUPO_ID);

    expect(partidos).toEqual([abierto]);
  });

  it('agrega el partido cerrado o jugado más reciente al final', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-03-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });
    const viejoJugado = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });
    const recienCerrado = await partidosService.crearPartido({
      fecha: '2099-02-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(viejoJugado.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(recienCerrado.id);

    const partidos = await partidosService.listarPartidosVisibles(GRUPO_ID);

    expect(partidos.map((p) => p.id)).toEqual([abierto.id, recienCerrado.id]);
  });
});

describe('partidosService.cerrarPartidosVencidos', () => {
  it('cierra los partidos abiertos cuya fecha ya pasó', async () => {
    const vencido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });
    mockDb.prepare("UPDATE Partidos SET fecha = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(vencido.id);

    partidosService.cerrarPartidosVencidos();

    const actualizado = await partidosService.obtenerPartido(vencido.id, GRUPO_ID);
    expect(actualizado.estado).toBe('cerrado');
  });

  it('no toca partidos abiertos con fecha futura', async () => {
    const futuro = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    partidosService.cerrarPartidosVencidos();

    const actual = await partidosService.obtenerPartido(futuro.id, GRUPO_ID);
    expect(actual.estado).toBe('abierto');
  });

  it('no toca partidos ya cerrados o jugados', async () => {
    const vencido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });
    mockDb
      .prepare("UPDATE Partidos SET fecha = '2020-01-01T00:00:00.000Z', estado = 'jugado' WHERE id = ?")
      .run(vencido.id);

    partidosService.cerrarPartidosVencidos();

    const actual = await partidosService.obtenerPartido(vencido.id, GRUPO_ID);
    expect(actual.estado).toBe('jugado');
  });
});

describe('partidosService.eliminarPartido', () => {
  it('rechaza con 403 si quien elimina no es el creador', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });

    await expect(partidosService.eliminarPartido(partido.id, GRUPO_ID, 'otro-admin')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('borra también los goles, rendimientos, sanciones y resultado asociados', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
      grupoId: GRUPO_ID,
    });
    mockDb
      .prepare(
        `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
         VALUES ('i1', ?, 'admin-1', 'anotado', 'titular', 0, '2026-01-01T00:00:00.000Z', 'A')`
      )
      .run(partido.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    // Se insertan directamente por SQL (en vez de usar resultadosService.guardarResultado) porque
    // resultadosService todavía llama a obtenerPartido(partidoId) con la firma vieja (sin grupoId);
    // eso se corrige en la Tarea 10 y no es responsabilidad de esta tarea.
    mockDb
      .prepare(
        `INSERT INTO Goles (id, partidoId, usuarioId, asistenciaUsuarioId, equipo, minuto)
         VALUES ('gol-1', ?, 'admin-1', NULL, 'A', 5)`
      )
      .run(partido.id);
    mockDb
      .prepare(
        `INSERT INTO SancionesPartido (id, partidoId, usuarioId, motivo)
         VALUES ('san-1', ?, 'admin-1', 'Tarjeta amarilla')`
      )
      .run(partido.id);
    mockDb
      .prepare(
        `INSERT INTO Resultados (id, partidoId, jugadorDestacadoId, fechaCarga)
         VALUES ('res-1', ?, NULL, '2026-01-01T00:00:00.000Z')`
      )
      .run(partido.id);
    mockDb
      .prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
         VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)`
      )
      .run({ id: 'rend-1', partidoId: partido.id, jugadorId: 'admin-1', votanteId: 'admin-1', puntaje: 7 });
    mockDb
      .prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId) VALUES (@id, @partidoId, @votanteId, @jugadorId)`
      )
      .run({ id: 'mvp-1', partidoId: partido.id, votanteId: 'admin-1', jugadorId: 'admin-1' });

    await partidosService.eliminarPartido(partido.id, GRUPO_ID, 'admin-1');

    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM Goles WHERE partidoId = ?').get(partido.id).n).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM RendimientosJugador WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM VotosMvp WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM SancionesPartido WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM Resultados WHERE partidoId = ?').get(partido.id).n).toBe(0);
  });
});
