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
  // Backfill: quien ya tiene posición cargada ya completó el perfil alguna vez
  // (posicionPrincipal es obligatorio para guardar), así que sus habilidades
  // quedan bloqueadas de entrada en vez de habilitarse de nuevo por este fix.
  db.exec(
    `UPDATE Usuarios SET habilidadesEditadas = 1
     WHERE posicionPrincipal IS NOT NULL AND posicionSecundaria IS NOT NULL`
  );
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
// idx_rendimientos_voto_unico se recrea más abajo como índice parcial (junto con
// su par para invitados) al agregar soporte de invitados a RendimientosJugador.
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

const columnasUsuariosResetPassword = db.prepare('PRAGMA table_info(Usuarios)').all();
const tienePasswordResetTokenHash = columnasUsuariosResetPassword.some(
  (columna) => columna.name === 'passwordResetTokenHash'
);
if (!tienePasswordResetTokenHash) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordResetTokenHash TEXT');
}
const tienePasswordResetExpira = columnasUsuariosResetPassword.some(
  (columna) => columna.name === 'passwordResetExpira'
);
if (!tienePasswordResetExpira) {
  db.exec('ALTER TABLE Usuarios ADD COLUMN passwordResetExpira TEXT');
}

const columnasGoles = db.prepare('PRAGMA table_info(Goles)').all();
const tieneEnContra = columnasGoles.some((columna) => columna.name === 'enContra');
if (!tieneEnContra) {
  db.exec('ALTER TABLE Goles ADD COLUMN enContra INTEGER NOT NULL DEFAULT 0');
}

const columnasPartidosBeelup = db.prepare('PRAGMA table_info(Partidos)').all();
const tieneBeelupUrl = columnasPartidosBeelup.some((columna) => columna.name === 'beelupUrl');
if (!tieneBeelupUrl) {
  db.exec('ALTER TABLE Partidos ADD COLUMN beelupUrl TEXT');
}

const columnasGrupos = db.prepare('PRAGMA table_info(Grupos)').all();
const tieneWhatsappGrupoJid = columnasGrupos.some((columna) => columna.name === 'whatsappGrupoJid');
if (!tieneWhatsappGrupoJid) {
  db.exec('ALTER TABLE Grupos ADD COLUMN whatsappGrupoJid TEXT');
}

const columnasPartidosExtendido = {
  numero: 'INTEGER',
  estadio: 'TEXT',
  tipoSuelo: 'TEXT',
  direccion: 'TEXT',
  lat: 'REAL',
  lon: 'REAL',
  valorCuota: 'INTEGER',
};
const columnasPartidosExtendidoActuales = db.prepare('PRAGMA table_info(Partidos)').all();
for (const [columna, tipo] of Object.entries(columnasPartidosExtendido)) {
  const yaExiste = columnasPartidosExtendidoActuales.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Partidos ADD COLUMN ${columna} ${tipo}`);
  }
}

// Los invitados ocupan un asiento en Inscripciones/FormacionesPropuestasDetalle sin
// tener fila en Usuarios: usuarioId pasa a nullable y se agrega invitadoId, con un
// CHECK que exige cargar exactamente uno de los dos. SQLite no permite relajar NOT
// NULL ni agregar CHECK vía ALTER TABLE, así que se reconstruye la tabla completa
// (mismo patrón que la migración de Usuarios más arriba).
function permitirInvitadoComoJugador(nombreTabla, columnaJugador, columnaInvitado, sqlRecrearIndices) {
  const columnas = db.prepare(`PRAGMA table_info(${nombreTabla})`).all();
  // La columna puede ya existir en una instalación nueva (viene en schema.sql):
  // igual hay que asegurar los índices de abajo, que no viven en schema.sql.
  if (!columnas.some((columna) => columna.name === columnaInvitado)) {
    const definiciones = columnas.map((columna) => {
      const partes = [`"${columna.name}"`, columna.type];
      if (columna.pk) partes.push('PRIMARY KEY');
      if (columna.notnull && columna.name !== columnaJugador) partes.push('NOT NULL');
      if (columna.dflt_value !== null) partes.push(`DEFAULT ${columna.dflt_value}`);
      return `      ${partes.filter(Boolean).join(' ')}`;
    });
    definiciones.push(`      "${columnaInvitado}" TEXT REFERENCES Invitados(id)`);
    const listaColumnas = columnas.map((columna) => `"${columna.name}"`).join(', ');
    const tablaNueva = `${nombreTabla}_nueva`;

    const reconstruir = db.transaction(() => {
      db.exec(
        `CREATE TABLE ${tablaNueva} (\n${definiciones.join(',\n')},\n      CHECK ((${columnaJugador} IS NOT NULL AND ${columnaInvitado} IS NULL) OR (${columnaJugador} IS NULL AND ${columnaInvitado} IS NOT NULL))\n    )`
      );
      db.exec(`INSERT INTO ${tablaNueva} (${listaColumnas}) SELECT ${listaColumnas} FROM ${nombreTabla}`);
      db.exec(`DROP TABLE ${nombreTabla}`);
      db.exec(`ALTER TABLE ${tablaNueva} RENAME TO ${nombreTabla}`);
    });
    reconstruir();
  }

  if (sqlRecrearIndices) db.exec(sqlRecrearIndices);
}

permitirInvitadoComoJugador(
  'Inscripciones',
  'usuarioId',
  'invitadoId',
  'CREATE INDEX IF NOT EXISTS idx_inscripciones_partido_estado ON Inscripciones (partidoId, estado)'
);
permitirInvitadoComoJugador(
  'FormacionesPropuestasDetalle',
  'usuarioId',
  'invitadoId',
  'CREATE INDEX IF NOT EXISTS idx_formaciones_propuestas_detalle_propuesta ON FormacionesPropuestasDetalle (propuestaId)'
);

// El resultado de un partido (goles, rendimiento, MVP, sanciones) tampoco soportaba
// invitados: estas 4 tablas solo tenían columna para Usuarios reales, así que un
// invitado no podía anotar goles/asistencias ni ser puntuado/sancionado. Mismo
// patrón de reconstrucción que arriba.
permitirInvitadoComoJugador(
  'RendimientosJugador',
  'jugadorId',
  'invitadoId',
  `CREATE INDEX IF NOT EXISTS idx_rendimientos_partido ON RendimientosJugador (partidoId);
   CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico ON RendimientosJugador (partidoId, jugadorId, votanteId) WHERE jugadorId IS NOT NULL;
   CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimientos_voto_unico_invitado ON RendimientosJugador (partidoId, invitadoId, votanteId) WHERE invitadoId IS NOT NULL;`
);
permitirInvitadoComoJugador(
  'VotosMvp',
  'jugadorId',
  'invitadoId',
  `CREATE INDEX IF NOT EXISTS idx_votos_mvp_partido ON VotosMvp (partidoId);
   CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_mvp_unico ON VotosMvp (partidoId, votanteId);`
);
permitirInvitadoComoJugador(
  'SancionesPartido',
  'usuarioId',
  'invitadoId',
  'CREATE INDEX IF NOT EXISTS idx_sanciones_partido_partido ON SancionesPartido (partidoId)'
);

// Goles necesita dos pares jugador/invitado (quién la hizo, quién asistió) y la
// asistencia es opcional (puede no haber). Se resuelven juntos en una sola
// reconstrucción para no perder el CHECK del primer par al reconstruir de nuevo.
function agregarInvitadosAGoles() {
  const columnas = db.prepare('PRAGMA table_info(Goles)').all();
  if (columnas.some((columna) => columna.name === 'invitadoId')) return;

  const definiciones = columnas.map((columna) => {
    const partes = [`"${columna.name}"`, columna.type];
    if (columna.pk) partes.push('PRIMARY KEY');
    if (columna.notnull && columna.name !== 'usuarioId') partes.push('NOT NULL');
    if (columna.dflt_value !== null) partes.push(`DEFAULT ${columna.dflt_value}`);
    return `      ${partes.filter(Boolean).join(' ')}`;
  });
  definiciones.push('      "invitadoId" TEXT REFERENCES Invitados(id)');
  definiciones.push('      "asistenciaInvitadoId" TEXT REFERENCES Invitados(id)');
  const listaColumnas = columnas.map((columna) => `"${columna.name}"`).join(', ');

  const reconstruir = db.transaction(() => {
    db.exec(
      `CREATE TABLE Goles_nueva (\n${definiciones.join(',\n')},\n` +
        '      CHECK ((usuarioId IS NOT NULL AND invitadoId IS NULL) OR (usuarioId IS NULL AND invitadoId IS NOT NULL)),\n' +
        '      CHECK (NOT (asistenciaUsuarioId IS NOT NULL AND asistenciaInvitadoId IS NOT NULL))\n' +
        '    )'
    );
    db.exec(`INSERT INTO Goles_nueva (${listaColumnas}) SELECT ${listaColumnas} FROM Goles`);
    db.exec('DROP TABLE Goles');
    db.exec('ALTER TABLE Goles_nueva RENAME TO Goles');
  });
  reconstruir();

  db.exec('CREATE INDEX IF NOT EXISTS idx_goles_partido ON Goles (partidoId)');
}
agregarInvitadosAGoles();

module.exports = { db, DB_PATH };
