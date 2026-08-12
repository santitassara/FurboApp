CREATE TABLE IF NOT EXISTS Usuarios (
  uid TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jugador')),
  estaSancionado INTEGER NOT NULL DEFAULT 0,
  fechaCreacion TEXT NOT NULL,
  passwordHash TEXT,
  posicionPrincipal TEXT,
  posicionSecundaria TEXT
);

CREATE TABLE IF NOT EXISTS Partidos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'jugado')),
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  cupoTitulares INTEGER NOT NULL,
  cupoSuplentes INTEGER NOT NULL
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
  posicionSecundaria TEXT
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_partido_estado
  ON Inscripciones (partidoId, estado);
