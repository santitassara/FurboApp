const premiosService = require('../services/premiosService');

async function obtenerCatalogo(req, res) {
  const catalogo = await premiosService.obtenerCatalogo();
  res.json(catalogo);
}

async function comprarPremio(req, res) {
  const { premioId, partidoId } = req.body;
  const usuarioId = req.usuario.uid;
  const grupoId = req.miembro.grupoId;

  if (!premioId) {
    return res.status(400).json({ error: 'premioId es requerido' });
  }

  const resultado = await premiosService.comprarPremio(usuarioId, premioId, grupoId, partidoId || null);
  res.json(resultado);
}

async function usarPremio(req, res) {
  const { compraId } = req.params;
  const usuarioId = req.usuario.uid;
  const metadata = req.body || {};

  const resultado = await premiosService.usarPremio(usuarioId, compraId, metadata);
  res.json(resultado);
}

async function obtenerMisPremios(req, res) {
  const usuarioId = req.usuario.uid;
  const grupoId = req.miembro.grupoId;

  const premios = await premiosService.obtenerMisPremios(usuarioId, grupoId);
  res.json(premios);
}

async function obtenerEfectosActivos(req, res) {
  const usuarioId = req.usuario.uid;
  const grupoId = req.miembro.grupoId;

  const efectos = await premiosService.obtenerEfectosActivos(usuarioId, grupoId);
  res.json(efectos);
}

async function obtenerEfectosActivosUsuario(req, res) {
  const { uid } = req.params;
  const grupoId = req.miembro.grupoId;

  const efectos = await premiosService.obtenerEfectosActivos(uid, grupoId);
  res.json(efectos);
}

async function obtenerEfectosActivosPartido(req, res) {
  const { partidoId } = req.params;
  const usuarioId = req.usuario.uid;

  const efectos = await premiosService.obtenerEfectosActivosPartido(usuarioId, partidoId);
  res.json(efectos);
}

async function actualizarEfectoMetadata(req, res) {
  const { efectoId } = req.params;
  const usuarioId = req.usuario.uid;
  const metadata = req.body || {};

  const resultado = await premiosService.actualizarEfectoMetadata(usuarioId, efectoId, metadata);
  res.json(resultado);
}

async function expirarEfectoArmarEquipoCompleto(req, res) {
  const { partidoId } = req.params;
  const usuarioId = req.usuario?.uid;
  const grupoId = req.miembro?.grupoId;

  if (!usuarioId || !grupoId) {
    return res.status(401).json({ error: 'Usuario o grupo no identificado' });
  }

  try {
    const { db } = require('../config/db');
    const now = new Date().toISOString();

    console.log('[expire] Searching for effect:', { usuarioId, grupoId, partidoId, now });

    // Strategy 1: exact partidoId match
    let efecto = db.prepare(`
      SELECT id, partidoId, expiraEn FROM EfectosActivos
      WHERE usuarioId = ? AND grupoId = ? AND tipo = 'armar_equipo_completo'
      AND partidoId = ?
      AND expiraEn > ?
      ORDER BY creadoEn DESC LIMIT 1
    `).get(usuarioId, grupoId, partidoId, now);

    console.log('[expire] Strategy 1 (exact partidoId):', efecto);

    // Strategy 2: null partidoId (legacy/anticipada before fix)
    if (!efecto) {
      efecto = db.prepare(`
        SELECT id, partidoId, expiraEn FROM EfectosActivos
        WHERE usuarioId = ? AND grupoId = ? AND tipo = 'armar_equipo_completo'
        AND partidoId IS NULL
        AND expiraEn > ?
        ORDER BY creadoEn DESC LIMIT 1
      `).get(usuarioId, grupoId, now);

      console.log('[expire] Strategy 2 (null partidoId):', efecto);

      if (efecto) {
        db.prepare(`UPDATE EfectosActivos SET partidoId = ? WHERE id = ?`).run(partidoId, efecto.id);
        console.log('[expire] Updated effect partidoId to:', partidoId);
      }
    }

    // Strategy 3: any active effect for this user/grupo/tipo (match frontend query logic)
    if (!efecto) {
      efecto = db.prepare(`
        SELECT id, partidoId, expiraEn FROM EfectosActivos
        WHERE usuarioId = ? AND grupoId = ? AND tipo = 'armar_equipo_completo'
        AND (partidoId = ? OR partidoId IS NULL)
        AND expiraEn > ?
        ORDER BY creadoEn DESC LIMIT 1
      `).get(usuarioId, grupoId, partidoId, now);

      console.log('[expire] Strategy 3 (any active):', efecto);
    }

    // Strategy 4: any effect (even expired) for this user/grupo/tipo - last resort
    if (!efecto) {
      efecto = db.prepare(`
        SELECT id, partidoId, expiraEn FROM EfectosActivos
        WHERE usuarioId = ? AND grupoId = ? AND tipo = 'armar_equipo_completo'
        ORDER BY creadoEn DESC LIMIT 1
      `).get(usuarioId, grupoId);

      console.log('[expire] Strategy 4 (any effect):', efecto);
    }

    if (!efecto) {
      const allEffects = db.prepare(`
        SELECT id, partidoId, expiraEn, creadoEn FROM EfectosActivos
        WHERE usuarioId = ? AND grupoId = ? AND tipo = 'armar_equipo_completo'
        ORDER BY creadoEn DESC
      `).all(usuarioId, grupoId);
      console.log('[expire] All effects for user/grupo/tipo:', allEffects);
      return res.status(404).json({ error: 'Efecto no encontrado o ya expirado', debug: { usuarioId, grupoId, partidoId } });
    }

    await premiosService.expirarEfectoInmediato(efecto.id);
    console.log('[expire] Effect expired successfully:', efecto.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error expirando efecto armar_equipo_completo:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}

module.exports = {
  obtenerCatalogo,
  comprarPremio,
  usarPremio,
  obtenerMisPremios,
  obtenerEfectosActivos,
  obtenerEfectosActivosUsuario,
  obtenerEfectosActivosPartido,
  actualizarEfectoMetadata,
  expirarEfectoArmarEquipoCompleto,
};