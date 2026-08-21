export function formatearFechaPartido(fechaISO) {
  return new Date(fechaISO).toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
