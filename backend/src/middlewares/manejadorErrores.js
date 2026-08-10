function manejadorErrores(error, req, res, next) {
  const status = error.status || 500;
  const mensaje = status === 500 ? 'Error de servidor' : error.message;
  if (status === 500) {
    console.error(error);
  }
  res.status(status).json({ error: mensaje });
}

module.exports = manejadorErrores;
