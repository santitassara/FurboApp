const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

describe('Apuestas DB Schema', () => {
  test('UsuarioPuntos table exists with correct columns', () => {
    const cols = mockDb.prepare('PRAGMA table_info(UsuarioPuntos)').all();
    const names = cols.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['usuarioId', 'saldo', 'actualizadoEn']));
    // Check primary key
    const pkCols = cols.filter(c => c.pk === 1);
    expect(pkCols.map(c => c.name)).toEqual(['usuarioId']);
    // Check default saldo
    const saldoCol = cols.find(c => c.name === 'saldo');
    expect(saldoCol.notnull).toBe(1);
    expect(saldoCol.dflt_value).toBe('100');
  });

  test('Apuestas table exists with correct columns and indices', () => {
    const cols = mockDb.prepare('PRAGMA table_info(Apuestas)').all();
    const names = cols.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining([
      'id', 'partidoId', 'usuarioId', 'tipo', 'seleccion',
      'cuota', 'monto', 'estado', 'gananciaPotencial', 'gananciaReal',
      'fechaCreacion', 'fechaResolucion'
    ]));
    // Check primary key
    const pkCols = cols.filter(c => c.pk === 1);
    expect(pkCols.map(c => c.name)).toEqual(['id']);
    // Check estado check constraint values
    const estadoCol = cols.find(c => c.name === 'estado');
    expect(estadoCol.notnull).toBe(1);

    // Check indices
    const indices = mockDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Apuestas'").all();
    const indexNames = indices.map(i => i.name);
    expect(indexNames).toEqual(expect.arrayContaining([
      'idx_apuestas_partido_usuario',
      'idx_apuestas_estado',
      'idx_apuestas_partido_tipo'
    ]));
  });

  test('Can insert and query UsuarioPuntos', () => {
    const result = mockDb.prepare(
      'INSERT INTO UsuarioPuntos (usuarioId, saldo, actualizadoEn) VALUES (?, ?, ?)'
    ).run('test-uid', 100, new Date().toISOString());
    expect(result.changes).toBe(1);

    const row = mockDb.prepare('SELECT saldo FROM UsuarioPuntos WHERE usuarioId = ?').get('test-uid');
    expect(row.saldo).toBe(100);

    // Cleanup
    mockDb.prepare('DELETE FROM UsuarioPuntos WHERE usuarioId = ?').run('test-uid');
  });

  test('Can insert and query Apuestas', () => {
    const partidoId = 'partido-test';
    const usuarioId = 'user-test';
    const now = new Date().toISOString();

    const result = mockDb.prepare(`
      INSERT INTO Apuestas (id, partidoId, usuarioId, tipo, seleccion, cuota, monto, estado, gananciaPotencial, gananciaReal, fechaCreacion, fechaResolucion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('apuesta-1', partidoId, usuarioId, 'winner', 'A', 1.8, 50, 'pendiente', 90, 0, now, null);

    expect(result.changes).toBe(1);

    const row = mockDb.prepare('SELECT * FROM Apuestas WHERE id = ?').get('apuesta-1');
    expect(row.partidoId).toBe(partidoId);
    expect(row.usuarioId).toBe(usuarioId);
    expect(row.tipo).toBe('winner');
    expect(row.seleccion).toBe('A');
    expect(row.cuota).toBe(1.8);
    expect(row.monto).toBe(50);
    expect(row.estado).toBe('pendiente');
    expect(row.gananciaPotencial).toBe(90);
    expect(row.gananciaReal).toBe(0);

    // Cleanup
    mockDb.prepare('DELETE FROM Apuestas WHERE id = ?').run('apuesta-1');
  });
});