process.env.SQLITE_DB_PATH = ':memory:';

const { db } = require('../../src/config/db');

describe('config/db', () => {
  it('crea las tablas Usuarios, Partidos e Inscripciones', () => {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((fila) => fila.name);

    expect(tablas).toEqual(expect.arrayContaining(['Usuarios', 'Partidos', 'Inscripciones']));
  });

  it('crea la tabla VotosMvp y las columnas jugadorId/votanteId en RendimientosJugador', () => {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((fila) => fila.name);
    expect(tablas).toEqual(expect.arrayContaining(['VotosMvp']));

    const columnas = db.prepare('PRAGMA table_info(RendimientosJugador)').all().map((c) => c.name);
    expect(columnas).toEqual(expect.arrayContaining(['jugadorId', 'votanteId']));
  });
});
