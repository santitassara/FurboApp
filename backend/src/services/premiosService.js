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
  const metadata = JSON.parse(premio.metadata || '{}');

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

  // Max 1 por partido para premios que lo requieren
  if (metadata.maxPorPartido && partidoId) {
    const yaCompro = db.prepare(`
      SELECT 1 FROM UsuarioPremios
      WHERE usuarioId = ? AND premioId = ? AND partidoId = ? AND estado = 'disponible'
    `).get(usuarioId, premioId, partidoId);
    if (yaCompro) {
      const error = new Error('Ya compraste este premio para este partido');
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
  if (metadata.requierePartidoId && !partidoId) {
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
  if (premioMetadata.requierePartidoId && compra.partidoId && metadata.partidoId !== compra.partidoId) {
    const error = new Error('Este premio solo se puede usar en el partido para el que se compró');
    error.status = 400;
    throw error;
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
          expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 días o hasta fin de partido
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
        const efectoId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO EfectosActivos (id, usuarioId, grupoId, partidoId, tipo, expiraEn, metadata, creadoEn)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(efectoId, usuarioId, compra.grupoId, compra.partidoId, tipoEfecto, expiraEn, JSON.stringify(efectoMetadata), now);
        efectoCreado = true;
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
  return db.prepare(`
    SELECT * FROM EfectosActivos
    WHERE usuarioId = ? AND (grupoId = ? OR grupoId IS NULL) AND expiraEn > ?
    ORDER BY expiraEn ASC
  `).all(usuarioId, grupoId, now);
}

async function obtenerEfectosActivosPartido(usuarioId, partidoId) {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM EfectosActivos
    WHERE usuarioId = ? AND (partidoId = ? OR partidoId IS NULL) AND expiraEn > ?
    ORDER BY expiraEn ASC
  `).all(usuarioId, partidoId, now);
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
};