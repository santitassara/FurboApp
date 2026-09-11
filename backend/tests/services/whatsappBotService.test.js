const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const { generarRespuestaLocal } = require('../../src/services/whatsappBotService');

const GRUPO_ID = 'grupo-1';
const PARTIDO_ID = 'partido-1';

function insertarUsuario(uid, nombre) {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
       VALUES (?, ?, ?, 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, `${uid}@gmail.com`);
}

function insertarGrupo() {
  mockDb
    .prepare(
      `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
       VALUES (?, 'Grupo de test', 'TEST-0001', 'admin-1', '2026-01-01T00:00:00.000Z')`
    )
    .run(GRUPO_ID);
}

function insertarPartidoAbierto() {
  mockDb
    .prepare(
      `INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes)
       VALUES (?, '2099-01-01T23:00:00.000Z', 'abierto', 'admin-1', ?, 10, 5)`
    )
    .run(PARTIDO_ID, GRUPO_ID);
}

function insertarInscripcion({ id, usuarioId, tipo = 'titular', estado = 'anotado', equipo = null, ordenLinea = 1 }) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo, linea, ordenLinea, lado)
       VALUES (?, ?, ?, ?, ?, 1, '2026-01-01T00:00:00.000Z', ?, 'medio', ?, 'izquierda')`
    )
    .run(id, PARTIDO_ID, usuarioId, estado, tipo, equipo, ordenLinea);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Grupos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuario('admin-1', 'Admin Uno');
  insertarGrupo();
  insertarPartidoAbierto();
});

describe('generarRespuestaLocal — consulta de equipos', () => {
  it('muestra los jugadores de cada equipo cuando ya están armados', () => {
    insertarUsuario('u-1', 'Messi');
    insertarUsuario('u-2', 'Di María');
    insertarUsuario('u-3', 'Dibu');
    insertarInscripcion({ id: 'i-1', usuarioId: 'u-1', equipo: 'A', ordenLinea: 1 });
    insertarInscripcion({ id: 'i-2', usuarioId: 'u-2', equipo: 'A', ordenLinea: 2 });
    insertarInscripcion({ id: 'i-3', usuarioId: 'u-3', equipo: 'B', ordenLinea: 1 });

    const respuesta = generarRespuestaLocal(GRUPO_ID, '¿Cómo quedaron los equipos?');

    expect(respuesta).toContain('*Equipo A* (2)');
    expect(respuesta).toContain('• Messi');
    expect(respuesta).toContain('• Di María');
    expect(respuesta).toContain('*Equipo B* (1)');
    expect(respuesta).toContain('• Dibu');
  });

  it('avisa cuando todavía no hay equipos armados', () => {
    insertarUsuario('u-1', 'Messi');
    insertarInscripcion({ id: 'i-1', usuarioId: 'u-1', equipo: null });

    const respuesta = generarRespuestaLocal(GRUPO_ID, 'pasá la formación');

    expect(respuesta).toBe('Todavía no están armados los equipos para el próximo partido.');
  });

  it('ignora suplentes y jugadores dados de baja', () => {
    insertarUsuario('u-1', 'Messi');
    insertarUsuario('u-2', 'Suplente');
    insertarUsuario('u-3', 'Bajado');
    insertarInscripcion({ id: 'i-1', usuarioId: 'u-1', equipo: 'A' });
    insertarInscripcion({ id: 'i-2', usuarioId: 'u-2', tipo: 'suplente', equipo: 'A' });
    insertarInscripcion({ id: 'i-3', usuarioId: 'u-3', estado: 'dado_de_baja', equipo: 'B' });

    const respuesta = generarRespuestaLocal(GRUPO_ID, 'equipos');

    expect(respuesta).toContain('*Equipo A* (1)');
    expect(respuesta).not.toContain('Suplente');
    expect(respuesta).not.toContain('Bajado');
    expect(respuesta).not.toContain('Equipo B');
  });

  it('sigue respondiendo la cantidad de anotados cuando no preguntan por equipos', () => {
    insertarUsuario('u-1', 'Messi');
    insertarInscripcion({ id: 'i-1', usuarioId: 'u-1', equipo: 'A' });

    const respuesta = generarRespuestaLocal(GRUPO_ID, '¿cuántos estamos?');

    expect(respuesta).toContain('*1/10* titulares');
  });

  it('no consulta equipos si no hay partido abierto', () => {
    mockDb.exec('DELETE FROM Inscripciones');
    mockDb.exec('DELETE FROM Partidos');

    expect(generarRespuestaLocal(GRUPO_ID, 'equipos')).toBe('No hay ningún partido abierto por ahora.');
  });
});
