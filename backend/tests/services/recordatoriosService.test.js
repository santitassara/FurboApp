const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const mockEnviarMail = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/utils/mailer', () => ({ enviarMail: (...args) => mockEnviarMail(...args) }));

const recordatoriosService = require('../../src/services/recordatoriosService');

const AHORA = Date.now();
const EN_UNA_HORA = new Date(AHORA + 60 * 60 * 1000).toISOString();
const EN_TRES_HORAS = new Date(AHORA + 3 * 60 * 60 * 1000).toISOString();
const HACE_UNA_HORA = new Date(AHORA - 60 * 60 * 1000).toISOString();

function insertarUsuario(uid, nombre, email) {
  mockDb
    .prepare(
      `INSERT INTO Usuarios (uid, nombre, email, rol, estaSancionado, fechaCreacion)
       VALUES (?, ?, ?, 'jugador', 0, '2026-01-01T00:00:00.000Z')`
    )
    .run(uid, nombre, email);
}

function insertarPartido(id, fecha, recordatorioEnviado = 0) {
  mockDb
    .prepare(
      `INSERT INTO Partidos (id, fecha, estado, creadoPor, cupoTitulares, cupoSuplentes, recordatorioEnviado)
       VALUES (?, ?, 'abierto', 'admin-1', 10, 5, ?)`
    )
    .run(id, fecha, recordatorioEnviado);
}

function insertarInscripcion(id, partidoId, usuarioId, tipo, equipo = null) {
  mockDb
    .prepare(
      `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion, equipo)
       VALUES (?, ?, ?, 'anotado', ?, 0, '2026-01-01T00:00:00.000Z', ?)`
    )
    .run(id, partidoId, usuarioId, tipo, equipo);
}

beforeEach(() => {
  mockDb.exec('DELETE FROM Inscripciones');
  mockDb.exec('DELETE FROM Partidos');
  mockDb.exec('DELETE FROM Usuarios');
  insertarUsuario('admin-1', 'Admin Uno', 'admin@mail.com');
  mockEnviarMail.mockClear();
  mockEnviarMail.mockResolvedValue(undefined);
});

describe('recordatoriosService.enviarRecordatoriosPendientes', () => {
  it('envía un mail por titular y marca el partido como procesado', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarUsuario('u2', 'Pedro', 'pedro@mail.com');
    insertarPartido('p1', EN_UNA_HORA);
    insertarInscripcion('i1', 'p1', 'u1', 'titular', 'A');
    insertarInscripcion('i2', 'p1', 'u2', 'titular', 'B');

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(mockEnviarMail).toHaveBeenCalledTimes(2);
    expect(mockEnviarMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@mail.com', subject: 'Tu partido es en 1 hora' })
    );
    const htmlJuan = mockEnviarMail.mock.calls.find((c) => c[0].to === 'juan@mail.com')[0].html;
    expect(htmlJuan).toContain('Pedro');
    expect(htmlJuan).toContain('equipo A');
    expect(htmlJuan).toContain('Sos titular, no faltes. No te cagués en tus amigos. La pelota no se mancha.');

    const partido = mockDb.prepare('SELECT recordatorioEnviado FROM Partidos WHERE id = ?').get('p1');
    expect(partido.recordatorioEnviado).toBe(1);
  });

  it('no envía nada pero marca el partido si no hay titulares', async () => {
    insertarPartido('p2', EN_UNA_HORA);

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(mockEnviarMail).not.toHaveBeenCalled();
    const partido = mockDb.prepare('SELECT recordatorioEnviado FROM Partidos WHERE id = ?').get('p2');
    expect(partido.recordatorioEnviado).toBe(1);
  });

  it('ignora partidos ya marcados como procesados', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarPartido('p3', EN_UNA_HORA, 1);
    insertarInscripcion('i1', 'p3', 'u1', 'titular');

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(mockEnviarMail).not.toHaveBeenCalled();
  });

  it('ignora partidos fuera de la ventana de 1 hora', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarPartido('p4', EN_TRES_HORAS);
    insertarPartido('p5', HACE_UNA_HORA);
    insertarInscripcion('i1', 'p4', 'u1', 'titular');
    insertarInscripcion('i2', 'p5', 'u1', 'titular');

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(mockEnviarMail).not.toHaveBeenCalled();
  });

  it('escapa HTML en el nombre de un compañero antes de interpolarlo en el mail', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarUsuario('u2', '<img src=x onerror=alert(1)>', 'atacante@mail.com');
    insertarPartido('p7', EN_UNA_HORA);
    insertarInscripcion('i1', 'p7', 'u1', 'titular', 'A');
    insertarInscripcion('i2', 'p7', 'u2', 'titular', 'B');

    await recordatoriosService.enviarRecordatoriosPendientes();

    const htmlJuan = mockEnviarMail.mock.calls.find((c) => c[0].to === 'juan@mail.com')[0].html;
    expect(htmlJuan).not.toContain('<img src=x onerror=alert(1)>');
    expect(htmlJuan).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('sigue enviando a los demás titulares si un envío individual falla', async () => {
    insertarUsuario('u1', 'Juan', 'juan@mail.com');
    insertarUsuario('u2', 'Pedro', 'pedro@mail.com');
    insertarPartido('p6', EN_UNA_HORA);
    insertarInscripcion('i1', 'p6', 'u1', 'titular');
    insertarInscripcion('i2', 'p6', 'u2', 'titular');
    mockEnviarMail.mockImplementation(({ to }) => {
      if (to === 'juan@mail.com') return Promise.reject(new Error('SMTP caído'));
      return Promise.resolve();
    });

    await recordatoriosService.enviarRecordatoriosPendientes();

    expect(mockEnviarMail).toHaveBeenCalledTimes(2);
    const partido = mockDb.prepare('SELECT recordatorioEnviado FROM Partidos WHERE id = ?').get('p6');
    expect(partido.recordatorioEnviado).toBe(1);
  });
});
