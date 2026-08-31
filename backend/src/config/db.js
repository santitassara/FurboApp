const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function resolverRutaDb() {
  const configurada = process.env.SQLITE_DB_PATH;
  if (!configurada) return path.join(__dirname, '../../data/furboapp.db');
  if (configurada === ':memory:') return configurada;
  return path.resolve(__dirname, '../..', configurada);
}

const DB_PATH = resolverRutaDb();

console.log(`SQLite DB: ${DB_PATH}`);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const columnasUsuarios = db.prepare('PRAGMA table_info(Usuarios)').all();
const tienePasswordHash = columnasUsuarios.some((columna) => columna.name === 'passwordHash');
if (!tienePasswordHash) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordHash TEXT');
}
const tienePosicionPrincipalUsuario = columnasUsuarios.some((columna) => columna.name === 'posicionPrincipal');
if (!tienePosicionPrincipalUsuario) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN posicionPrincipal TEXT');
}
const tienePosicionSecundariaUsuario = columnasUsuarios.some((columna) => columna.name === 'posicionSecundaria');
if (!tienePosicionSecundariaUsuario) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN posicionSecundaria TEXT');
}

const columnasPerfilJugador = {
  nombreCompleto: 'TEXT',
  fechaNacimiento: 'TEXT',
  resistencia: 'TEXT',
  ritmoJuego: 'TEXT',
  velocidad: 'INTEGER',
  pegada: 'INTEGER',
  tocaPase: 'INTEGER',
  gambeta: 'INTEGER',
  marcaDefensa: 'INTEGER',
  fisico: 'INTEGER',
  fotoUrl: 'TEXT',
};
for (const [columna, tipo] of Object.entries(columnasPerfilJugador)) {
  const yaExiste = columnasUsuarios.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Usuarios ADD COLUMN ${columna} ${tipo}`);
  }
}
const tieneSuscripcionPush = columnasUsuarios.some((columna) => columna.name === 'suscripcionPush');
if (!tieneSuscripcionPush) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN suscripcionPush TEXT');
}
const tienePiernaHabil = columnasUsuarios.some((columna) => columna.name === 'piernaHabil');
if (!tienePiernaHabil) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN piernaHabil TEXT');
}
const tieneFcmToken = columnasUsuarios.some((columna) => columna.name === 'fcmToken');
if (!tieneFcmToken) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN fcmToken TEXT');
}
const tieneHabilidadesEditadas = columnasUsuarios.some((columna) => columna.name === 'habilidadesEditadas');
if (!tieneHabilidadesEditadas) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN habilidadesEditadas INTEGER NOT NULL DEFAULT 0');
}

const columnasInscripciones = db.prepare('PRAGMA table_info(Inscripciones)').all();
const tienePosicionPrincipalInscripcion = columnasInscripciones.some(
  (columna) => columna.name === 'posicionPrincipal'
);
if (!tienePosicionPrincipalInscripcion) {
  db.exec('ALTER TABLE Inscripciones ADD COLUMN posicionPrincipal TEXT');
}
const tienePosicionSecundariaInscripcion = columnasInscripciones.some(
  (columna) => columna.name === 'posicionSecundaria'
);
if (!tienePosicionSecundariaInscripcion) {
  db.exec('ALTER TABLE Inscripciones ADD COLUMN posicionSecundaria TEXT');
}

const columnasFormacion = {
  equipo: 'TEXT',
  linea: 'TEXT',
  ordenLinea: 'INTEGER',
  lado: 'TEXT',
};
for (const [columna, tipo] of Object.entries(columnasFormacion)) {
  const yaExiste = columnasInscripciones.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Inscripciones ADD COLUMN ${columna} ${tipo}`);
  }
}

const columnasRendimientos = db.prepare('PRAGMA table_info(RendimientosJugador)').all();
const tieneColumnaLegadaUsuarioId = columnasRendimientos.some((columna) => columna.name === 'usuarioId');
if (tieneColumnaLegadaUsuarioId) {
  // El modelo anterior guardaba un puntaje único puesto por el admin, sin dueño de voto:
  // no hay forma de atribuirle un votanteId real, así que se descartan al migrar.
  db.exec('DELETE FROM RendimientosJugador');
  db.exec('ALTER TABLE RendimientosJugador RENAME COLUMN usuarioId TO jugadorId');
}
const columnasRendimientosActualizadas = db.prepare('PRAGMA table_info(RendimientosJugador)').all();
const tieneVotanteId = columnasRendimientosActualizadas.some((columna) => columna.name === 'votanteId');
if (!tieneVotanteId) {
  db.exec('ALTER TABLE RendimientosJugador ADD COLUMN votanteId TEXT REFERENCES Usuarios(uid)');
}
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico ON RendimientosJugador (partidoId, jugadorId, votanteId)'
);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_mvp_unico ON VotosMvp (partidoId, votanteId)');

const columnasPartidos = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneRecordatorioEnviado = columnasPartidos.some((columna) => columna.name === 'recordatorioEnviado');
if (!tieneRecordatorioEnviado) {
  db.exec('ALTER TABLE Partidos ADD COLUMN recordatorioEnviado INTEGER NOT NULL DEFAULT 0');
}
const tieneRecordatorioPostPartidoEnviado = columnasPartidos.some((columna) => columna.name === 'recordatorioPostPartidoEnviado');
if (!tieneRecordatorioPostPartidoEnviado) {
  db.exec('ALTER TABLE Partidos ADD COLUMN recordatorioPostPartidoEnviado INTEGER NOT NULL DEFAULT 0');
}
const tieneVotacionCerrada = columnasPartidos.some((columna) => columna.name === 'votacionCerrada');
if (!tieneVotacionCerrada) {
  db.exec('ALTER TABLE Partidos ADD COLUMN votacionCerrada INTEGER NOT NULL DEFAULT 0');
}

const columnasPartidosVotacionEquipos = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneVotacionEquiposCerrada = columnasPartidosVotacionEquipos.some(
  (columna) => columna.name === 'votacionEquiposCerrada'
);
if (!tieneVotacionEquiposCerrada) {
  db.exec('ALTER TABLE Partidos ADD COLUMN votacionEquiposCerrada INTEGER NOT NULL DEFAULT 0');
}
const tienePropuestaGanadoraId = columnasPartidosVotacionEquipos.some(
  (columna) => columna.name === 'propuestaGanadoraId'
);
if (!tienePropuestaGanadoraId) {
  db.exec('ALTER TABLE Partidos ADD COLUMN propuestaGanadoraId TEXT REFERENCES FormacionesPropuestas(id)');
}

const columnasUsuariosActuales = db.prepare('PRAGMA table_info(Usuarios)').all();
const tieneEsSuperAdmin = columnasUsuariosActuales.some((columna) => columna.name === 'esSuperAdmin');
if (!tieneEsSuperAdmin) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN esSuperAdmin INTEGER NOT NULL DEFAULT 0');
}

const columnasPartidosActuales = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneGrupoId = columnasPartidosActuales.some((columna) => columna.name === 'grupoId');
if (!tieneGrupoId) {
  db.exec('ALTER TABLE Partidos ADD COLUMN grupoId TEXT');
}

const yaExisteAlgunGrupo = Boolean(db.prepare('SELECT id FROM Grupos LIMIT 1').get());
const tieneRolLegado = columnasUsuariosActuales.some((columna) => columna.name === 'rol');
if (tieneRolLegado && !yaExisteAlgunGrupo) {
  // Migración única de single-tenant a multi-tenant: crea un Grupo "Legado", le
  // asigna todos los Partidos existentes, y mete a todos los Usuarios existentes
  // como miembros de ese grupo con su rol/sanción actual.
  const migrarALegado = db.transaction(() => {
    const primerAdmin = db.prepare("SELECT uid FROM Usuarios WHERE rol = 'admin' ORDER BY fechaCreacion ASC").get();
    const primerUsuario = db.prepare('SELECT uid FROM Usuarios ORDER BY fechaCreacion ASC').get();
    const creadoPor = primerAdmin?.uid || primerUsuario?.uid;

    if (creadoPor) {
      const grupoLegadoId = crypto.randomUUID();
      const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
      db.prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES (@id, 'Legado', @codigoInvitacion, @creadoPor, @fechaCreacion)`
      ).run({
        id: grupoLegadoId,
        codigoInvitacion: `LEGADO-${sufijo}`,
        creadoPor,
        fechaCreacion: new Date().toISOString(),
      });

      db.prepare('UPDATE Partidos SET grupoId = ? WHERE grupoId IS NULL').run(grupoLegadoId);

      const usuarios = db.prepare('SELECT uid, rol, estaSancionado FROM Usuarios').all();
      for (const usuario of usuarios) {
        db.prepare(
          `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
           VALUES (@id, @grupoId, @usuarioId, @rol, @estaSancionado, @fechaIngreso)`
        ).run({
          id: crypto.randomUUID(),
          grupoId: grupoLegadoId,
          usuarioId: usuario.uid,
          rol: usuario.rol,
          estaSancionado: usuario.estaSancionado,
          fechaIngreso: new Date().toISOString(),
        });
        if (usuario.rol === 'admin') {
          db.prepare('UPDATE Usuarios SET esSuperAdmin = 1 WHERE uid = ?').run(usuario.uid);
        }
      }
    }
  });
  migrarALegado();

  try {
    db.exec('ALTER TABLE Usuarios DROP COLUMN rol');
    db.exec('ALTER TABLE Usuarios DROP COLUMN estaSancionado');
  } catch (error) {
    console.warn('No se pudieron eliminar las columnas legado rol/estaSancionado de Usuarios:', error.message);
  }
}

const columnasUsuariosParaRebuild = db.prepare('PRAGMA table_info(Usuarios)').all();
const columnaVelocidad = columnasUsuariosParaRebuild.find((columna) => columna.name === 'velocidad');
if (columnaVelocidad && columnaVelocidad.type === 'INTEGER') {
  // Las 6 habilidades pasan de INTEGER a REAL para que el motor de rating pueda
  // acumular progreso fraccionario. El resto de las columnas se derivan de
  // PRAGMA table_info en el momento de la migración (y no de una lista escrita a
  // mano) para que ninguna columna agregada vía ALTER TABLE —como fotoUrl— se
  // pierda al reconstruir la tabla.
  const HABILIDADES_A_REAL = ['velocidad', 'pegada', 'tocaPase', 'gambeta', 'marcaDefensa', 'fisico'];

  const definiciones = columnasUsuariosParaRebuild.map((columna) => {
    const tipo = HABILIDADES_A_REAL.includes(columna.name) ? 'REAL' : columna.type;
    const partes = [`"${columna.name}"`, tipo];
    if (columna.pk) partes.push('PRIMARY KEY');
    if (columna.notnull) partes.push('NOT NULL');
    if (columna.dflt_value !== null) partes.push(`DEFAULT ${columna.dflt_value}`);
    return `      ${partes.filter(Boolean).join(' ')}`;
  });
  const listaColumnas = columnasUsuariosParaRebuild.map((columna) => `"${columna.name}"`).join(', ');

  const reconstruirUsuarios = db.transaction(() => {
    db.exec(`CREATE TABLE Usuarios_nueva (\n${definiciones.join(',\n')}\n    )`);
    db.exec(`INSERT INTO Usuarios_nueva (${listaColumnas}) SELECT ${listaColumnas} FROM Usuarios`);
    db.exec('DROP TABLE Usuarios');
    db.exec('ALTER TABLE Usuarios_nueva RENAME TO Usuarios');
  });
  reconstruirUsuarios();
}

module.exports = { db };
