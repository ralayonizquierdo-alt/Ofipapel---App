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

// Pedido concreto por número/id. WooCommerce devuelve 404 para un id que no existe
// (wcRequest ya lo convierte en null), así que null significa "no existe ese pedido".
async function getOrder(orderId) {
  return wcRequest(`/orders/${encodeURIComponent(orderId)}`);
}

// Compara el teléfono del pedido con el número de WhatsApp desde el que escriben.
// Se comparan solo los últimos 9 dígitos (formato de móvil/fijo español), para no
// depender de que ambos lleven o no el prefijo +34.
function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').slice(-9);
}

function phoneMatches(order, whatsappFrom) {
  const orderPhone = normalizePhone(order?.billing?.phone);
  return Boolean(orderPhone) && orderPhone === normalizePhone(whatsappFrom);
}

// Segunda comprobación (cuando el teléfono no coincide): nombre comercial o nombre
// y apellidos con los que se hizo el pedido, en comparación laxa (sin acentos/
// mayúsculas, coincidencia parcial en cualquier dirección).
function normalizeNombre(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nombreCoincide(input, order) {
  const normInput = normalizeNombre(input);
  if (!normInput) return false;
  const candidatos = [
    order?.billing?.company,
    `${order?.billing?.first_name || ''} ${order?.billing?.last_name || ''}`,
  ]
    .map(normalizeNombre)
    .filter(Boolean);
  return candidatos.some((c) => c.includes(normInput) || normInput.includes(c));
}

const ESTADO_TRADUCIDO = {
  pending: 'pendiente de pago',
  'on-hold': 'en espera',
  completed: 'completado',
  cancelled: 'cancelado',
  refunded: 'reembolsado',
  failed: 'con el pago fallido',
  'checkout-draft': 'sin finalizar',
  'cancel-request': 'con una solicitud de cancelación en trámite',
};

// "processing" NO significa siempre "pagado" — con contra reembolso, por ejemplo,
// el pedido está en preparación pero no se paga hasta la entrega. Se decide la
// frase con el dato real de pago (date_paid), no solo con el nombre del estado.
function fraseProcessing(order) {
  if (order.date_paid) return 'pagado y en preparación';
  if (order.payment_method === 'cod') return 'en preparación (se paga contra reembolso al recibirlo)';
  return 'en preparación, pendiente de confirmar el pago';
}

// Mensaje en español, listo para mandar por WhatsApp, con el estado real del pedido.
function formatOrderStatus(order) {
  const estado = order.status === 'processing' ? fraseProcessing(order) : ESTADO_TRADUCIDO[order.status] || order.status;
  const fecha = order.date_created ? new Date(order.date_created).toLocaleDateString('es-ES') : null;
  const total = order.total ? `${Number(order.total).toFixed(2)}€` : null;
  let msg = `Tu pedido #${order.id}`;
  if (fecha) msg += ` (del ${fecha})`;
  msg += ` está ${estado}`;
  if (total) msg += `, por un total de ${total}`;
  msg += '.';
  return msg;
}

// "spamorder" es un estado interno (pedidos marcados como spam/fraude por un
// plugin) — si un pedido real cae ahí por error, mejor que lo revise una persona
// en vez de que el bot le diga al cliente que su pedido está marcado como spam.
function isSpamOrder(order) {
  return order?.status === 'spamorder';
}

module.exports = {
  isConfigured,
  searchProducts,
  getOrder,
  phoneMatches,
  nombreCoincide,
  formatOrderStatus,
  isSpamOrder,
};
