CREATE TABLE IF NOT EXISTS Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  esSuperAdmin INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL,
  passwordHash TEXT,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT,
  nombreCompleto TEXT,
  fechaNacimiento TEXT,
  resistencia TEXT,
  ritmoJuego TEXT,
  velocidad REAL,
  pegada REAL,
  tocaPase REAL,
  gambeta REAL,
  marcaDefensa REAL,
  fisico REAL,
  fotoUrl TEXT,
  suscripcionPush TEXT,
  piernaHabil TEXT,
  fcmToken TEXT
);

CREATE TABLE IF NOT EXISTS Grupos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigoInvitacion TEXT NOT NULL UNIQUE,
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS UsuariosGrupos (
  id TEXT PRIMARY KEY,
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jugador')),
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaIngreso TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_grupos_unico ON UsuariosGrupos (grupoId, usuarioId);

CREATE TABLE IF NOT EXISTS Invitados (
  id TEXT PRIMARY KEY,
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  propuestoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  nombre TEXT NOT NULL,
  edad INTEGER,
  posicionPrincipal TEXT NOT NULL,
  posicionSecundaria TEXT,
  resistencia TEXT,
  habilidadPromedio REAL NOT NULL,
  velocidad REAL NOT NULL,
  pegada REAL NOT NULL,
  tocaPase REAL NOT NULL,
  gambeta REAL NOT NULL,
  marcaDefensa REAL NOT NULL,
  fisico REAL NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  fechaCreacion TEXT NOT NULL,
  fechaResolucion TEXT,
  resueltoPor TEXT REFERENCES Usuarios(uid)
);

CREATE INDEX IF NOT EXISTS idx_invitados_grupo_estado ON Invitados (grupoId, estado);

CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  recordatorioEnviado INTEGER NOT NULL DEFAULT 0,
  recordatorioPostPartidoEnviado INTEGER NOT NULL DEFAULT 0,
  votacionCerrada INTEGER NOT NULL DEFAULT 0,
  beelupUrl TEXT,
  numero INTEGER,
  estadio TEXT,
  tipoSuelo TEXT,
  direccion TEXT,
  lat REAL,
  lon REAL,
  valorCuota INTEGER
);

CREATE TABLE IF NOT EXISTS Inscripciones (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT REFERENCES Usuarios(uid),
  invitadoId TEXT REFERENCES Invitados(id),
  estado TEXT NOT NULL CHECK (estado IN ('anotado', 'dado_de_baja')),
  tipo TEXT NOT NULL CHECK (tipo IN ('titular', 'suplente')),
  orden INTEGER NOT NULL,
  fechaInscripcion TEXT NOT NULL,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT,
  equipo TEXT,
  linea TEXT,
  ordenLinea INTEGER,
  lado TEXT,
  CHECK ((usuarioId IS NOT NULL AND invitadoId IS NULL) OR (usuarioId IS NULL AND invitadoId IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_partido_estado
  ON Inscripciones (partidoId, estado);

CREATE TABLE IF NOT EXISTS Resultados (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL UNIQUE REFERENCES Partidos(id),
  jugadorDestacadoId TEXT REFERENCES Usuarios(uid),
  fechaCarga TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Goles (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT REFERENCES Usuarios(uid),
  invitadoId TEXT REFERENCES Invitados(id),
  asistenciaUsuarioId TEXT REFERENCES Usuarios(uid),
  asistenciaInvitadoId TEXT REFERENCES Invitados(id),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  minuto INTEGER NOT NULL,
  enContra INTEGER NOT NULL DEFAULT 0,
  CHECK ((usuarioId IS NOT NULL AND invitadoId IS NULL) OR (usuarioId IS NULL AND invitadoId IS NOT NULL)),
  CHECK (NOT (asistenciaUsuarioId IS NOT NULL AND asistenciaInvitadoId IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS RendimientosJugador (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  jugadorId TEXT REFERENCES Usuarios(uid),
  invitadoId TEXT REFERENCES Invitados(id),
  votanteId TEXT REFERENCES Usuarios(uid),
  puntaje INTEGER NOT NULL,
  CHECK ((jugadorId IS NOT NULL AND invitadoId IS NULL) OR (jugadorId IS NULL AND invitadoId IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS VotosMvp (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  votanteId TEXT NOT NULL REFERENCES Usuarios(uid),
  jugadorId TEXT REFERENCES Usuarios(uid),
  invitadoId TEXT REFERENCES Invitados(id),
  CHECK ((jugadorId IS NOT NULL AND invitadoId IS NULL) OR (jugadorId IS NULL AND invitadoId IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS SancionesPartido (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT REFERENCES Usuarios(uid),
  invitadoId TEXT REFERENCES Invitados(id),
  motivo TEXT NOT NULL,
  CHECK ((usuarioId IS NOT NULL AND invitadoId IS NULL) OR (usuarioId IS NULL AND invitadoId IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS FormacionesPropuestas (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  numero INTEGER NOT NULL,
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS FormacionesPropuestasDetalle (
  id TEXT PRIMARY KEY,
  propuestaId TEXT NOT NULL REFERENCES FormacionesPropuestas(id),
  usuarioId TEXT REFERENCES Usuarios(uid),
  invitadoId TEXT REFERENCES Invitados(id),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  linea TEXT,
  ordenLinea INTEGER,
  lado TEXT,
  CHECK ((usuarioId IS NOT NULL AND invitadoId IS NULL) OR (usuarioId IS NULL AND invitadoId IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS VotosFormacion (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  propuestaId TEXT NOT NULL REFERENCES FormacionesPropuestas(id),
  fecha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goles_partido ON Goles (partidoId);
CREATE INDEX IF NOT EXISTS idx_rendimientos_partido ON RendimientosJugador (partidoId);
CREATE INDEX IF NOT EXISTS idx_votos_mvp_partido ON VotosMvp (partidoId);
CREATE INDEX IF NOT EXISTS idx_sanciones_partido_partido ON SancionesPartido (partidoId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_formaciones_propuestas_numero ON FormacionesPropuestas (partidoId, numero);
CREATE INDEX IF NOT EXISTS idx_formaciones_propuestas_detalle_propuesta ON FormacionesPropuestasDetalle (propuestaId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_formacion_unico ON VotosFormacion (partidoId, usuarioId);
CREATE INDEX IF NOT EXISTS idx_votos_formacion_propuesta ON VotosFormacion (propuestaId);

CREATE TABLE IF NOT EXISTS RecordatoriosVotacionEnviados (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  ventana INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recordatorios_votacion_unico
  ON RecordatoriosVotacionEnviados (partidoId, usuarioId, ventana);

CREATE TABLE IF NOT EXISTS WhatsappRecordatoriosDiarios (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  tipo TEXT NOT NULL,
  fecha TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_recordatorio_diario_unico
  ON WhatsappRecordatoriosDiarios (partidoId, tipo, fecha);

CREATE TABLE IF NOT EXISTS Notificaciones (
  id TEXT PRIMARY KEY,
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  tipo TEXT NOT NULL,
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  leida INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida
  ON Notificaciones (usuarioId, tipo, leida);

CREATE TABLE IF NOT EXISTS MensajesEquipo (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  texto TEXT NOT NULL,
  fechaEnvio TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mensajes_equipo ON MensajesEquipo (partidoId, equipo, fechaEnvio);

CREATE TABLE IF NOT EXISTS ProgramacionesPartido (
  id TEXT PRIMARY KEY,
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  nombre TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  diaSemanaDisparo INTEGER NOT NULL,
  horaDisparo TEXT NOT NULL,
  diaSemanaPartido INTEGER NOT NULL,
  horaPartido TEXT NOT NULL,
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  estadio TEXT,
  tipoSuelo TEXT,
  direccion TEXT,
  valorCuota INTEGER,
  proximoDisparo TEXT NOT NULL,
  ultimoDisparo TEXT,
  ultimoPartidoId TEXT REFERENCES Partidos(id),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_programaciones_disparo
  ON ProgramacionesPartido (activa, proximoDisparo);
