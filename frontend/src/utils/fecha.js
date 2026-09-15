export function formatearFechaPartido(fechaISO) {
  return new Date(fechaISO).toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function tituloHeroPartido(fechaISO) {
  const fecha = new Date(fechaISO);
  const hoy = new Date();
  const esHoy = fecha.toDateString() === hoy.toDateString();
  const hora = fecha.toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' });

  if (esHoy) {
    return `Hoy tenés partido a las ${hora}`;
  }
  const dia = fecha.toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Próximo partido: ${dia} a las ${hora}`;
}
