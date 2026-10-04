/**
 * Seed de un grupo mock para revisar el dashboard de inicio (Home).
 *
 * Crea:
 *  - 1 grupo en modo PLANTEL ("Dashboard Mock")
 *  - 33 jugadores mock (perfiles completos) como miembros del grupo
 *  - 1 partido ABIERTO con fecha en +7 días, cupo 11 titulares / 6 suplentes
 *  - 17 anotados: 11 titulares y 6 suplentes (quedan 16 jugadores sin anotar)
 *  - Pizarra táctica del plantel ya generada (formación automática: 1 arquero,
 *    3 defensores, 4 medios y 3 delanteros)
 *
 * Uso:
 *   node scripts/seed-dashboard-mock.js          // crea el mock
 *   node scripts/seed-dashboard-mock.js --borrar // elimina el mock completo
 */
const crypto = require('node:crypto');
require('dotenv').config(); // Carga el .env antes que config/firebase (service account).
const { db } = require('../src/config/db');
const gruposService = require('../src/services/gruposService');
const partidosService = require('../src/services/partidosService');
const inscripcionesService = require('../src/services/inscripcionesService');

const NOMBRE_GRUPO = 'Dashboard Mock';
const DOMINIO_EMAIL = 'mockdash.local'; // dominio exclusivo: facilita identificar/borrar el seed

// Los primeros 11 forman el plantel titular de fútbol 11 (1 arquero, 5 defensores,
// 3 volantes y 2 delanteros) para que la formación automática quede bien repartida.
const JUGADORES = [
  { nombre: 'Alejandro Mora', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Daniel Ríos', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Emiliano Cueto', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Gabriel Ponce', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Hernán Soto', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Facundo Ledesma', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Kevin Astudillo', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Leandro Prieto', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Martín Vázquez', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Quique Alarcón', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Rafael Domenech', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  // Suplentes anotados
  { nombre: 'Walter Quiroga', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Xavier Pacheco', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Yan Paredes', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Zambrano Ibáñez', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Adrián Cúneo', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Berni Sosa', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' },
  // Sin anotar (ver en la lista de jugadores)
  { nombre: 'Bruno Callado', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Carlos Espinoza', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Iván Baldini', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Joaquín Farías', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Nicolán Guzmán', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Osvaldo Trujillo', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Pablo Menéndez', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Sebastián Rojas', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Tomás Guzmán', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Ulises Cardozo', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Víctor Lemus', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Chicho Ramos', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Damián Fuentes', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Emilio Garay', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Franco Llanos', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Gastón Villalba', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
];

function generarPerfil() {
  const resistencias = ['partido_completo', 'medio_partido', 'un_rato'];
  const ritmos = ['juego_seguido', 'juego_poco', 'nunca_juego'];
  const piernas = ['diestro', 'zurdo'];
  return {
    resistencia: resistencias[Math.floor(Math.random() * resistencias.length)],
    ritmoJuego: ritmos[Math.floor(Math.random() * ritmos.length)],
    piernaHabil: piernas[Math.floor(Math.random() * piernas.length)],
    velocidad: Math.floor(Math.random() * 100),
    pegada: Math.floor(Math.random() * 100),
    tocaPase: Math.floor(Math.random() * 100),
    gambeta: Math.floor(Math.random() * 100),
    marcaDefensa: Math.floor(Math.random() * 100),
    fisico: Math.floor(Math.random() * 100),
    fechaNacimiento: `19${80 + Math.floor(Math.random() * 20)}-${String(
      Math.floor(Math.random() * 12) + 1
    ).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
  };
}

function nombreMock() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
}

function uidAdmin() {
  // El grupo lo crea la cuenta de desarrollo real (super admin, email real).
  const admin =
    db
      .prepare(
        "SELECT uid FROM Usuarios WHERE esSuperAdmin = 1 AND email NOT LIKE '%@test.com' AND email NOT LIKE '%@furboapp.local' LIMIT 1"
      )
      .get() || db.prepare('SELECT uid FROM Usuarios WHERE esSuperAdmin = 1 LIMIT 1').get();
  if (!admin) throw new Error('No se encontró un admin para crear el grupo');
  return admin.uid;
}

function grupoMockExistente() {
  return db
    .prepare(`SELECT * FROM Grupos WHERE nombre = ? AND codigoInvitacion LIKE 'MOCKDASH%'`)
    .get(NOMBRE_GRUPO);
}

function borrarMock() {
  const grupo = grupoMockExistente();
  if (!grupo) {
    console.log('No hay grupo mock para borrar.');
    return;
  }
  const totalMiembros = db.prepare('SELECT COUNT(*) c FROM UsuariosGrupos WHERE grupoId = ?').get(grupo.id).c;
  db.transaction(() => {
    const partidoIds = db.prepare('SELECT id FROM Partidos WHERE grupoId = ?').all(grupo.id).map((p) => p.id);
    for (const partidoId of partidoIds) {
      db.prepare('DELETE FROM Goles WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM RendimientosJugador WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM VotosMvp WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM SancionesPartido WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM VotosFormacion WHERE partidoId = ?').run(partidoId);
      db.prepare(
        'DELETE FROM FormacionesPropuestasDetalle WHERE propuestaId IN (SELECT id FROM FormacionesPropuestas WHERE partidoId = ?)'
      ).run(partidoId);
      db.prepare('DELETE FROM FormacionesPropuestas WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM Inscripciones WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM Resultados WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM WhatsappRecordatoriosDiarios WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM RecordatoriosVotacionEnviados WHERE partidoId = ?').run(partidoId);
      db.prepare('DELETE FROM MensajesEquipo WHERE partidoId = ?').run(partidoId);
    }
    db.prepare('DELETE FROM Partidos WHERE grupoId = ?').run(grupo.id);
    const usuarioIds = db
      .prepare(
        `SELECT u.uid FROM UsuariosGrupos ug JOIN Usuarios u ON u.uid = ug.usuarioId
         WHERE ug.grupoId = ? AND u.email LIKE ?`
      )
      .all(grupo.id, `%@${DOMINIO_EMAIL}`)
      .map((u) => u.uid);
    for (const uid of usuarioIds) {
      db.prepare('DELETE FROM Notificaciones WHERE usuarioId = ?').run(uid);
      db.prepare('DELETE FROM Usuarios WHERE uid = ?').run(uid);
    }
    db.prepare('DELETE FROM UsuariosGrupos WHERE grupoId = ?').run(grupo.id);
    db.prepare('DELETE FROM Grupos WHERE id = ?').run(grupo.id);
  })();
  console.log(
    `✓ Borrado grupo "${grupo.nombre}" (${grupo.codigoInvitacion}) con ${totalMiembros} miembros y sus partidos.`
  );
}

async function crearMock() {
  if (grupoMockExistente()) {
    const grupo = grupoMockExistente();
    console.log(`El grupo mock ya existe: "${grupo.nombre}" (${grupo.codigoInvitacion}, id ${grupo.id}).`);
    console.log('Para recrearlo, ejecutá: node scripts/seed-dashboard-mock.js --borrar');
    return;
  }

  const adminUid = uidAdmin();
  const grupo = await gruposService.crearGrupo({
    nombre: NOMBRE_GRUPO,
    creadoPor: adminUid,
    modo: 'plantel',
  });
  // El código de invitación generado aleatoriamente se reemplaza por uno reconocible del seed.
  const codigoMock = `MOCKDASH-${nombreMock()}`;
  db.prepare('UPDATE Grupos SET codigoInvitacion = ? WHERE id = ?').run(codigoMock, grupo.id);

  const insertarUsuario = db.prepare(
    `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion, nombreCompleto,
     posicionPrincipal, posicionSecundaria, resistencia, ritmoJuego, piernaHabil,
     velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico, fechaNacimiento)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertarMiembro = db.prepare(
    `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
     VALUES (?, ?, ?, 'jugador', 0, ?)`
  );

  const uidPorJugador = db.transaction(() => {
    const ids = [];
    for (let i = 0; i < JUGADORES.length; i++) {
      const jugador = JUGADORES[i];
      const uid = crypto.randomUUID();
      const perfil = generarPerfil();
      insertarUsuario.run(
        uid,
        jugador.nombre,
        `mockdash-${i}@${DOMINIO_EMAIL}`,
        new Date().toISOString(),
        jugador.nombre,
        jugador.posicionPrincipal,
        jugador.posicionSecundaria,
        perfil.resistencia,
        perfil.ritmoJuego,
        perfil.piernaHabil,
        perfil.velocidad,
        perfil.pegada,
        perfil.tocaPase,
        perfil.gambeta,
        perfil.marcaDefensa,
        perfil.fisico,
        perfil.fechaNacimiento
      );
      insertarMiembro.run(crypto.randomUUID(), grupo.id, uid, new Date().toISOString());
      ids.push(uid);
    }
    return ids;
  })();

  // Partido abierto: +7 días a las 20:00 (hora local), cupo de 11 titulares y 6 suplentes.
  const fechaPartido = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  fechaPartido.setHours(20, 0, 0, 0);
  const partido = await partidosService.crearPartido({
    fecha: fechaPartido.toISOString(),
    cupoTitulares: 11,
    cupoSuplentes: 6,
    creadoPor: adminUid,
    grupoId: grupo.id,
    estadio: 'Cancha Central',
    tipoSuelo: 'cesped',
  });
  // Coordenadas de CABA para que el clima pueda resolverse sin geocodificación.
  db.prepare('UPDATE Partidos SET lat = ?, lon = ? WHERE id = ?').run(-34.6037, -58.3816, partido.id);

  // 17 anotados: 11 titulares (orden 1-11) y 6 suplentes (orden 1-6).
  const insertarInscripcion = db.prepare(
    `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion,
     posicionPrincipal, posicionSecundaria)
     VALUES (?, ?, ?, 'anotado', ?, ?, ?, ?, ?)`
  );
  const ahora = new Date().toISOString();
  const leerPosiciones = db.prepare(
    'SELECT posicionPrincipal, posicionSecundaria FROM Usuarios WHERE uid = ?'
  );
  db.transaction(() => {
    for (let i = 0; i < 11; i++) {
      const perfilJugador = leerPosiciones.get(uidPorJugador[i]);
      insertarInscripcion.run(
        crypto.randomUUID(),
        partido.id,
        uidPorJugador[i],
        'titular',
        i + 1,
        ahora,
        perfilJugador.posicionPrincipal,
        perfilJugador.posicionSecundaria
      );
    }
    for (let i = 0; i < 6; i++) {
      const perfilJugador = leerPosiciones.get(uidPorJugador[11 + i]);
      insertarInscripcion.run(
        crypto.randomUUID(),
        partido.id,
        uidPorJugador[11 + i],
        'suplente',
        i + 1,
        ahora,
        perfilJugador.posicionPrincipal,
        perfilJugador.posicionSecundaria
      );
    }
  })();

  // Pizarra táctica del plantel: genera la formación automática (1 arquero +
  // reparto de campo) y la persiste (equipo "plantel" + formacionCodigo) para que
  // el dashboard muestre la cancha con los 11 titulares ubicados.
  const formacion = await inscripcionesService.generarFormacionAutomatica(partido.id, grupo.id);
  await inscripcionesService.guardarFormacion(partido.id, grupo.id, { asignaciones: formacion.jugadores });

  const ocupados = await inscripcionesService.contarOcupados(partido.id);
  console.log('────────────────────────────────────────────');
  console.log(`✓ Grupo mock:  "${NOMBRE_GRUPO}"  (código ${codigoMock}, id ${grupo.id})`);
  console.log(`✓ ${JUGADORES.length} jugadores mock agregados al grupo`);
  console.log(
    `✓ Partido abierto: ${fechaPartido.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} (id ${partido.id})`
  );
  console.log(`✓ Cupo: ${partido.cupoTitulares} titulares + ${partido.cupoSuplentes} suplentes`);
  console.log(`✓ Anotados: ${ocupados.titulares} titulares + ${ocupados.suplentes} suplentes (16 quedaron sin anotar)`);
  console.log('✓ Pizarra táctica del plantel generada y guardada (formación automática: 1 arquero, 3 defensores, 4 medios y 3 delanteros)');
  console.log('────────────────────────────────────────────');
  console.log('Ingresá a la app con tu cuenta: el grupo "Dashboard Mock" aparecerá en el selector de grupo.');
  console.log('Para limpiarlo después: node scripts/seed-dashboard-mock.js --borrar');
}

(async () => {
  try {
    if (process.argv.includes('--borrar')) {
      borrarMock();
    } else {
      await crearMock();
    }
  } catch (error) {
    console.error('Error creando el mock:', error.message);
    process.exitCode = 1;
  } finally {
    // El SDK de Firebase puede dejar handles abiertos; cerramos el proceso cuando el seed termina.
    process.exit(process.exitCode || 0);
  }
})();


