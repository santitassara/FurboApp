process.env.SQLITE_DB_PATH = ':memory:';

const { db } = require('../../src/config/db');

describe('config/db', () => {
  it('crea las tablas Usuarios, Grupos, UsuariosGrupos, Partidos e Inscripciones', () => {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((fila) => fila.name);

    expect(tablas).toEqual(
      expect.arrayContaining(['Usuarios', 'Grupos', 'UsuariosGrupos', 'Partidos', 'Inscripciones'])
    );
  });

  it('Usuarios tiene esSuperAdmin y ya no tiene rol ni estaSancionado', () => {
    const columnas = db.prepare('PRAGMA table_info(Usuarios)').all().map((c) => c.name);
    expect(columnas).toEqual(expect.arrayContaining(['esSuperAdmin']));
    expect(columnas).not.toEqual(expect.arrayContaining(['rol']));
    expect(columnas).not.toEqual(expect.arrayContaining(['estaSancionado']));
  });

  it('Partidos tiene grupoId NOT NULL', () => {
    const columnas = db.prepare('PRAGMA table_info(Partidos)').all();
    const columna = columnas.find((c) => c.name === 'grupoId');
    expect(columna).toBeDefined();
    expect(columna.notnull).toBe(1);
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

  it('crea la columna recordatorioEnviado en Partidos con default 0', () => {
    const columnas = db.prepare('PRAGMA table_info(Partidos)').all();
    const columna = columnas.find((c) => c.name === 'recordatorioEnviado');
    expect(columna).toBeDefined();
    expect(columna.notnull).toBe(1);
  });
});
