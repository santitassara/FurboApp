const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');

const GRUPO_ID = 'grupo-1';

async function crearUsuario(overrides = {}) {
  return usuariosService.sincronizarUsuario({
    uid: 'u1',
    email: 'u1@gmail.com',
    nombre: 'Usuario Uno',
    ...overrides,
  });
}

async function crearPartido(overrides = {}) {
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

function insertarInscripcion({ id, partidoId, usuarioId, tipo = 'titular', equipo = null }) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
       VALUES (@id, @partidoId, @usuarioId, 'anotado', @tipo, 0, '2026-01-01T00:00:00.000Z', @equipo)`
    )
    .run({ id, partidoId, usuarioId, tipo, equipo });
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

async function crearPartidoConElegibles() {
  const partido = await crearPartido();
  await crearUsuario({ uid: 'u1', email: 'u1@gmail.com', nombre: 'Jugador Uno' });
  await crearUsuario({ uid: 'u2', email: 'u2@gmail.com', nombre: 'Jugador Dos' });
  insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });
  insertarInscripcion({ id: 'i2', partidoId: partido.id, usuarioId: 'u2', tipo: 'titular', equipo: 'B' });
  return partido;
}

describe('resultadosService.obtenerElegibles', () => {
  it('devuelve solo titulares con equipo asignado', async () => {
    const partido = await crearPartido();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    await crearUsuario({ uid: 'u2', email: 'u2@gmail.com' });
    await crearUsuario({ uid: 'u3', email: 'u3@gmail.com' });
    insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });
    insertarInscripcion({ id: 'i2', partidoId: partido.id, usuarioId: 'u2', tipo: 'titular', equipo: null });
    insertarInscripcion({ id: 'i3', partidoId: partido.id, usuarioId: 'u3', tipo: 'suplente', equipo: null });

    const elegibles = await resultadosService.obtenerElegibles(partido.id);

    expect(elegibles).toEqual(['u1']);
  });

  it('devuelve arreglo vacío si nadie tiene equipo asignado', async () => {
    const partido = await crearPartido();

    const elegibles = await resultadosService.obtenerElegibles(partido.id);

    expect(elegibles).toEqual([]);
  });
});

describe('resultadosService.guardarResultado', () => {
  it('rechaza con 400 si el partido está abierto', async () => {
    const partido = await crearPartidoConElegibles();

    await expect(resultadosService.guardarResultado(partido.id, GRUPO_ID, {})).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si no hay elegibles (formación no guardada)', async () => {
    const partido = await crearPartido();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(resultadosService.guardarResultado(partido.id, GRUPO_ID, {})).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza un gol de un jugador no elegible', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(
      resultadosService.guardarResultado(partido.id, GRUPO_ID, {
        goles: [{ usuarioId: 'no-elegible', equipo: 'A', minuto: 10 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza si el autor y la asistencia son el mismo jugador', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await expect(
      resultadosService.guardarResultado(partido.id, GRUPO_ID, {
        goles: [{ usuarioId: 'u1', equipo: 'A', minuto: 5, asistenciaUsuarioId: 'u1' }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('guarda el resultado completo y pasa el partido a jugado', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    const resultado = await resultadosService.guardarResultado(partido.id, GRUPO_ID, {
      goles: [
        { usuarioId: 'u1', equipo: 'A', minuto: 10, asistenciaUsuarioId: 'u2' },
        { usuarioId: 'u2', equipo: 'B', minuto: 20 },
      ],
      sanciones: [{ usuarioId: 'u2', motivo: 'Tarjeta roja' }],
    });

    expect(resultado.marcador).toEqual({ A: 1, B: 1 });
    expect(resultado.goles).toHaveLength(2);
    expect(resultado.goles[0]).toMatchObject({ usuarioId: 'u1', minuto: 10, asistenciaNombre: 'Jugador Dos' });
    expect(resultado.sanciones).toEqual([{ usuarioId: 'u2', nombre: 'Jugador Dos', motivo: 'Tarjeta roja' }]);
    expect(resultado.rendimientos).toEqual(
      expect.arrayContaining([
        { usuarioId: 'u1', nombre: 'Jugador Uno', promedio: null, votos: 0 },
        { usuarioId: 'u2', nombre: 'Jugador Dos', promedio: null, votos: 0 },
      ])
    );
    expect(resultado.jugadorDestacado).toEqual({ jugadores: [], votos: 0, totalElegibles: 2 });

    const partidoActualizado = await partidosService.obtenerPartido(partido.id, GRUPO_ID);
    expect(partidoActualizado.estado).toBe('jugado');
  });

  it('al recargar reemplaza el resultado anterior en vez de acumularlo', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);

    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {
      goles: [{ usuarioId: 'u1', equipo: 'A', minuto: 10 }],
    });
    const segundo = await resultadosService.guardarResultado(partido.id, GRUPO_ID, {
      goles: [{ usuarioId: 'u2', equipo: 'B', minuto: 5 }],
    });

    expect(segundo.goles).toHaveLength(1);
    expect(segundo.goles[0]).toMatchObject({ usuarioId: 'u2' });
  });
});

describe('resultadosService.obtenerResultado', () => {
  it('devuelve null si todavía no se cargó', async () => {
    const partido = await crearPartidoConElegibles();

    const resultado = await resultadosService.obtenerResultado(partido.id, GRUPO_ID);

    expect(resultado).toBeNull();
  });
});

describe('resultadosService.obtenerResultado — rendimientos y mvp votados', () => {
  function insertarVoto({ partidoId, jugadorId, votanteId, puntaje }) {
    mockDb
      .prepare(
        `INSERT INTO RendimientosJugador (id, partidoId, jugadorId, votanteId, puntaje)
         VALUES (@id, @partidoId, @jugadorId, @votanteId, @puntaje)`
      )
      .run({ id: `${jugadorId}-${votanteId}`, partidoId, jugadorId, votanteId, puntaje });
  }

  function insertarVotoMvp({ partidoId, votanteId, jugadorId }) {
    mockDb
      .prepare(
        `INSERT INTO VotosMvp (id, partidoId, votanteId, jugadorId) VALUES (@id, @partidoId, @votanteId, @jugadorId)`
      )
      .run({ id: `${votanteId}-mvp`, partidoId, votanteId, jugadorId });
  }

  it('promedia los votos recibidos y marca sin votos a quien no recibió ninguno', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {});
    insertarVoto({ partidoId: partido.id, jugadorId: 'u1', votanteId: 'u2', puntaje: 8 });
    insertarVoto({ partidoId: partido.id, jugadorId: 'u1', votanteId: 'admin-1', puntaje: 6 });

    const resultado = await resultadosService.obtenerResultado(partido.id, GRUPO_ID);

    expect(resultado.rendimientos).toEqual(
      expect.arrayContaining([
        { usuarioId: 'u1', nombre: 'Jugador Uno', promedio: 7, votos: 2 },
        { usuarioId: 'u2', nombre: 'Jugador Dos', promedio: null, votos: 0 },
      ])
    );
  });

  it('muestra empatados como destacados cuando hay igual cantidad de votos mvp', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {});
    insertarVotoMvp({ partidoId: partido.id, votanteId: 'u1', jugadorId: 'u2' });
    insertarVotoMvp({ partidoId: partido.id, votanteId: 'admin-1', jugadorId: 'u1' });

    const resultado = await resultadosService.obtenerResultado(partido.id, GRUPO_ID);

    expect(resultado.jugadorDestacado.votos).toBe(1);
    expect(resultado.jugadorDestacado.totalElegibles).toBe(2);
    expect(resultado.jugadorDestacado.jugadores).toEqual(
      expect.arrayContaining([
        { usuarioId: 'u1', nombre: 'Jugador Uno' },
        { usuarioId: 'u2', nombre: 'Jugador Dos' },
      ])
    );
  });

  it('sin votos mvp devuelve lista vacía', async () => {
    const partido = await crearPartidoConElegibles();
    mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
    await resultadosService.guardarResultado(partido.id, GRUPO_ID, {});

    const resultado = await resultadosService.obtenerResultado(partido.id, GRUPO_ID);

    expect(resultado.jugadorDestacado).toEqual({ jugadores: [], votos: 0, totalElegibles: 2 });
  });
});

describe('resultadosService.obtenerResultado — aislamiento por grupo', () => {
  it('rechaza con 404 si el partido pertenece a otro grupo', async () => {
    mockDb
      .prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES ('grupo-2', 'Otro grupo', 'TEST-0002', 'admin-1', '2026-01-01T00:00:00.000Z')`
      )
      .run();
    const partido = await crearPartidoConElegibles();

    await expect(resultadosService.obtenerResultado(partido.id, 'grupo-2')).rejects.toMatchObject({ status: 404 });
  });
});
