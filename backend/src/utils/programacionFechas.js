const ZONA = 'America/Argentina/Buenos_Aires';

const DIAS_CORTOS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// El offset se resuelve por fecha en vez de hardcodear -03:00: si Argentina
// vuelve a usar horario de verano, los cálculos siguen siendo correctos.
function offsetZonaMinutos(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    timeZoneName: 'longOffset',
  }).formatToParts(fecha);
  const nombreZona = partes.find((parte) => parte.type === 'timeZoneName')?.value ?? '';
  const coincidencia = /GMT([+-])(\d{2}):(\d{2})/.exec(nombreZona);
  if (!coincidencia) return 0;
  const signo = coincidencia[1] === '-' ? -1 : 1;
  return signo * (Number(coincidencia[2]) * 60 + Number(coincidencia[3]));
}

function partesLocales(fecha) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo) => Number(partes.find((parte) => parte.type === tipo).value);
  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    horas: valor('hour'),
    minutos: valor('minute'),
  };
}

function diaSemanaLocal(fecha) {
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'short' }).format(fecha);
  return DIAS_CORTOS.indexOf(nombre);
}

// Construye un Date UTC a partir de una hora de pared argentina. El offset se
// aplica en dos pasos porque el offset correcto depende del instante final.
function desdeHoraLocal(anio, mesIndice, dia, horas, minutos) {
  const tentativa = Date.UTC(anio, mesIndice, dia, horas, minutos);
  const offsetInicial = offsetZonaMinutos(new Date(tentativa));
  const corregida = new Date(tentativa - offsetInicial * 60000);
  const offsetFinal = offsetZonaMinutos(corregida);
  if (offsetFinal === offsetInicial) return corregida;
  return new Date(tentativa - offsetFinal * 60000);
}

function partesHora(horaTexto) {
  const [horas, minutos] = String(horaTexto).split(':').map(Number);
  return { horas, minutos };
}

function proximaOcurrencia(desde, diaSemana, horaTexto, minimoDias = 0) {
  const { horas, minutos } = partesHora(horaTexto);
  const { anio, mes, dia } = partesLocales(desde);
  let delta = (diaSemana - diaSemanaLocal(desde) + 7) % 7;
  if (delta < minimoDias) delta += 7;
  let candidata = desdeHoraLocal(anio, mes - 1, dia + delta, horas, minutos);
  if (candidata <= desde) {
    candidata = desdeHoraLocal(anio, mes - 1, dia + delta + 7, horas, minutos);
  }
  return candidata;
}

function ultimaOcurrencia(hasta, diaSemana, horaTexto) {
  const { horas, minutos } = partesHora(horaTexto);
  const { anio, mes, dia } = partesLocales(hasta);
  const delta = (diaSemanaLocal(hasta) - diaSemana + 7) % 7;
  let candidata = desdeHoraLocal(anio, mes - 1, dia - delta, horas, minutos);
  if (candidata > hasta) {
    candidata = desdeHoraLocal(anio, mes - 1, dia - delta - 7, horas, minutos);
  }
  return candidata;
}

function calcularProximoDisparo(programacion, desde) {
  return proximaOcurrencia(desde, programacion.diaSemanaDisparo, programacion.horaDisparo);
}

function calcularUltimoDisparo(programacion, hasta) {
  return ultimaOcurrencia(hasta, programacion.diaSemanaDisparo, programacion.horaDisparo);
}

function calcularFechaPartido(programacion, momentoDisparo) {
  // Si el partido cae el mismo día de semana que el disparo, se va a la semana
  // siguiente: sin esto, "los viernes creá el partido del viernes" abriría la
  // inscripción para dentro de unos minutos.
  const minimoDias = programacion.diaSemanaPartido === programacion.diaSemanaDisparo ? 7 : 0;
  return proximaOcurrencia(momentoDisparo, programacion.diaSemanaPartido, programacion.horaPartido, minimoDias);
}

function formatearHoraArgentina(fecha) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha);
}

module.exports = {
  ZONA,
  calcularProximoDisparo,
  calcularUltimoDisparo,
  calcularFechaPartido,
  formatearHoraArgentina,
};
