const crypto = require('node:crypto');
const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

const JUGADORES = [
  { nombre: 'Juan Martínez', nombreCompleto: 'Juan Carlos Martínez', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Carlos López', nombreCompleto: 'Carlos Alberto López', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Andrés García', nombreCompleto: 'Andrés Felipe García', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Diego Rodríguez', nombreCompleto: 'Diego Rafael Rodríguez', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Fernando Pérez', nombreCompleto: 'Fernando Javier Pérez', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Roberto Silva', nombreCompleto: 'Roberto Miguel Silva', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Pablo Sánchez', nombreCompleto: 'Pablo Esteban Sánchez', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' },
  { nombre: 'Lucas Torres', nombreCompleto: 'Lucas Martín Torres', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Matías Díaz', nombreCompleto: 'Matías Santiago Díaz', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Gonzalo Ruiz', nombreCompleto: 'Gonzalo Héctor Ruiz', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Gustavo Ortiz', nombreCompleto: 'Gustavo Ramón Ortiz', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Miguel Reyes', nombreCompleto: 'Miguel Ángel Reyes', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Ricardo Vega', nombreCompleto: 'Ricardo Daniel Vega', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' },
  { nombre: 'Sergio Castro', nombreCompleto: 'Sergio Alejandro Castro', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Jorge Flores', nombreCompleto: 'Jorge Luis Flores', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Manuel Gómez', nombreCompleto: 'Manuel Antonio Gómez', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Héctor Morales', nombreCompleto: 'Héctor Guillermo Morales', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Raúl Medina', nombreCompleto: 'Raúl Fernando Medina', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Javier Miranda', nombreCompleto: 'Javier Oscar Miranda', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Eduardo Navarro', nombreCompleto: 'Eduardo Carlos Navarro', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' },
  { nombre: 'Víctor Acosta', nombreCompleto: 'Víctor Hugo Acosta', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Adrián Campos', nombreCompleto: 'Adrián Roberto Campos', posicionPrincipal: 'mediocampista', posicionSecundaria: 'defensor' },
  { nombre: 'Claudio Vargas', nombreCompleto: 'Claudio Raúl Vargas', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Fernando Domínguez', nombreCompleto: 'Fernando Luis Domínguez', posicionPrincipal: 'defensor', posicionSecundaria: 'delantero' },
  { nombre: 'Guillermo Parra', nombreCompleto: 'Guillermo Eduardo Parra', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Ignacio Fuentes', nombreCompleto: 'Ignacio Javier Fuentes', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Julio Salazar', nombreCompleto: 'Julio Héctor Salazar', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Leopoldo Rojas', nombreCompleto: 'Leopoldo Miguel Rojas', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Mariano Soto', nombreCompleto: 'Mariano Fernando Soto', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' },
  { nombre: 'Néstor Blanco', nombreCompleto: 'Néstor David Blanco', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Octavio Quezada', nombreCompleto: 'Octavio Rafael Quezada', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Patricio Hurtado', nombreCompleto: 'Patricio Gerardo Hurtado', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Querubin Reina', nombreCompleto: 'Querubin Alberto Reina', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Reynaldo Vera', nombreCompleto: 'Reynaldo Carlos Vera', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Silvestre Aguilar', nombreCompleto: 'Silvestre Raúl Aguilar', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Teodoro Paz', nombreCompleto: 'Teodoro Miguel Paz', posicionPrincipal: 'delantero', posicionSecundaria: 'defensor' },
  { nombre: 'Ubaldo García', nombreCompleto: 'Ubaldo Fernando García', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Valentín Robles', nombreCompleto: 'Valentín Hugo Robles', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
  { nombre: 'Wilfredo López', nombreCompleto: 'Wilfredo Javier López', posicionPrincipal: 'delantero', posicionSecundaria: 'mediocampista' },
  { nombre: 'Xavier Díaz', nombreCompleto: 'Xavier Antonio Díaz', posicionPrincipal: 'arquero', posicionSecundaria: 'defensor' },
  { nombre: 'Yuri Sánchez', nombreCompleto: 'Yuri Roberto Sánchez', posicionPrincipal: 'defensor', posicionSecundaria: 'mediocampista' },
  { nombre: 'Zenón Flores', nombreCompleto: 'Zenón Patricio Flores', posicionPrincipal: 'mediocampista', posicionSecundaria: 'delantero' },
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
    fechaNacimiento: `19${80 + Math.floor(Math.random() * 20)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
  };
}

router.post('/seed-matches', (req, res) => {
  try {
    const transaccion = db.transaction(() => {
      const grupoId = crypto.randomUUID();
      const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);

      const primerAdmin = db.prepare('SELECT uid FROM Usuarios LIMIT 1').get();
      let creadoPor = primerAdmin?.uid;

      if (!creadoPor) {
        const uid = crypto.randomUUID();
        const ahora = new Date().toISOString();
        db.prepare(
          `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion)
           VALUES (?, ?, ?, 1, ?)`
        ).run(uid, 'Admin FurboApp', `admin-furbo-${sufijo}@furboapp.local`, ahora);
        creadoPor = uid;
      }

      db.prepare(
        `INSERT INTO Grupos (id, nombre, codigoInvitacion, creadoPor, fechaCreacion)
         VALUES (?, ?, ?, ?, ?)`
      ).run(grupoId, 'Grupo Test', `TEST-${sufijo}`, creadoPor, new Date().toISOString());

      const usuariosIds = [];
      for (let i = 0; i < JUGADORES.length; i++) {
        const jugador = JUGADORES[i];
        const uid = crypto.randomUUID();
        const perfil = generarPerfil();
        const email = `${jugador.nombre.toLowerCase().replace(/ /g, '.')}-${i}@furboapp.local`;

        db.prepare(
          `INSERT INTO Usuarios (uid, nombre, email, esSuperAdmin, fechaCreacion, nombreCompleto,
           posicionPrincipal, posicionSecundaria, resistencia, ritmoJuego, piernaHabil,
           velocidad, pegada, tocaPase, gambeta, marcaDefensa, fisico, fechaNacimiento)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uid, jugador.nombre, email, new Date().toISOString(), jugador.nombreCompleto,
          jugador.posicionPrincipal, jugador.posicionSecundaria,
          perfil.resistencia, perfil.ritmoJuego, perfil.piernaHabil,
          perfil.velocidad, perfil.pegada, perfil.tocaPase, perfil.gambeta,
          perfil.marcaDefensa, perfil.fisico, perfil.fechaNacimiento
        );

        usuariosIds.push(uid);

        db.prepare(
          `INSERT INTO UsuariosGrupos (id, grupoId, usuarioId, rol, estaSancionado, fechaIngreso)
           VALUES (?, ?, ?, 'jugador', 0, ?)`
        ).run(crypto.randomUUID(), grupoId, uid, new Date().toISOString());
      }

      const ahora = new Date();
      const partidas = [
        new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000),
        new Date(ahora.getTime() + 14 * 24 * 60 * 60 * 1000),
        new Date(ahora.getTime() + 21 * 24 * 60 * 60 * 1000),
      ];

      for (let p = 0; p < partidas.length; p++) {
        const partidoId = crypto.randomUUID();
        const fecha = partidas[p].toISOString().split('T')[0] + 'T19:00:00Z';

        db.prepare(
          `INSERT INTO Partidos (id, fecha, estado, creadoPor, grupoId, cupoTitulares, cupoSuplentes)
           VALUES (?, ?, 'abierto', ?, ?, 7, 7)`
        ).run(partidoId, fecha, creadoPor, grupoId);

        for (let j = 0; j < 14; j++) {
          const usuarioId = usuariosIds[(p * 14 + j) % usuariosIds.length];
          const tipo = j < 7 ? 'titular' : 'suplente';
          const orden = j < 7 ? j + 1 : j - 6;

          db.prepare(
            `INSERT INTO Inscripciones (id, partidoId, usuarioId, estado, tipo, orden, fechaInscripcion)
             VALUES (?, ?, ?, 'anotado', ?, ?, ?)`
          ).run(
            crypto.randomUUID(), partidoId, usuarioId, tipo, orden, new Date().toISOString()
          );
        }
      }

      return { grupoId, usuariosCount: JUGADORES.length, partidosCount: 3 };
    });

    const resultado = transaccion();
    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error en seed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
