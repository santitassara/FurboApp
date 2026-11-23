const crypto = require('node:crypto');
const { db } = require('../config/db');

function parseMetadata(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

async function obtenerCatalogo() {
  const rows = db.prepare(`
    SELECT id, clave, nombre, descripcion, costo, categoria, metadata
    FROM PremiosCatalogo
    WHERE activo = 1
    ORDER BY categoria, costo
  `).all();
  return rows.map(parseMetadata);
}

async function obtenerPremioPorId(premioId) {
  const row = db.prepare(`
    SELECT id, clave, nombre, descripcion, costo, categoria, metadata
    FROM PremiosCatalogo
    WHERE id = ? AND activo = 1
  `).get(premioId);
  return parseMetadata(row);
}

async function obtenerPremioPorClave(clave) {
  const row = db.prepare(`
    SELECT id, clave, nombre, descripcion, costo, categoria, metadata
    FROM PremiosCatalogo
    WHERE clave = ? AND activo = 1
  `).get(clave);
  return parseMetadata(row);
}

async function comprarPremio(usuarioId, premioId, grupoId, partidoId = null) {
  const premio = await obtenerPremioPorId(premioId);
  if (!premio) {
    const error = new Error('Premio no encontrado');
    error.status = 404;
    throw error;
  }

  // Verificar saldo disponible
  const saldoRow = db.prepare('SELECT saldo FROM UsuarioPuntos WHERE usuarioId = ?').get(usuarioId);
  const saldo = saldoRow ? saldoRow.saldo : 0;

  // Calcular apuestas pendientes (dinero comprometido)
  const apuestasPendientes = db.prepare(`
    SELECT COALESCE(SUM(monto), 0) as total
    FROM Apuestas
    WHERE usuarioId = ? AND estado = 'pendiente'
  `).get(usuarioId).total;

  const saldoDisponible = saldo - apuestasPendientes;
  if (saldoDisponible < premio.costo) {
    const error = new Error('Saldo insuficiente');
    error.status = 400;
    throw error;
  }

  // Validar restricciones según el premio
  const metadata = premio.metadata || {};

  // Max 1 admin temporal por grupo
  if (premio.clave === 'admin_temporal_semana') {
    const existe = db.prepare(`
      SELECT 1 FROM EfectosActivos
      WHERE grupoId = ? AND tipo = 'admin_temporal' AND expiraEn > ?
    `).get(grupoId, new Date().toISOString());
    if (existe) {
      const error = new Error('Ya hay un admin temporal activo en este grupo');
      error.status = 400;
      throw error;
    }
  }

  // Max 1 por partido para premios que lo requieren (incluye usados)
  if (metadata.maxPorPartido && partidoId) {
    const yaCompro = db.prepare(`
      SELECT 1 FROM UsuarioPremios
      WHERE usuarioId = ? AND premioId = ? AND partidoId = ? AND estado IN ('disponible', 'usado')
    `).get(usuarioId, premioId, partidoId);
    if (yaCompro) {
      const error = new Error('Ya compraste/usaste este premio para este partido');
      error.status = 400;
      throw error;
    }
  }

  // Max 1 admin temporal por grupo (validación en compra)
  if (premio.clave === 'admin_temporal_semana' && metadata.maxPorGrupo) {
    const yaTiene = db.prepare(`
      SELECT 1 FROM UsuarioPremios
      WHERE usuarioId = ? AND premioId = ? AND grupoId = ? AND estado = 'disponible'
    `).get(usuarioId, premioId, grupoId);
    if (yaTiene) {
      const error = new Error('Ya tienes un admin temporal activo en este grupo');
      error.status = 400;
      throw error;
    }
  }

  // Validar que se proporciona partidoId cuando es requerido
  // Solo validamos en compra si el premio NO permite compra anticipada
  // Los premios de formación se pueden comprar sin partido y usar después
  const permiteCompraAnticipada = ['elegir_equipo', 'armar_equipo_completo', 'cambiar_jugador_equipo', 'bloquear_formacion'].includes(premio.clave);
  if (metadata.requierePartidoId && !partidoId && !permiteCompraAnticipada) {
    const error = new Error('Este premio requiere un partido');
    error.status = 400;
    throw error;
  }

  // Validar que se proporciona grupoId cuando es requerido
  if (metadata.requiereGrupoId && !grupoId) {
    const error = new Error('Este premio requiere un grupo');
    error.status = 400;
    throw error;
  }

  // Validar maxPorUsuario para freebet
  if (premio.clave === 'freebet_50' && metadata.maxPorUsuario) {
    const freebetsCompradas = db.prepare(`
      SELECT COUNT(*) as count FROM UsuarioPremios
      WHERE usuarioId = ? AND premioId = ? AND estado IN ('disponible', 'usado')
    `).get(usuarioId, premioId).count;
    if (freebetsCompradas >= metadata.maxPorUsuario) {
      const error = new Error(`Máximo ${metadata.maxPorUsuario} freebets por usuario`);
      error.status = 400;
      throw error;
    }
  }

  // Validar badge único por usuario (por badgeId)
  if (metadata.badgeId) {
    const yaTieneBadge = db.prepare(`
      SELECT up.id FROM UsuarioPremios up
      JOIN PremiosCatalogo pc ON up.premioId = pc.id
      WHERE up.usuarioId = ?
        AND (pc.metadata LIKE ? OR pc.metadata LIKE ? OR pc.metadata LIKE ?)
        AND up.estado IN ('disponible', 'usado')
    `).get(usuarioId, `%"badgeId":"${metadata.badgeId}"%`, `%"badgeId": "${metadata.badgeId}"%`, `%"badgeId" : "${metadata.badgeId}"%`);
    if (yaTieneBadge) {
      const error = new Error(`Ya tienes la insignia "${metadata.badgeId}"`);
      error.status = 400;
      throw error;
    }
  }

  // Transacción atómica
  const compraId = crypto.randomUUID();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    // Descontar puntos
    db.prepare('UPDATE UsuarioPuntos SET saldo = saldo - ?, actualizadoEn = ? WHERE usuarioId = ?')
      .run(premio.costo, now, usuarioId);

    // Registrar compra
    db.prepare(`
      INSERT INTO UsuarioPremios (id, usuarioId, premioId, partidoId, grupoId, estado, fechaCompra, creadoEn)
      VALUES (?, ?, ?, ?, ?, 'disponible', ?, ?)
    `).run(compraId, usuarioId, premioId, partidoId, grupoId, now, now);
  });

  tx();

  // Obtener nuevo saldo
  const nuevoSaldoRow = db.prepare('SELECT saldo FROM UsuarioPuntos WHERE usuarioId = ?').get(usuarioId);

  return {
    ok: true,
    nuevoSaldo: nuevoSaldoRow.saldo,
    compraId,
  };
}

async function usarPremio(usuarioId, compraId, metadata = {}) {
  const compra = db.prepare(`
    SELECT up.*, pc.clave, pc.nombre, pc.categoria, pc.metadata as premioMetadata
    FROM UsuarioPremios up
    JOIN PremiosCatalogo pc ON up.premioId = pc.id
    WHERE up.id = ? AND up.usuarioId = ?
  `).get(compraId, usuarioId);

  if (!compra) {
    const error = new Error('Compra no encontrada');
    error.status = 404;
    throw error;
  }

  if (compra.estado !== 'disponible') {
    const error = new Error(`El premio ya fue ${compra.estado}`);
    error.status = 400;
    throw error;
  }

  const premioMetadata = JSON.parse(compra.premioMetadata || '{}');

  // Validar contexto: partidoId debe coincidir si el premio lo requiere
  if (premioMetadata.requierePartidoId) {
    // Si se compró con partidoId, debe usarse en ese mismo partido
    if (compra.partidoId && metadata.partidoId !== compra.partidoId) {
      const error = new Error('Este premio solo se puede usar en el partido para el que se compró');
      error.status = 400;
      throw error;
    }
    // Si NO se compró con partidoId, se requiere especificar uno al usarlo
    if (!compra.partidoId && !metadata.partidoId) {
      const error = new Error('Este premio requiere un partido para ser activado');
      error.status = 400;
      throw error;
    }
  }

  if (premioMetadata.requiereGrupoId && compra.grupoId && metadata.grupoId !== compra.grupoId) {
    const error = new Error('Este premio solo se puede usar en el grupo para el que se compró');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  let efectoCreado = false;

  const tx = db.transaction(() => {
    // Actualizar compra
    db.prepare(`
      UPDATE UsuarioPremios SET estado = 'usado', fechaUso = ?, metadata = ? WHERE id = ?
    `).run(now, JSON.stringify(metadata), compraId);

    // Crear efecto activo si aplica
    if (premioMetadata.creaEfecto !== false) {
      let tipoEfecto = null;
      let expiraEn = null;
      let efectoMetadata = {};

      switch (compra.clave) {
        case 'admin_temporal_semana':
          tipoEfecto = 'admin_temporal';
          expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { rolOriginal: 'jugador' };
          break;
        case 'voto_doble_formacion':
          tipoEfecto = 'voto_doble_formacion';
          expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24hs - single use per match
          break;
        case 'ver_votos_formacion':
          tipoEfecto = 'ver_votos_formacion';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'ver_faltan_votar':
          tipoEfecto = 'ver_faltan_votar';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'cancelar_apuesta':
          tipoEfecto = 'cancelar_apuesta';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'elegir_equipo':
          tipoEfecto = 'elegir_equipo';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { ...metadata };
          break;
        case 'cambiar_jugador_equipo':
          tipoEfecto = 'cambiar_jugador_equipo';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { ...metadata };
          break;
        case 'armar_equipo_completo':
          tipoEfecto = 'armar_equipo_completo';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { ...metadata };
          break;
        case 'bloquear_formacion':
          tipoEfecto = 'bloquear_formacion';
          expiraEn = new Date(Date.now() + (premioMetadata.duracionHoras || 24) * 60 * 60 * 1000).toISOString();
          break;
        case 'perdonar_propia_sancion':
          tipoEfecto = 'perdonar_propia_sancion';
          expiraEn = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora
          break;
        case 'perdonar_sancion_otro':
          tipoEfecto = 'perdonar_sancion_otro';
          expiraEn = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora
          efectoMetadata = { ...metadata };
          break;
        case 'color_nombre':
          tipoEfecto = 'color_nombre';
          expiraEn = '2099-12-31T23:59:59.999Z'; // Permanente
          efectoMetadata = { color: metadata.color || '#FFD700' };
          break;
        case 'fondo_carta':
          tipoEfecto = 'fondo_carta';
          expiraEn = '2099-12-31T23:59:59.999Z';
          efectoMetadata = { fondo: metadata.fondo || 'degradado_oro' };
          break;
        case 'emoji_personalizado':
          tipoEfecto = 'emoji_personalizado';
          expiraEn = '2099-12-31T23:59:59.999Z';
          efectoMetadata = { emoji: metadata.emoji || '🎯' };
          break;
        case 'titulo_personalizado':
          tipoEfecto = 'titulo_personalizado';
          expiraEn = '2099-12-31T23:59:59.999Z';
          efectoMetadata = { titulo: metadata.titulo || 'El 10' };
          break;
        case 'badge_apostador_pro':
        case 'badge_mvp_hunter':
        case 'badge_goleador':
        case 'badge_estratega':
        case 'badge_ballena':
          tipoEfecto = 'badge';
          expiraEn = '2099-12-31T23:59:59.999Z';
          efectoMetadata = { badgeId: premioMetadata.badgeId };
          break;
        case 'freebet_50':
          tipoEfecto = 'freebet_50';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { freebetId: crypto.randomUUID(), monto: premioMetadata.monto || 50 };
          break;
        case 'cuota_mejorada':
          tipoEfecto = 'cuota_mejorada';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { bonus: premioMetadata.bonus || 0.25 };
          break;
        case 'seguro_apuesta':
          tipoEfecto = 'seguro_apuesta';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { cobertura: premioMetadata.cobertura || 0.5 };
          break;
        case 'ver_pool_apuestas':
          tipoEfecto = 'ver_pool_apuestas';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'voto_valoracion_doble':
          tipoEfecto = 'voto_valoracion_doble';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'elegir_mvp_directo':
          tipoEfecto = 'elegir_mvp_directo';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { ...metadata };
          break;
        case 'ver_votos_valoracion':
          tipoEfecto = 'ver_votos_valoracion';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'cambiar_rival':
          tipoEfecto = 'cambiar_rival';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          efectoMetadata = { rivalNuevo: metadata.rivalNuevo };
          break;
        case 'dios_del_partido':
          tipoEfecto = 'dios_del_partido';
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }

      if (tipoEfecto) {
        // Efectos de un solo valor (reutilizables): color_nombre, emoji_personalizado, fondo_carta, titulo_personalizado
        // Deben actualizar el existente en lugar de crear uno nuevo
        const efectosReutilizables = ['color_nombre', 'emoji_personalizado', 'fondo_carta', 'titulo_personalizado'];
        const esReutilizable = efectosReutilizables.includes(tipoEfecto);

        let efectoId;
        if (esReutilizable && compra.grupoId) {
          // Buscar efecto existente del mismo tipo para este usuario en este grupo
          const efectoExistente = db.prepare(`
            SELECT id FROM EfectosActivos
            WHERE usuarioId = ? AND grupoId = ? AND tipo = ? AND expiraEn > ?
          `).get(usuarioId, compra.grupoId, tipoEfecto, now);

          if (efectoExistente) {
            // Actualizar efecto existente
            db.prepare(`
              UPDATE EfectosActivos
              SET metadata = ?, creadoEn = ?
              WHERE id = ?
            `).run(JSON.stringify(efectoMetadata), now, efectoExistente.id);
            efectoId = efectoExistente.id;
            efectoCreado = true;
          // Usar partidoId de la compra si existe, sino del metadata (compra anticipada)
          const partidoIdEfecto = compra.partidoId || metadata.partidoId;
          } else {
            // Crear nuevo efecto
            efectoId = crypto.randomUUID();
            db.prepare(`
              INSERT INTO EfectosActivos (id, usuarioId, grupoId, partidoId, tipo, expiraEn, metadata, creadoEn)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(efectoId, usuarioId, compra.grupoId, partidoIdEfecto, tipoEfecto, expiraEn, JSON.stringify(efectoMetadata), now);
            efectoCreado = true;
          }
        } else {
          // Efectos normales (badges, consumibles, etc.) - crear nuevo
          efectoId = crypto.randomUUID();
          const partidoIdEfecto = compra.partidoId || metadata.partidoId;
          db.prepare(`
            INSERT INTO EfectosActivos (id, usuarioId, grupoId, partidoId, tipo, expiraEn, metadata, creadoEn)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(efectoId, usuarioId, compra.grupoId, partidoIdEfecto, tipoEfecto, expiraEn, JSON.stringify(efectoMetadata), now);
          efectoCreado = true;
        }
      }
    }
  });

  tx();

  return { ok: true, efectoCreado };
}

async function obtenerMisPremios(usuarioId, grupoId) {
  const rows = db.prepare(`
    SELECT up.*, pc.clave, pc.nombre, pc.descripcion, pc.costo, pc.categoria, pc.metadata as premioMetadata
    FROM UsuarioPremios up
    JOIN PremiosCatalogo pc ON up.premioId = pc.id
    WHERE up.usuarioId = ? AND (up.grupoId = ? OR up.grupoId IS NULL)
    ORDER BY up.fechaCompra DESC
  `).all(usuarioId, grupoId);

  return rows.map(row => ({
    ...row,
    premioMetadata: row.premioMetadata ? JSON.parse(row.premioMetadata) : null,
  }));
}

async function obtenerEfectosActivos(usuarioId, grupoId) {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT * FROM EfectosActivos
    WHERE usuarioId = ? AND (grupoId = ? OR grupoId IS NULL) AND expiraEn > ?
    ORDER BY expiraEn ASC
  `).all(usuarioId, grupoId, now);

  // Para efectos de cambiar_jugador_equipo, enriquecer con nombres de jugadores
  const efectos = rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));

  for (const efecto of efectos) {
    if (efecto.tipo === 'cambiar_jugador_equipo' && efecto.metadata) {
      const metadata = efecto.metadata;

      // Buscar nombre del jugador a mover
      if (metadata.jugadorId) {
        const usuario = db.prepare('SELECT nombre FROM Usuarios WHERE uid = ?').get(metadata.jugadorId);
        if (usuario) {
          metadata.jugadorNombre = usuario.nombre;
        } else {
          const invitado = db.prepare('SELECT nombre FROM Invitados WHERE id = ? AND grupoId = ?').get(metadata.jugadorId, grupoId);
          if (invitado) {
            metadata.jugadorNombre = invitado.nombre;
          }
        }
      }

      // Buscar nombre del jugador destino
      if (metadata.jugadorDestinoId) {
        const usuario = db.prepare('SELECT nombre FROM Usuarios WHERE uid = ?').get(metadata.jugadorDestinoId);
        if (usuario) {
          metadata.jugadorDestinoNombre = usuario.nombre;
        } else {
          const invitado = db.prepare('SELECT nombre FROM Invitados WHERE id = ? AND grupoId = ?').get(metadata.jugadorDestinoId, grupoId);
          if (invitado) {
            metadata.jugadorDestinoNombre = invitado.nombre;
          }
        }
      }
    }
  }

  return efectos;
}

async function obtenerEfectosActivosPartido(usuarioId, partidoId) {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT * FROM EfectosActivos
    WHERE usuarioId = ? AND (partidoId = ? OR partidoId IS NULL) AND expiraEn > ?
    ORDER BY expiraEn ASC
  `).all(usuarioId, partidoId, now);

  // Para efectos de cambiar_jugador_equipo, enriquecer con nombres de jugadores
  const efectos = rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));

  for (const efecto of efectos) {
    if (efecto.tipo === 'cambiar_jugador_equipo' && efecto.metadata) {
      const metadata = efecto.metadata;
      const grupoId = efecto.grupoId;

      // Buscar nombre del jugador a mover
      if (metadata.jugadorId) {
        const usuario = db.prepare('SELECT nombre FROM Usuarios WHERE uid = ?').get(metadata.jugadorId);
        if (usuario) {
          metadata.jugadorNombre = usuario.nombre;
        } else if (grupoId) {
          const invitado = db.prepare('SELECT nombre FROM Invitados WHERE id = ? AND grupoId = ?').get(metadata.jugadorId, grupoId);
          if (invitado) {
            metadata.jugadorNombre = invitado.nombre;
          }
        }
      }

      // Buscar nombre del jugador destino
      if (metadata.jugadorDestinoId) {
        const usuario = db.prepare('SELECT nombre FROM Usuarios WHERE uid = ?').get(metadata.jugadorDestinoId);
        if (usuario) {
          metadata.jugadorDestinoNombre = usuario.nombre;
        } else if (grupoId) {
          const invitado = db.prepare('SELECT nombre FROM Invitados WHERE id = ? AND grupoId = ?').get(metadata.jugadorDestinoId, grupoId);
          if (invitado) {
            metadata.jugadorDestinoNombre = invitado.nombre;
          }
        }
      }
    }
  }

  return efectos;
}

async function limpiarEfectosExpirados() {
  const now = new Date().toISOString();

  // Marcar efectos expirados
  db.prepare('DELETE FROM EfectosActivos WHERE expiraEn <= ?').run(now);

  // Marcar premios comprados como expirados si su efecto expiró y no se usaron
  db.prepare(`
    UPDATE UsuarioPremios
    SET estado = 'expirado'
    WHERE estado = 'disponible'
    AND partidoId IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM EfectosActivos ea
      WHERE ea.usuarioId = UsuarioPremios.usuarioId
      AND ea.partidoId = UsuarioPremios.partidoId
      AND ea.expiraEn > ?
    )
  `).run(now);
}

async function actualizarEfectoMetadata(usuarioId, efectoId, metadata) {
  // Primero obtener el efecto para conocer su tipo y partidoId
  const efecto = db.prepare(`
    SELECT * FROM EfectosActivos
    WHERE id = ? AND usuarioId = ?
  `).get(efectoId, usuarioId);

  if (!efecto) {
    const error = new Error('Efecto no encontrado');
    error.status = 404;
    throw error;
  }

  // Actualizar metadata
  const newMetadata = { ...JSON.parse(efecto.metadata || '{}'), ...metadata };
  const result = db.prepare(`
    UPDATE EfectosActivos
    SET metadata = ?
    WHERE id = ? AND usuarioId = ?
  `).run(JSON.stringify(newMetadata), efectoId, usuarioId);

  if (result.changes === 0) {
    const error = new Error('Efecto no encontrado');
    error.status = 404;
    throw error;
  }

  // Ejecutar el efecto si es un efecto de formación que requiere acción inmediata
  if (efecto.tipo === 'cambiar_jugador_equipo') {
    await ejecutarCambioJugadorEquipo(efecto.partidoId, newMetadata, usuarioId);
  } else if (efecto.tipo === 'elegir_equipo') {
    await ejecutarElegirEquipo(efecto.partidoId, newMetadata, usuarioId);
  } else if (efecto.tipo === 'bloquear_formacion') {
    await ejecutarBloquearFormacion(efecto.partidoId, usuarioId);
  } else if (efecto.tipo === 'voto_doble_formacion') {
    await expirarEfectoInmediato(efecto.id);
  }

  return { ok: true };
}

async function ejecutarCambioJugadorEquipo(partidoId, metadata, usuarioId) {
  const { jugadorId, jugadorDestinoId } = metadata;

  if (!jugadorId || !jugadorDestinoId) {
    const error = new Error('Faltan jugadorId o jugadorDestinoId en metadata');
    error.status = 400;
    throw error;
  }

  // Obtener las inscripciones de ambos jugadores para ver su equipo actual
  const inscripcion1 = db.prepare(`
    SELECT * FROM Inscripciones
    WHERE partidoId = ? AND (usuarioId = ? OR invitadoId = ?)
  `).get(partidoId, jugadorId, jugadorId);

  const inscripcion2 = db.prepare(`
    SELECT * FROM Inscripciones
    WHERE partidoId = ? AND (usuarioId = ? OR invitadoId = ?)
  `).get(partidoId, jugadorDestinoId, jugadorDestinoId);

  if (!inscripcion1 || !inscripcion2) {
    const error = new Error('Uno o ambos jugadores no están inscritos en este partido');
    error.status = 400;
    throw error;
  }

  // Verificar que están en equipos diferentes
  if (inscripcion1.equipo === inscripcion2.equipo) {
    const error = new Error('Ambos jugadores ya están en el mismo equipo');
    error.status = 400;
    throw error;
  }

  // Intercambiar equipos
  const equipo1 = inscripcion1.equipo;
  const equipo2 = inscripcion2.equipo;

  db.prepare(`
    UPDATE Inscripciones SET equipo = ? WHERE id = ?
  `).run(equipo2, inscripcion1.id);

  db.prepare(`
    UPDATE Inscripciones SET equipo = ? WHERE id = ?
  `).run(equipo1, inscripcion2.id);

  // Marcar el efecto como ejecutado
  db.prepare(`
    UPDATE EfectosActivos SET metadata = ?, expiraEn = ?
    WHERE partidoId = ? AND tipo = 'cambiar_jugador_equipo' AND usuarioId = ?
  `).run(JSON.stringify({ ...metadata, ejecutado: true }), new Date().toISOString(), partidoId, usuarioId);
}

async function ejecutarElegirEquipo(partidoId, metadata, usuarioId) {
  const { equipo } = metadata;

  if (!equipo || !['A', 'B'].includes(equipo)) {
    const error = new Error('Equipo inválido: debe ser A o B');
    error.status = 400;
    throw error;
  }

  // Obtener la inscripción del usuario en este partido
  const inscripcion = db.prepare(`
    SELECT * FROM Inscripciones
    WHERE partidoId = ? AND usuarioId = ? AND estado = 'anotado'
  `).get(partidoId, usuarioId);

  if (!inscripcion) {
    const error = new Error('No estás inscrito en este partido');
    error.status = 400;
    throw error;
  }

  // Asignar el equipo
  db.prepare(`
    UPDATE Inscripciones SET equipo = ? WHERE id = ?
  `).run(equipo, inscripcion.id);

  // Encontrar y expirar el efecto inmediatamente (single-use)
  const efecto = db.prepare(`
    SELECT id FROM EfectosActivos
    WHERE partidoId = ? AND tipo = 'elegir_equipo' AND usuarioId = ? AND expiraEn > ?
  `).get(partidoId, usuarioId, new Date().toISOString());

  if (efecto) {
    await expirarEfectoInmediato(efecto.id);
  }
}

async function ejecutarBloquearFormacion(partidoId, usuarioId) {
  // Passive effect - just expire it after marking as executed
  // The frontend already sends metadata.ejecutado = true
  // We just need to expire the effect
  // Need to find the effectId first
  const efecto = db.prepare(`
    SELECT id FROM EfectosActivos
    WHERE partidoId = ? AND tipo = 'bloquear_formacion' AND usuarioId = ? AND expiraEn > ?
  `).get(partidoId, usuarioId, new Date().toISOString());

  if (efecto) {
    await expirarEfectoInmediato(efecto.id);
  }
}

async function expirarEfectoInmediato(efectoId) {
  const now = new Date(Date.now() - 1000).toISOString(); // 1 second ago to avoid timing issues
  db.prepare(`
    UPDATE EfectosActivos SET expiraEn = ?, metadata = JSON_SET(COALESCE(metadata, '{}'), '$.ejecutado', true)
    WHERE id = ?
  `).run(now, efectoId);
}

module.exports = {
  obtenerCatalogo,
  obtenerPremioPorId,
  obtenerPremioPorClave,
  comprarPremio,
  usarPremio,
  obtenerMisPremios,
  obtenerEfectosActivos,
  obtenerEfectosActivosPartido,
  limpiarEfectosExpirados,
  actualizarEfectoMetadata,
  ejecutarCambioJugadorEquipo,
  ejecutarElegirEquipo,
  ejecutarBloquearFormacion,
  expirarEfectoInmediato,
};