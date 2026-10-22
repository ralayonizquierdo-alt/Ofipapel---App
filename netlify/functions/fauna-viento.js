// Viento observado en el aeropuerto de Tenerife Sur (GCTS) para el parte de
// control de fauna (fauna/procesar.js, proyecto aparte, sin relación con
// Ofipapel). Solo hace de puente: el servicio de METAR de la NOAA
// (aviationweather.gov) no deja que un navegador lo consulte directamente (sin
// CORS). Gratis y sin clave.
//
// GET ?fecha=AAAA-MM-DD → {fuente, observaciones:[{t, dir, kt, racha}]}
//   t en milisegundos UTC; dir en grados (null si es variable); kt y racha en nudos.
// Fuente principal: METAR (lo que mide el aeropuerto, cada 30 min; la NOAA solo
// guarda los últimos ~15 días). Si no hay METAR para esa fecha, viento del
// modelo de Open-Meteo (hora a hora, también gratis y sin clave), marcado
// como fuente «modelo» para que la app avise.

const GCTS = {icao: 'GCTS', lat: 28.0445, lon: -16.5725};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};
const responder = (statusCode, body, cache = 'no-store') => ({ statusCode, headers: {...CORS, 'Cache-Control': cache}, body: JSON.stringify(body) });
const MAX_HORAS_METAR = 360; // 15 días: lo que guarda la NOAA

async function pedirJSON(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {signal: ctrl.signal, headers: {'User-Agent': 'parte-fauna-fenix'}});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const texto = await r.text();
    return texto.trim() ? JSON.parse(texto) : [];
  } finally { clearTimeout(t); }
}

// El día en Canarias va de 00:00 a 24:00 hora local; se coge con margen de un
// día por cada lado y luego se filtra (el desfase con UTC es de 0 o 1 h).
function limitesDelDia(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const inicio = Date.UTC(a, m - 1, d) - 2 * 3600e3, fin = Date.UTC(a, m - 1, d + 1) + 2 * 3600e3;
  return {inicio, fin};
}

async function metar(fecha) {
  const {inicio, fin} = limitesDelDia(fecha);
  const horas = Math.ceil((Date.now() - inicio) / 3600e3);
  if (horas > MAX_HORAS_METAR || inicio > Date.now()) return [];
  const datos = await pedirJSON(`https://aviationweather.gov/api/data/metar?ids=${GCTS.icao}&format=json&hours=${Math.max(horas, 1)}`);
  return (Array.isArray(datos) ? datos : [])
    .map(o => ({t: o.obsTime * 1000, dir: typeof o.wdir === 'number' ? o.wdir : null, kt: typeof o.wspd === 'number' ? o.wspd : null, racha: typeof o.wgst === 'number' ? o.wgst : null}))
    .filter(o => o.kt !== null && o.t >= inicio && o.t <= fin)
    .sort((a, b) => a.t - b.t);
}

async function modelo(fecha) {
  const pasado = Date.now() - Date.parse(fecha) > 90 * 864e5;
  const base = pasado ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const datos = await pedirJSON(`${base}?latitude=${GCTS.lat}&longitude=${GCTS.lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=GMT&start_date=${fecha}&end_date=${fecha}`);
  const h = datos.hourly || {};
  return (h.time || []).map((t, i) => ({t: Date.parse(t + 'Z'), dir: h.wind_direction_10m?.[i] ?? null, kt: h.wind_speed_10m?.[i] == null ? null : Math.round(h.wind_speed_10m[i]), racha: null}))
    .filter(o => o.kt !== null);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return responder(405, {error: 'Solo GET'});
  const fecha = String(event.queryStringParameters?.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) return responder(400, {error: 'Falta la fecha (AAAA-MM-DD)'});
  const fallos = [];
  try {
    const obs = await metar(fecha);
    if (obs.length) return responder(200, {fuente: 'metar', estacion: GCTS.icao, observaciones: obs}, 'public, max-age=600');
  } catch (e) { fallos.push(`METAR: ${e.message}`); }
  try {
    const obs = await modelo(fecha);
    if (obs.length) return responder(200, {fuente: 'modelo', estacion: GCTS.icao, observaciones: obs}, 'public, max-age=1800');
  } catch (e) { fallos.push(`modelo: ${e.message}`); }
  return responder(502, {error: 'No hay datos de viento para esa fecha', fallos});
};

exports._internos = { metar, modelo, limitesDelDia };
