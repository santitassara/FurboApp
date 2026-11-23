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
const tieneSegundo = columnasGoles.some((columna) => columna.name === 'segundo');
if (!tieneSegundo) {
  db.exec('ALTER TABLE Goles ADD COLUMN segundo INTEGER NOT NULL DEFAULT 0');
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

// Migración: agregar columna fecha a VotosMvp para tie-breaking MVP
const columnasVotosMvpFecha = db.prepare('PRAGMA table_info(VotosMvp)').all();
if (!columnasVotosMvpFecha.some((columna) => columna.name === 'fecha')) {
  // SQLite no permite DEFAULT no-constante en ALTER TABLE, así que agregamos sin default
  db.exec('ALTER TABLE VotosMvp ADD COLUMN fecha TEXT');
  // Actualizar filas existentes con timestamp actual
  const now = new Date().toISOString();
  db.exec(`UPDATE VotosMvp SET fecha = '${now}' WHERE fecha IS NULL`);
}

// Agregar columna peso a VotosFormacion para voto doble
const columnasVotosFormacion = db.prepare('PRAGMA table_info(VotosFormacion)').all();
if (!columnasVotosFormacion.some((columna) => columna.name === 'peso')) {
  db.exec('ALTER TABLE VotosFormacion ADD COLUMN peso INTEGER NOT NULL DEFAULT 1');
}

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

// Modo del grupo: "convocatoria" (picadas con dos equipos) o "plantel" (un solo equipo
// con pizarra táctica, fixture de torneo y MVP elegido por el admin). Los grupos
// preexistentes quedan como convocatoria por defecto.
const columnasGruposModo = db.prepare('PRAGMA table_info(Grupos)').all();
if (!columnasGruposModo.some((columna) => columna.name === 'modo')) {
  db.exec(
    "ALTER TABLE Grupos ADD COLUMN modo TEXT NOT NULL DEFAULT 'convocatoria' CHECK (modo IN ('convocatoria', 'plantel'))"
  );
}

// Bitácora del torneo (modo plantel): rival del partido, notas tácticas sobre el
// rival y código de la formación persistido por el admin en la pizarra.
const columnasPartidosBitacora = {
  rival: 'TEXT',
  notasTacticas: 'TEXT',
  formacionCodigo: 'TEXT',
};
const columnasPartidosBitacoraActuales = db.prepare('PRAGMA table_info(Partidos)').all();
for (const [columna, tipo] of Object.entries(columnasPartidosBitacora)) {
  const yaExiste = columnasPartidosBitacoraActuales.some((c) => c.name === columna);
  if (!yaExiste) {
    db.exec(`ALTER TABLE Partidos ADD COLUMN ${columna} ${tipo}`);
  }
}

// Goles del rival en el resultado de un partido de plantel (el rival no está en la app).
const columnasResultadosGolesRival = db.prepare('PRAGMA table_info(Resultados)').all();
if (!columnasResultadosGolesRival.some((columna) => columna.name === 'golesRival')) {
  db.exec('ALTER TABLE Resultados ADD COLUMN golesRival INTEGER NOT NULL DEFAULT 0');
}

// Tabla UsuarioPuntos (puntos virtuales para apuestas)
const tieneUsuarioPuntos = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='UsuarioPuntos'").get();
if (!tieneUsuarioPuntos) {
  db.exec(`
    CREATE TABLE UsuarioPuntos (
      usuarioId TEXT PRIMARY KEY REFERENCES Usuarios(uid),
      saldo INTEGER NOT NULL DEFAULT 100,
      actualizadoEn TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usuario_puntos_saldo ON UsuarioPuntos(saldo);
  `);
}

// Tabla CasaPuntos (pozo de la casa - solo lectura, se incrementa con excedentes)
const tieneCasaPuntos = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CasaPuntos'").get();
if (!tieneCasaPuntos) {
  db.exec(`
    CREATE TABLE CasaPuntos (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      saldo INTEGER NOT NULL DEFAULT 0,
      actualizadoEn TEXT NOT NULL
    );
    INSERT INTO CasaPuntos (id, saldo, actualizadoEn) VALUES (1, 0, datetime('now'));
  `);
}

// Tabla Apuestas
const tieneApuestas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Apuestas'").get();
if (!tieneApuestas) {
  db.exec(`
    CREATE TABLE Apuestas (
      id TEXT PRIMARY KEY,
      partidoId TEXT NOT NULL REFERENCES Partidos(id),
      usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
      tipo TEXT NOT NULL,
      seleccion TEXT NOT NULL,
      cuota REAL NOT NULL,
      monto INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','ganada','perdida','reembolsada')),
      gananciaPotencial INTEGER NOT NULL,
      gananciaReal INTEGER DEFAULT 0,
      fechaCreacion TEXT NOT NULL,
      fechaResolucion TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_apuestas_partido_usuario ON Apuestas(partidoId, usuarioId);
    CREATE INDEX IF NOT EXISTS idx_apuestas_estado ON Apuestas(estado);
    CREATE INDEX IF NOT EXISTS idx_apuestas_partido_tipo ON Apuestas(partidoId, tipo);
  `);
}

// Tabla PremiosCatalogo
const tienePremiosCatalogo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='PremiosCatalogo'").get();
if (!tienePremiosCatalogo) {
  db.exec(`
    CREATE TABLE PremiosCatalogo (
      id TEXT PRIMARY KEY,
      clave TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      costo INTEGER NOT NULL,
      categoria TEXT NOT NULL CHECK (categoria IN ('formacion', 'informacion', 'social', 'estetica', 'apuestas', 'rating', 'exotico')),
      activo INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      creadoEn TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_premios_categoria ON PremiosCatalogo(categoria);
    CREATE INDEX IF NOT EXISTS idx_premios_activo ON PremiosCatalogo(activo);
  `);
}

// Tabla UsuarioPremios
const tieneUsuarioPremios = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='UsuarioPremios'").get();
if (!tieneUsuarioPremios) {
  db.exec(`
    CREATE TABLE UsuarioPremios (
      id TEXT PRIMARY KEY,
      usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
      premioId TEXT NOT NULL REFERENCES PremiosCatalogo(id),
      partidoId TEXT REFERENCES Partidos(id),
      grupoId TEXT REFERENCES Grupos(id),
      estado TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible','usado','expirado','reembolsado')),
      fechaCompra TEXT NOT NULL,
      fechaUso TEXT,
      metadata TEXT,
      creadoEn TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usuario_premios_usuario ON UsuarioPremios(usuarioId);
    CREATE INDEX IF NOT EXISTS idx_usuario_premios_partido ON UsuarioPremios(partidoId);
    CREATE INDEX IF NOT EXISTS idx_usuario_premios_estado ON UsuarioPremios(estado);
  `);
}

// Tabla EfectosActivos
const tieneEfectosActivos = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='EfectosActivos'").get();
if (!tieneEfectosActivos) {
  db.exec(`
    CREATE TABLE EfectosActivos (
      id TEXT PRIMARY KEY,
      usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
      grupoId TEXT REFERENCES Grupos(id),
      partidoId TEXT REFERENCES Partidos(id),
      tipo TEXT NOT NULL,
      expiraEn TEXT NOT NULL,
      metadata TEXT,
      creadoEn TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_efectos_usuario ON EfectosActivos(usuarioId);
    CREATE INDEX IF NOT EXISTS idx_efectos_expira ON EfectosActivos(expiraEn);
    CREATE INDEX IF NOT EXISTS idx_efectos_tipo_partido ON EfectosActivos(tipo, partidoId);
  `);
}

// Seed catálogo inicial de premios
// Primero eliminamos partido_secreto si existe (ya no se usa)
db.prepare("DELETE FROM PremiosCatalogo WHERE clave = 'partido_secreto'").run();

const premiosExistentes = db.prepare("SELECT COUNT(*) as count FROM PremiosCatalogo").get();
if (premiosExistentes.count === 0) {
  const PREMIOS_INICIALES = [
    // Formaciones (×10, excepto cambiar_jugador_equipo = 1000)
    { clave: 'elegir_equipo', nombre: 'Elegir tu equipo', descripcion: 'Fuerza tu equipo (A o B) al confirmar formación', costo: 1500, categoria: 'formacion', metadata: { requierePartidoId: true, maxPorPartido: 1 } },
    { clave: 'armar_equipo_completo', nombre: 'Armar equipo a tu gusto', descripcion: 'Defines toda la formación titular y suplentes del partido', costo: 8000, categoria: 'formacion', metadata: { requierePartidoId: true, maxPorPartido: 1 } },
    { clave: 'cambiar_jugador_equipo', nombre: 'Cambiar un jugador de equipo', descripcion: 'Mueve a un jugador del Equipo A al B (o viceversa)', costo: 1000, categoria: 'formacion', metadata: { requierePartidoId: true, maxPorPartido: 1 } },
    { clave: 'bloquear_formacion', nombre: 'Bloquear formación 24hs', descripcion: 'Nadie puede cambiar la formación por 24 horas', costo: 2500, categoria: 'formacion', metadata: { requierePartidoId: true, duracionHoras: 24 } },

    // Información (SIN CAMBIOS)
    { clave: 'ver_votos_formacion', nombre: 'Ver votos de formación en vivo', descripcion: 'Ve cuántos votos tiene cada formación antes de cerrar', costo: 120, categoria: 'informacion', metadata: { requierePartidoId: true } },
    { clave: 'ver_faltan_votar', nombre: 'Ver quién no votó aún', descripcion: 'Lista de titulares que aún no votaron en la votación de equipos', costo: 180, categoria: 'informacion', metadata: { requierePartidoId: true } },
    { clave: 'voto_doble_formacion', nombre: 'Voto doble en formación', descripcion: 'Tu voto en la votación de equipos cuenta x2', costo: 350, categoria: 'informacion', metadata: { requierePartidoId: true } },
    { clave: 'cancelar_apuesta', nombre: 'Cancelar apuesta propia', descripcion: 'Anula una apuesta pendiente y recupera el monto (>2hs antes)', costo: 200, categoria: 'informacion', metadata: { requierePartidoId: true, minHorasAntes: 2 } },

    // Sociales (×10, excepto perdonar sanciones)
    { clave: 'admin_temporal_semana', nombre: 'Ser admin del grupo 1 semana', descripcion: 'Permisos de admin: crear partidos, perdonar sanciones, cerrar votaciones', costo: 12000, categoria: 'social', metadata: { duracionDias: 7, maxPorGrupo: 1 } },
    { clave: 'perdonar_propia_sancion', nombre: 'Perdonar tu propia sanción', descripcion: 'Quita tu sanción actual sin pedir al admin', costo: 500, categoria: 'social', metadata: { requiereGrupoId: true } },
    { clave: 'perdonar_sancion_otro', nombre: 'Perdonar sanción a otro', descripcion: 'Eliges a qué jugador perdonar (log visible)', costo: 700, categoria: 'social', metadata: { requiereGrupoId: true } },

    // Estética (SIN CAMBIOS)
    { clave: 'badge_apostador_pro', nombre: 'Badge "Apostador Pro"', descripcion: 'Insignia en tu perfil', costo: 100, categoria: 'estetica', metadata: { permanente: true, badgeId: 'apostador_pro' } },
    { clave: 'badge_mvp_hunter', nombre: 'Badge "MVP Hunter"', descripcion: 'Insignia en tu perfil', costo: 200, categoria: 'estetica', metadata: { permanente: true, badgeId: 'mvp_hunter' } },
    { clave: 'badge_goleador', nombre: 'Badge "Goleador"', descripcion: 'Insignia en tu perfil', costo: 200, categoria: 'estetica', metadata: { permanente: true, badgeId: 'goleador' } },
    { clave: 'badge_estratega', nombre: 'Badge "Estratega"', descripcion: 'Insignia en tu perfil', costo: 300, categoria: 'estetica', metadata: { permanente: true, badgeId: 'estratega' } },
    { clave: 'badge_ballena', nombre: 'Badge "Ballena"', descripcion: 'Insignia en tu perfil (gastaste 5000+ pts)', costo: 400, categoria: 'estetica', metadata: { permanente: true, badgeId: 'ballena' } },
    { clave: 'color_nombre', nombre: 'Color de nombre personalizado', descripcion: 'Tu nombre en dorado/rosa/azul/verde en listas', costo: 250, categoria: 'estetica', metadata: { permanente: true, colores: ['#FFD700', '#FF69B4', '#00BFFF', '#32CD32', '#FF4500', '#9370DB'] } },
    { clave: 'fondo_carta', nombre: 'Fondo de carta personalizado', descripcion: 'Tu tarjeta de jugador tiene fondo especial', costo: 200, categoria: 'estetica', metadata: { permanente: true, fondos: ['degradado_oro', 'degradado_fuego', 'patron_rombos', 'brillo_neon'] } },
    { clave: 'emoji_personalizado', nombre: 'Emoji exclusivo', descripcion: '🎯 🏆 💰 ⚡ 🔥 👑 junto a tu nombre', costo: 120, categoria: 'estetica', metadata: { permanente: true, emojis: ['🎯', '🏆', '💰', '⚡', '🔥', '👑', '🧠', '🛡️', '⚽', '🥅'] } },
    { clave: 'titulo_personalizado', nombre: 'Título personalizado', descripcion: '"El Arquero", "El 10", "Pichichi", "Muro", "Cerebro"', costo: 350, categoria: 'estetica', metadata: { permanente: true, titulos: ['El Arquero', 'El 10', 'Pichichi', 'Muro', 'Cerebro', 'Pared', 'Motor', 'Magia', 'Garra', 'Jefe'] } },

    // Apuestas (×10)
    { clave: 'freebet_50', nombre: 'Apuesta gratis 50 pts', descripcion: 'Apuestas 50 pts sin arriesgar saldo. Si ganas: neto. Si pierdes: 0', costo: 2500, categoria: 'apuestas', metadata: { monto: 50, maxPorUsuario: 3 } },
    { clave: 'cuota_mejorada', nombre: 'Cuota mejorada +0.25', descripcion: 'Le sumas 0.25 a la cuota de una apuesta', costo: 2000, categoria: 'apuestas', metadata: { bonus: 0.25, maxPorApuesta: 1 } },
    { clave: 'seguro_apuesta', nombre: 'Seguro de apuesta (50%)', descripcion: 'Si pierdes, te devuelven 50% del monto', costo: 3000, categoria: 'apuestas', metadata: { cobertura: 0.5, maxPorApuesta: 1 } },
    { clave: 'ver_pool_apuestas', nombre: 'Ver distribución de apuestas', descripcion: 'Ves % del pozo en cada opción (anónimo)', costo: 2500, categoria: 'apuestas', metadata: { requierePartidoId: true } },

    // Rating/MVP (×10)
    { clave: 'voto_valoracion_doble', nombre: 'Voto de valoración x2', descripcion: 'Tu voto en rendimiento post-partido cuenta doble', costo: 3000, categoria: 'rating', metadata: { requierePartidoId: true } },
    { clave: 'elegir_mvp_directo', nombre: 'Elegir MVP directo', descripcion: 'Tú decides quién es MVP del partido (override votación)', costo: 6000, categoria: 'rating', metadata: { requierePartidoId: true, requiereAdmin: false } },
    { clave: 'ver_votos_valoracion', nombre: 'Ver votos de valoración en vivo', descripcion: 'Ves quién votó a quién en rendimiento', costo: 1800, categoria: 'rating', metadata: { requierePartidoId: true } },

    // Exóticos (×10)
    { clave: 'cambiar_rival', nombre: 'Cambiar nombre del rival', descripcion: 'Cambia el rival del partido a lo que quieras', costo: 10000, categoria: 'exotico', metadata: { requierePartidoId: true, maxLongitud: 30 } },
    { clave: 'dios_del_partido', nombre: 'Dios del Partido', descripcion: 'Armás la formación de AMBOS equipos a mano y decidís quién gana', costo: 25000, categoria: 'exotico', metadata: { requierePartidoId: true, maxPorPartido: 1 } },
  ];

  const insertPremio = db.prepare(`
    INSERT INTO PremiosCatalogo (id, clave, nombre, descripcion, costo, categoria, activo, metadata, creadoEn)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const p of PREMIOS_INICIALES) {
    insertPremio.run(crypto.randomUUID(), p.clave, p.nombre, p.descripcion, p.costo, p.categoria, JSON.stringify(p.metadata), now);
  }
}

// Backfill: usuarios existentes sin puntos -> 100
const usuariosSinPuntos = db.prepare(`
  SELECT u.uid FROM Usuarios u
  LEFT JOIN UsuarioPuntos up ON u.uid = up.usuarioId
  WHERE up.usuarioId IS NULL
`).all();
if (usuariosSinPuntos.length > 0) {
  const insert = db.prepare('INSERT INTO UsuarioPuntos (usuarioId, saldo, actualizadoEn) VALUES (?, 100, ?)');
  const now = new Date().toISOString();
  for (const u of usuariosSinPuntos) insert.run(u.uid, now);
}

module.exports = { db, DB_PATH };
