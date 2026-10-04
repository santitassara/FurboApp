// Verificación rápida del seed "Dashboard Mock" (modo plantel)
// (uso: node scripts/verificar-mock.js).
require('dotenv').config();
const { db } = require('../src/config/db');

const grupo = db
  .prepare(`SELECT * FROM Grupos WHERE nombre = 'Dashboard Mock' AND codigoInvitacion LIKE 'MOCKDASH%'`)
  .get();
if (!grupo) {
  console.log('No se encontró el grupo mock "Dashboard Mock".');
  process.exit(1);
}
const partido = db.prepare('SELECT * FROM Partidos WHERE grupoId = ?').get(grupo.id);
console.log('Grupo:', grupo.nombre, `(${grupo.codigoInvitacion}, modo ${grupo.modo}, creado por ${grupo.creadoPor})`);
console.log('Miembros:', db.prepare('SELECT COUNT(*) c FROM UsuariosGrupos WHERE grupoId = ?').get(grupo.id).c);
console.log(
  'Partido:',
  JSON.stringify({ fecha: partido.fecha, estado: partido.estado, cupoTitulares: partido.cupoTitulares, cupoSuplentes: partido.cupoSuplentes, formacionCodigo: partido.formacionCodigo, votacionCerrada: partido.votacionCerrada, rival: partido.rival, notasTacticas: partido.notasTacticas })
);
console.log('Anotados:', db.prepare("SELECT tipo, COUNT(*) c FROM Inscripciones WHERE partidoId = ? AND estado='anotado' GROUP BY tipo").all(partido.id));
console.log(
  'Plantel ubicado por línea:',
  db.prepare("SELECT linea, COUNT(*) c FROM Inscripciones WHERE partidoId = ? AND estado='anotado' AND equipo IS NOT NULL GROUP BY linea ORDER BY linea").all(partido.id)
);
console.log(
  'Asientos duplicados:',
  db
    .prepare(
      'SELECT COUNT(*) c FROM (SELECT linea, ordenLinea, COUNT(*) n FROM Inscripciones WHERE partidoId = ? AND estado = ? AND equipo IS NOT NULL GROUP BY linea, ordenLinea HAVING n > 1)'
    )
    .get(partido.id, 'anotado').c
);
console.log(
  'Titulares sin ubicar:',
  db.prepare("SELECT COUNT(*) c FROM Inscripciones WHERE partidoId = ? AND tipo='titular' AND estado='anotado' AND equipo IS NULL").get(partido.id).c
);
console.log(
  'Suplentes sin ubicar (deben ser 6):',
  db.prepare("SELECT COUNT(*) c FROM Inscripciones WHERE partidoId = ? AND tipo='suplente' AND estado='anotado' AND equipo IS NULL").get(partido.id).c
);
process.exit(0);
