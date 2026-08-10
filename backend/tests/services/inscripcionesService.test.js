const { crearDocMock, crearColeccionMock } = require('../helpers/mockFirestore');

const mockInscripcionesCol = crearColeccionMock();

jest.mock('../../src/config/firebase', () => ({
  db: { collection: jest.fn(() => mockInscripcionesCol) },
}));
jest.mock('../../src/services/usuariosService');
jest.mock('../../src/services/partidosService');

const usuariosService = require('../../src/services/usuariosService');
const partidosService = require('../../src/services/partidosService');
const inscripcionesService = require('../../src/services/inscripcionesService');

const USUARIO_OK = { uid: 'u1', estaSancionado: false };
const PARTIDO_ABIERTO = { id: 'p1', estado: 'abierto', cupoTitulares: 2, cupoSuplentes: 1 };

function mockSinInscripcionActiva() {
  mockInscripcionesCol.get.mockResolvedValueOnce({ empty: true, docs: [] });
}

function mockConteo(titulares, suplentes) {
  const docs = [
    ...Array(titulares).fill({ data: () => ({ tipo: 'titular' }) }),
    ...Array(suplentes).fill({ data: () => ({ tipo: 'suplente' }) }),
  ];
  mockInscripcionesCol.get.mockResolvedValueOnce({ docs });
}

describe('inscripcionesService.anotarse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 404 si el usuario no existe', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue(null);

    await expect(inscripcionesService.anotarse('p1', 'u1')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 403 si el usuario está sancionado', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue({ ...USUARIO_OK, estaSancionado: true });

    await expect(inscripcionesService.anotarse('p1', 'u1')).rejects.toMatchObject({ status: 403 });
  });

  it('rechaza con 400 si ya tiene una inscripción activa', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue(USUARIO_OK);
    partidosService.obtenerPartido.mockResolvedValue(PARTIDO_ABIERTO);
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'titular', estado: 'anotado' }) }],
    });

    await expect(inscripcionesService.anotarse('p1', 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('asigna tipo titular si hay lugar', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue(USUARIO_OK);
    partidosService.obtenerPartido.mockResolvedValue(PARTIDO_ABIERTO);
    mockSinInscripcionActiva();
    mockConteo(0, 0);
    mockInscripcionesCol.add.mockResolvedValue({ id: 'nueva-1' });

    const inscripcion = await inscripcionesService.anotarse('p1', 'u1');

    expect(inscripcion.tipo).toBe('titular');
  });

  it('asigna tipo suplente si los titulares están completos', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue(USUARIO_OK);
    partidosService.obtenerPartido.mockResolvedValue(PARTIDO_ABIERTO);
    mockSinInscripcionActiva();
    mockConteo(2, 0);
    mockInscripcionesCol.add.mockResolvedValue({ id: 'nueva-2' });

    const inscripcion = await inscripcionesService.anotarse('p1', 'u1');

    expect(inscripcion.tipo).toBe('suplente');
  });

  it('rechaza con 400 "Partido completo" si titulares y suplentes están llenos', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue(USUARIO_OK);
    partidosService.obtenerPartido.mockResolvedValue(PARTIDO_ABIERTO);
    mockSinInscripcionActiva();
    mockConteo(2, 1);

    await expect(inscripcionesService.anotarse('p1', 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si el partido no está abierto', async () => {
    usuariosService.obtenerUsuario.mockResolvedValue(USUARIO_OK);
    partidosService.obtenerPartido.mockResolvedValue({ ...PARTIDO_ABIERTO, estado: 'cerrado' });

    await expect(inscripcionesService.anotarse('p1', 'u1')).rejects.toMatchObject({ status: 400 });
  });
});

describe('inscripcionesService.bajarse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 400 si no hay inscripción activa', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({ empty: true, docs: [] });

    await expect(inscripcionesService.bajarse('p1', 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('sanciona al usuario si era titular', async () => {
    const docActualizarMock = crearDocMock();
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'titular', estado: 'anotado' }) }],
    });
    mockInscripcionesCol.doc.mockReturnValue(docActualizarMock);

    await inscripcionesService.bajarse('p1', 'u1');

    expect(docActualizarMock.update).toHaveBeenCalledWith({ estado: 'dado_de_baja' });
    expect(usuariosService.sancionar).toHaveBeenCalledWith('u1');
  });

  it('NO sanciona al usuario si era suplente', async () => {
    const docActualizarMock = crearDocMock();
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'suplente', estado: 'anotado' }) }],
    });
    mockInscripcionesCol.doc.mockReturnValue(docActualizarMock);

    await inscripcionesService.bajarse('p1', 'u1');

    expect(usuariosService.sancionar).not.toHaveBeenCalled();
  });
});

describe('inscripcionesService.promover', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 404 si el usuario no tiene inscripción activa', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({ empty: true, docs: [] });

    await expect(inscripcionesService.promover('p1', 'u1')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 400 si el usuario ya es titular', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'titular', estado: 'anotado' }) }],
    });

    await expect(inscripcionesService.promover('p1', 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza con 400 si no hay cupo de titular libre', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'suplente', estado: 'anotado' }) }],
    });
    partidosService.obtenerPartido.mockResolvedValue(PARTIDO_ABIERTO);
    mockConteo(2, 1);

    await expect(inscripcionesService.promover('p1', 'u1')).rejects.toMatchObject({ status: 400 });
  });

  it('promueve a titular si hay cupo libre', async () => {
    const docActualizarMock = crearDocMock();
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'suplente', estado: 'anotado' }) }],
    });
    partidosService.obtenerPartido.mockResolvedValue(PARTIDO_ABIERTO);
    mockConteo(1, 1);
    mockInscripcionesCol.doc.mockReturnValue(docActualizarMock);

    const inscripcion = await inscripcionesService.promover('p1', 'u1');

    expect(inscripcion.tipo).toBe('titular');
    expect(docActualizarMock.update).toHaveBeenCalledWith({ tipo: 'titular' });
  });

  it('rechaza con 404 si el partido no existe', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'suplente', estado: 'anotado' }) }],
    });
    partidosService.obtenerPartido.mockResolvedValue(null);

    await expect(inscripcionesService.promover('p1', 'u1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('inscripcionesService.sancionarManualmente', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 404 si no hay inscripción activa', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({ empty: true, docs: [] });

    await expect(inscripcionesService.sancionarManualmente('p1', 'u1')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 400 si el jugador es suplente', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'suplente', estado: 'anotado' }) }],
    });

    await expect(inscripcionesService.sancionarManualmente('p1', 'u1')).rejects.toMatchObject({ status: 400 });
    expect(usuariosService.sancionar).not.toHaveBeenCalled();
  });

  it('da de baja y sanciona al usuario si es titular', async () => {
    const docActualizarMock = crearDocMock();
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'titular', estado: 'anotado' }) }],
    });
    mockInscripcionesCol.doc.mockReturnValue(docActualizarMock);

    const inscripcion = await inscripcionesService.sancionarManualmente('p1', 'u1');

    expect(docActualizarMock.update).toHaveBeenCalledWith({ estado: 'dado_de_baja' });
    expect(usuariosService.sancionar).toHaveBeenCalledWith('u1');
    expect(inscripcion.estado).toBe('dado_de_baja');
  });
});

describe('inscripcionesService.listarActivas', () => {
  it('devuelve solo inscripciones con estado anotado, mapeadas con id', async () => {
    const docs = [
      { id: 'i1', data: () => ({ partidoId: 'p1', usuarioId: 'u1', estado: 'anotado', tipo: 'titular' }) },
    ];
    mockInscripcionesCol.get.mockResolvedValueOnce({ docs });

    const activas = await inscripcionesService.listarActivas('p1');

    expect(activas).toEqual([{ id: 'i1', partidoId: 'p1', usuarioId: 'u1', estado: 'anotado', tipo: 'titular' }]);
    expect(mockInscripcionesCol.where).toHaveBeenCalledWith('estado', '==', 'anotado');
  });
});
