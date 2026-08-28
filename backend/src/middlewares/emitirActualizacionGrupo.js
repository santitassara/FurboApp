function emitirActualizacionGrupo(req, res, next) {
  res.on('finish', () => {
    if (req.method === 'GET') return;
    if (res.statusCode >= 400) return;
    const { grupoId } = req.params;
    if (!grupoId) return;
    const io = req.app.get('io');
    io?.to(`grupo:${grupoId}`).emit('grupoActualizado');
  });
  next();
}

module.exports = emitirActualizacionGrupo;
