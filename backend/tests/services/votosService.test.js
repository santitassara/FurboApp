const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const resultadosService = require('../../src/services/resultadosService');
const votosService = require('../../src/services/votosService');

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
  mockDb.exec('DELETE FROM Usuarios');
});

async function crearPartidoJugadoConElegibles() {
  const partido = await crearPartido();
  await crearUsuario({ uid: 'u1', email: 'u1@gmail.com', nombre: 'Jugador Uno' });
  await crearUsuario({ uid: 'u2', email: 'u2@gmail.com', nombre: 'Jugador Dos' });
  await crearUsuario({ uid: 'u3', email: 'u3@gmail.com', nombre: 'Jugador Tres' });
  insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });
  insertarInscripcion({ id: 'i2', partidoId: partido.id, usuarioId: 'u2', tipo: 'titular', equipo: 'B' });
  insertarInscripcion({ id: 'i3', partidoId: partido.id, usuarioId: 'u3', tipo: 'titular', equipo: 'A' });
  mockDb.prepare("UPDATE Partidos SET estado = 'cerrado' WHERE id = ?").run(partido.id);
  await resultadosService.guardarResultado(partido.id, {});
  return partido;
}

describe('votosService.guardarVotos', () => {
  it('rechaza si el partido no está jugado', async () => {
    const partido = await crearPartido();
    await crearUsuario({ uid: 'u1', email: 'u1@gmail.com' });
    insertarInscripcion({ id: 'i1', partidoId: partido.id, usuarioId: 'u1', tipo: 'titular', equipo: 'A' });

    await expect(
      votosService.guardarVotos(partido.id, 'u1', { valoraciones: [] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza si el votante no es elegible', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'no-elegible', { valoraciones: [] })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza calificar a un jugador no elegible', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', {
        valoraciones: [{ jugadorId: 'no-elegible', puntaje: 8 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza que un jugador se autocalifique', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', {
        valoraciones: [{ jugadorId: 'u1', puntaje: 8 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza puntaje fuera de rango 1-10', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', {
        valoraciones: [{ jugadorId: 'u2', puntaje: 11 }],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza mvpId no elegible o igual al votante', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await expect(
      votosService.guardarVotos(partido.id, 'u1', { valoraciones: [], mvpId: 'u1' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      votosService.guardarVotos(partido.id, 'u1', { valoraciones: [], mvpId: 'no-elegible' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('guarda valoraciones y mvp, y los devuelve al leer mis votos', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await votosService.guardarVotos(partido.id, 'u1', {
      valoraciones: [
        { jugadorId: 'u2', puntaje: 8 },
        { jugadorId: 'u3', puntaje: 6 },
      ],
      mvpId: 'u2',
    });

    const misVotos = await votosService.obtenerVotosDeVotante(partido.id, 'u1');
    expect(misVotos.mvpId).toBe('u2');
    expect(misVotos.valoraciones).toEqual(
      expect.arrayContaining([
        { jugadorId: 'u2', puntaje: 8 },
        { jugadorId: 'u3', puntaje: 6 },
      ])
    );
  });

  it('re-enviar el voto de un mismo jugador reemplaza el puntaje anterior (upsert)', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [{ jugadorId: 'u2', puntaje: 8 }] });
    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [{ jugadorId: 'u2', puntaje: 5 }] });

    const misVotos = await votosService.obtenerVotosDeVotante(partido.id, 'u1');
    expect(misVotos.valoraciones).toEqual([{ jugadorId: 'u2', puntaje: 5 }]);
  });

  it('enviar mvpId null no borra un voto mvp anterior', async () => {
    const partido = await crearPartidoJugadoConElegibles();

    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [], mvpId: 'u2' });
    await votosService.guardarVotos(partido.id, 'u1', { valoraciones: [{ jugadorId: 'u3', puntaje: 7 }] });

    const misVotos = await votosService.obtenerVotosDeVotante(partido.id, 'u1');
    expect(misVotos.mvpId).toBe('u2');
  });
});
