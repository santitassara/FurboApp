const CACHE_TTL_MS = 60 * 60 * 1000;
const cachePronostico = new Map();

const REGEX_CPA_ARGENTINO = /\b[A-Z]\d{4}[A-Z]{3}\b/gi;
const REGEX_GRAN_BUENOS_AIRES = /\bgran\s+buenos\s+aires\b|\bgba\b/gi;

function limpiarDireccion(direccion) {
  return direccion
    .replace(REGEX_CPA_ARGENTINO, '')
    .replace(REGEX_GRAN_BUENOS_AIRES, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,|,\s*$/g, '')
    .trim();
}

async function buscarEnNominatim(consulta) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(consulta)}&format=json&limit=1`;
  const respuesta = await fetch(url, {
    signal: AbortSignal.timeout(3000),
    headers: { 'User-Agent': 'FurboApp (https://github.com/santitassara/FurboApp)' },
  });
  if (!respuesta.ok) return null;
  const datos = await respuesta.json();
  if (!Array.isArray(datos) || datos.length === 0) return null;
  return { lat: Number(datos[0].lat), lon: Number(datos[0].lon) };
}

async function geocodificar(direccion) {
  if (!direccion) return null;
  try {
    const resultado = await buscarEnNominatim(direccion);
    if (resultado) return resultado;

    // Algunas direcciones argentinas traen el CPA (ej. "B1706EYJ") o la
    // frase "Gran Buenos Aires"/"GBA" — Nominatim no los reconoce y eso
    // hace fallar la búsqueda completa. Reintentamos sin ese ruido.
    const direccionLimpia = limpiarDireccion(direccion);
    if (direccionLimpia && direccionLimpia !== direccion) {
      return await buscarEnNominatim(direccionLimpia);
    }
    return null;
  } catch (error) {
    console.error('Error geocodificando dirección:', error.message);
    return null;
  }
}

async function obtenerPronostico(lat, lon, fechaPartidoISO) {
  if (lat == null || lon == null || !process.env.OPENWEATHER_API_KEY) return null;

  let fechaPartido;
  let claveCache;
  try {
    fechaPartido = new Date(fechaPartidoISO);
    claveCache = `${lat.toFixed(2)},${lon.toFixed(2)},${fechaPartido.toISOString().slice(0, 10)}`;
  } catch (error) {
    console.error('Error parseando la fecha del partido para el pronóstico:', error.message);
    return null;
  }

  const diffMs = fechaPartido.getTime() - Date.now();
  if (diffMs > 5 * 24 * 60 * 60 * 1000) {
    return { disponible: false };
  }

  const cacheado = cachePronostico.get(claveCache);
  if (cacheado && Date.now() - cacheado.timestamp < CACHE_TTL_MS) {
    return cacheado.valor;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${process.env.OPENWEATHER_API_KEY}`;
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!respuesta.ok) {
      cachePronostico.set(claveCache, { valor: null, timestamp: Date.now() });
      return null;
    }
    const datos = await respuesta.json();
    const lista = datos.list || [];
    if (lista.length === 0) {
      cachePronostico.set(claveCache, { valor: null, timestamp: Date.now() });
      return null;
    }

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
    cachePronostico.set(claveCache, { valor: null, timestamp: Date.now() });
    return null;
  }
}

module.exports = { geocodificar, obtenerPronostico };
