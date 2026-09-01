const { db } = require('../config/db');

function crearPorVotacionCerrada(partidoId, grupoId) {
  const jugadores = db
    .prepare('SELECT DISTINCT jugadorId FROM RendimientosJugador WHERE partidoId = ?')
    .all(partidoId)
    .map((fila) => fila.jugadorId);

  const insertar = db.prepare(
    `INSERT INTO Notificaciones (id, usuarioId, tipo, grupoId, partidoId, leida, fechaCreacion)
     VALUES (?, ?, 'calificacion_cerrada', ?, ?, 0, ?)`
  );
  const ahora = new Date().toISOString();
  for (const jugadorId of jugadores) {
    insertar.run(crypto.randomUUID(), jugadorId, grupoId, partidoId, ahora);
  }
}

function obtenerYMarcarPendientes(usuarioId) {
  const pendientes = db
    .prepare(
      `SELECT id FROM Notificaciones WHERE usuarioId = ? AND tipo = 'calificacion_cerrada' AND leida = 0`
    )
    .all(usuarioId);

  if (pendientes.length === 0) {
    return { hayPendientes: false };
  }

  const marcar = db.prepare('UPDATE Notificaciones SET leida = 1 WHERE id = ?');
  const ejecutar = db.transaction(() => {
    for (const fila of pendientes) marcar.run(fila.id);
  });
  ejecutar();

  return { hayPendientes: true };
}

module.exports = { crearPorVotacionCerrada, obtenerYMarcarPendientes };
