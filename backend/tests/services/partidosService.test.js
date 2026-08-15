const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const partidosService = require('../../src/services/partidosService');

function insertarUsuarioAdmin() {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES ('admin-1', 'Admin Uno', 'admin@gmail.com', 'admin', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run();
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Goles');
  mockDb.exec('DELETE FROM RendimientosJugador');
  mockDb.exec('DELETE FROM SancionesPartido');
  mockDb.exec('DELETE FROM Resultados');
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuarioAdmin();
});

describe('partidosService.crearPartido', () => {
  it('rechaza una fecha pasada', async () => {
    await expect(
      partidosService.crearPartido({
        fecha: '2020-01-01T20:00:00.000Z',
        cupoTitulares: 10,
        cupoSuplentes: 5,
        creadoPor: 'admin-1',
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
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('crea el partido con estado abierto cuando los datos son válidos', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
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
    const partido = await partidosService.obtenerPartido('no-existe');

    expect(partido).toBeNull();
  });

  it('devuelve el partido con id si existe', async () => {
    const creado = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    const partido = await partidosService.obtenerPartido(creado.id);

    expect(partido).toEqual(creado);
  });
});

describe('partidosService.listarPartidosVisibles', () => {
  it('devuelve los partidos abiertos cuando no hay ningún cerrado ni jugado', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    const partidos = await partidosService.listarPartidosVisibles();

    expect(partidos).toEqual([abierto]);
  });

  it('agrega el partido cerrado o jugado más reciente al final', async () => {
    const abierto = await partidosService.crearPartido({
      fecha: '2099-03-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    const viejoJugado = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    const recienCerrado = await partidosService.crearPartido({
      fecha: '2099-02-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb.prepare("UPDATE Partidos SET estado = 'jugado' WHERE id = ?").run(viejoJugado.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(recienCerrado.id);

    const partidos = await partidosService.listarPartidosVisibles();

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
    });
    mockDb.prepare("UPDATE Partidos SET fecha = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(vencido.id);

    partidosService.cerrarPartidosVencidos();

    const actualizado = await partidosService.obtenerPartido(vencido.id);
    expect(actualizado.estado).toBe('cerrado');
  });

  it('no toca partidos abiertos con fecha futura', async () => {
    const futuro = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    partidosService.cerrarPartidosVencidos();

    const actual = await partidosService.obtenerPartido(futuro.id);
    expect(actual.estado).toBe('abierto');
  });

  it('no toca partidos ya cerrados o jugados', async () => {
    const vencido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb
      .prepare("UPDATE Partidos SET fecha = '2020-01-01T00:00:00.000Z', estado = 'jugado' WHERE id = ?")
      .run(vencido.id);

    partidosService.cerrarPartidosVencidos();

    const actual = await partidosService.obtenerPartido(vencido.id);
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
    });

    await expect(partidosService.eliminarPartido(partido.id, 'otro-admin')).rejects.toMatchObject({ status: 403 });
  });

  it('borra también los goles, rendimientos, sanciones y resultado asociados', async () => {
    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
    mockDb
      .prepare(
        `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
         VALUES ('i1', ?, 'admin-1', 'anotado', 'titular', 0, '2026-01-01T00:00:00.000Z', 'A')`
      )
      .run(partido.id);
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    const resultadosService = require('../../src/services/resultadosService');
    await resultadosService.guardarResultado(partido.id, {
      goles: [{ usuarioId: 'admin-1', equipo: 'A', minuto: 5 }],
      rendimientos: [{ usuarioId: 'admin-1', puntaje: 7 }],
      sanciones: [{ usuarioId: 'admin-1', motivo: 'Tarjeta amarilla' }],
      jugadorDestacadoId: 'admin-1',
    });

    await partidosService.eliminarPartido(partido.id, 'admin-1');

    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM Goles WHERE partidoId = ?').get(partido.id).n).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM RendimientosJugador WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(
      mockDb.prepare('SELECT COUNT(*) AS n FROM SancionesPartido WHERE partidoId = ?').get(partido.id).n
    ).toBe(0);
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM Resultados WHERE partidoId = ?').get(partido.id).n).toBe(0);
  });
});
