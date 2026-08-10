const { crearDocMock, crearColeccionMock } = require('../helpers/mockFirestore');

const mockPartidosCol = crearColeccionMock();

jest.mock('../../src/config/firebase', () => ({
  db: { collection: jest.fn(() => mockPartidosCol) },
}));

const partidosService = require('../../src/services/partidosService');

describe('partidosService.crearPartido', () => {
  beforeEach(() => jest.clearAllMocks());

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
    mockPartidosCol.add.mockResolvedValue({ id: 'partido-1' });

    const partido = await partidosService.crearPartido({
      fecha: '2099-01-01T20:00:00.000Z',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });

    expect(partido).toMatchObject({
      id: 'partido-1',
      estado: 'abierto',
      cupoTitulares: 10,
      cupoSuplentes: 5,
      creadoPor: 'admin-1',
    });
  });
});

describe('partidosService.obtenerPartido', () => {
  beforeEach(() => jest.clearAllMocks());

  it('devuelve null si no existe', async () => {
    const docMock = crearDocMock({ get: jest.fn().mockResolvedValue({ exists: false }) });
    mockPartidosCol.doc.mockReturnValue(docMock);

    const partido = await partidosService.obtenerPartido('no-existe');

    expect(partido).toBeNull();
  });

  it('devuelve el partido con id si existe', async () => {
    const docMock = crearDocMock({
      get: jest.fn().mockResolvedValue({
        exists: true,
        id: 'partido-1',
        data: () => ({ estado: 'abierto', cupoTitulares: 10, cupoSuplentes: 5 }),
      }),
    });
    mockPartidosCol.doc.mockReturnValue(docMock);

    const partido = await partidosService.obtenerPartido('partido-1');

    expect(partido).toEqual({ id: 'partido-1', estado: 'abierto', cupoTitulares: 10, cupoSuplentes: 5 });
  });
});

describe('partidosService.listarPartidosAbiertos', () => {
  it('mapea los docs a partidos con id', async () => {
    const docs = [
      { id: 'p1', data: () => ({ estado: 'abierto' }) },
      { id: 'p2', data: () => ({ estado: 'abierto' }) },
    ];
    mockPartidosCol.get.mockResolvedValue({ docs });

    const partidos = await partidosService.listarPartidosAbiertos();

    expect(partidos).toEqual([
      { id: 'p1', estado: 'abierto' },
      { id: 'p2', estado: 'abierto' },
    ]);
    expect(mockPartidosCol.where).toHaveBeenCalledWith('estado', '==', 'abierto');
  });
});
