// Cliente de la API REST de WooCommerce (ofipapel.net), usado por el bot de
// WhatsApp para consultar productos/precios/stock reales en vez de que la IA
// adivine. Sin dependencias npm — solo fetch, igual que el resto de netlify/functions.
//
// Variables de entorno necesarias (Netlify > Site settings > Environment variables):
//   WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET  claves de la API REST
//     de WooCommerce (WooCommerce > Ajustes > Avanzado > REST API), con permiso
//     de lectura. Sin ellas, isConfigured() devuelve false y searchProducts()
//     devuelve siempre [] — el bot cae de vuelta al comportamiento anterior
//     (nunca confirma ni descarta productos concretos).

const WC_BASE_URL = 'https://ofipapel.net/wp-json/wc/v3';

function isConfigured() {
  return Boolean(process.env.WOOCOMMERCE_CONSUMER_KEY && process.env.WOOCOMMERCE_CONSUMER_SECRET);
}

async function wcRequest(path) {
  if (!isConfigured()) return null;
  const auth = Buffer.from(
    `${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`
  ).toString('base64');

  try {
    const resp = await fetch(`${WC_BASE_URL}${path}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!resp.ok) {
      console.error('Error de WooCommerce API:', resp.status, await resp.text());
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error('Fallo llamando a WooCommerce:', err);
    return null;
  }
}

// Palabras que diluyen la búsqueda de WordPress (que no es muy tolerante con frases
// completas): quitarlas deja solo los términos que de verdad describen el producto.
const STOPWORDS_BUSQUEDA = new Set([
  'que', 'para', 'con', 'los', 'las', 'del', 'por', 'una', 'uno', 'unos', 'unas',
  'esta', 'este', 'esto', 'pero', 'como', 'donde', 'cuando', 'tiene', 'tienen',
  'teneis', 'teneís', 'tenéis', 'hay', 'hola', 'buenas', 'gracias', 'favor',
  'sobre', 'quiero', 'necesito', 'puedo', 'podeis', 'podéis', 'vosotros',
  'ustedes', 'sido', 'el', 'la', 'lo', 'un', 'y', 'o', 'de', 'en', 'al', 'se',
  'me', 'mi', 'tu', 'su', 'vendeis', 'vendéis', 'venden',
]);

// Quita acentos, signos de puntuación y palabras vacías del mensaje del cliente,
// para quedarnos solo con los términos que describen el producto — una frase
// completa con "¿...?" apenas devuelve resultados en la búsqueda de WordPress.
function sanitizeQuery(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS_BUSQUEDA.has(w))
    .join(' ')
    .trim();
}

// Busca productos publicados por texto libre (nombre, SKU...). Devuelve un resumen
// simplificado (no el objeto completo de WooCommerce) para pasarlo a la IA como
// contexto real de esta consulta concreta.
async function searchProducts(query, limit = 3) {
  const cleanQuery = sanitizeQuery(query);
  if (!cleanQuery) return [];

  const params = new URLSearchParams({ search: cleanQuery, per_page: String(limit), status: 'publish' });
  const products = await wcRequest(`/products?${params.toString()}`);
  if (!Array.isArray(products)) return [];
  return products.map((p) => ({
    nombre: p.name,
    precio: p.price ? `${Number(p.price).toFixed(2)}€` : null,
    disponible: p.stock_status === 'instock',
    url: p.permalink,
  }));
}

module.exports = { isConfigured, searchProducts };
