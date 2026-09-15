const CACHE_TTL_MS = 60 * 60 * 1000;
const cachePronostico = new Map();

async function geocodificar(direccion) {
  if (!direccion || !process.env.OPENWEATHER_API_KEY) return null;
  try {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      direccion
    )}&limit=1&appid=${process.env.OPENWEATHER_API_KEY}`;
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    if (!Array.isArray(datos) || datos.length === 0) return null;
    return { lat: datos[0].lat, lon: datos[0].lon };
  } catch (error) {
    console.error('Error geocodificando dirección:', error.message);
    return null;
  }
}

async function obtenerPronostico(lat, lon, fechaPartidoISO) {
  if (lat == null || lon == null || !process.env.OPENWEATHER_API_KEY) return null;

  const fechaPartido = new Date(fechaPartidoISO);
  const diffMs = fechaPartido.getTime() - Date.now();
  if (diffMs > 5 * 24 * 60 * 60 * 1000) {
    return { disponible: false };
  }

  const claveCache = `${lat.toFixed(2)},${lon.toFixed(2)},${fechaPartido.toISOString().slice(0, 10)}`;
  const cacheado = cachePronostico.get(claveCache);
  if (cacheado && Date.now() - cacheado.timestamp < CACHE_TTL_MS) {
    return cacheado.valor;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${process.env.OPENWEATHER_API_KEY}`;
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const lista = datos.list || [];
    if (lista.length === 0) return null;

    const masCercano = lista.reduce((mejor, actual) => {
      const diffActual = Math.abs(new Date(actual.dt_txt).getTime() - fechaPartido.getTime());
      const diffMejor = Math.abs(new Date(mejor.dt_txt).getTime() - fechaPartido.getTime());
      return diffActual < diffMejor ? actual : mejor;
    }, lista[0]);

    const valor = {
      disponible: true,
      temp: masCercano.main.temp,
      descripcion: masCercano.weather?.[0]?.description || '',
      icono: masCercano.weather?.[0]?.icon || '',
    };
    cachePronostico.set(claveCache, { valor, timestamp: Date.now() });
    return valor;
  } catch (error) {
    console.error('Error obteniendo pronóstico:', error.message);
    return null;
  }
}

module.exports = { geocodificar, obtenerPronostico };
