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
  velocidad INTEGER,
  pegada INTEGER,
  tocaPase INTEGER,
  gambeta INTEGER,
  marcaDefensa INTEGER,
  fisico INTEGER,
  suscripcionPush TEXT,
  piernaHabil TEXT
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

CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  grupoId TEXT NOT NULL REFERENCES Grupos(id),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL,
  recordatorioEnviado INTEGER NOT NULL DEFAULT 0,
  recordatorioPostPartidoEnviado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Inscripciones (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  estado TEXT NOT NULL CHECK (estado IN ('anotado', 'dado_de_baja')),
  tipo TEXT NOT NULL CHECK (tipo IN ('titular', 'suplente')),
  orden INTEGER NOT NULL,
  fechaInscripcion TEXT NOT NULL,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT,
  equipo TEXT,
  linea TEXT,
  ordenLinea INTEGER,
  lado TEXT
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
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  asistenciaUsuarioId TEXT REFERENCES Usuarios(uid),
  equipo TEXT NOT NULL CHECK (equipo IN ('A', 'B')),
  minuto INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS RendimientosJugador (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  jugadorId TEXT NOT NULL REFERENCES Usuarios(uid),
  votanteId TEXT REFERENCES Usuarios(uid),
  puntaje INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS VotosMvp (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  votanteId TEXT NOT NULL REFERENCES Usuarios(uid),
  jugadorId TEXT NOT NULL REFERENCES Usuarios(uid)
);

CREATE TABLE IF NOT EXISTS SancionesPartido (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  motivo TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goles_partido ON Goles (partidoId);
CREATE INDEX IF NOT EXISTS idx_rendimientos_partido ON RendimientosJugador (partidoId);
CREATE INDEX IF NOT EXISTS idx_votos_mvp_partido ON VotosMvp (partidoId);
CREATE INDEX IF NOT EXISTS idx_sanciones_partido_partido ON SancionesPartido (partidoId);
