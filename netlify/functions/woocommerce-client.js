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
// Ojo: se permiten palabras de 2 letras (no solo 3+) porque en referencias de
// producto abundan las siglas cortas con significado real — "HP", "XL", "A4"...
// quitarlas dejaba búsquedas como "HP 301 XL" reducidas a solo "301", que ya no
// encuentra el cartucho concreto entre miles de productos.
function sanitizeWords(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS_BUSQUEDA.has(w));
}

function sanitizeQuery(text) {
  return sanitizeWords(text).join(' ').trim();
}

async function rawProductSearch(term, limit) {
  const params = new URLSearchParams({ search: term, per_page: String(limit), status: 'publish' });
  const products = await wcRequest(`/products?${params.toString()}`);
  return Array.isArray(products) ? products : [];
}

// Busca productos publicados por texto libre (nombre, SKU...). Devuelve un resumen
// simplificado (no el objeto completo de WooCommerce) para pasarlo a la IA como
// contexto real de esta consulta concreta.
//
// Muchos nombres de artículos de papelería son compuestos, y en el catálogo a
// veces están como UNA sola palabra pegada (SACAGRAPAS, AFILALAPICES, BORRATINTA)
// mientras el cliente escribe "saca grapas", "afila lápices", "borra tinta" con
// espacio. OJO: la búsqueda por frase con espacios no siempre devuelve CERO
// resultados en estos casos — a veces devuelve varios resultados IRRELEVANTES
// (comprobado en real: "porta lapices" o "borra tinta" sí devuelven productos,
// pero ninguno tiene que ver) — así que no basta con probar "todo junto" solo
// cuando la frase no encuentra nada; hay que combinar ambas búsquedas siempre
// que haya más de una palabra, dando prioridad a los resultados de "todo junto"
// (más precisos para estos términos compuestos) sobre los de la frase con espacios.
async function searchProducts(query, limit = 3) {
  const words = sanitizeWords(query);
  if (words.length === 0) return [];

  let products = await rawProductSearch(words.join(' '), limit);

  if (words.length > 1) {
    const concatResults = await rawProductSearch(words.join(''), limit);
    const vistos = new Set();
    products = [...concatResults, ...products].filter((p) => {
      if (vistos.has(p.id)) return false;
      vistos.add(p.id);
      return true;
    });
  }

  if (products.length === 0 && words.length > 1) {
    const porPalabra = await Promise.all(words.map((w) => rawProductSearch(w, limit)));
    const vistos = new Set();
    products = porPalabra
      .flat()
      .filter((p) => {
        if (vistos.has(p.id)) return false;
        vistos.add(p.id);
        return true;
      })
      .slice(0, limit);
  } else {
    products = products.slice(0, limit);
  }

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

// URL pública de la página de una categoría en la web (comprobado contra la
// estructura real de ofipapel.net — no viene en la respuesta de la API).
function categoryUrl(slug) {
  return `https://ofipapel.net/categoria-producto/${slug}/`;
}

// Busca categorías de producto por texto libre — útil cuando una búsqueda genérica
// ("grapadoras") tiene demasiados artículos distintos como para adivinar cuál
// quiere el cliente, y es mejor preguntar por el tipo (Tenaza, Eléctricas...) y
// enlazar directamente a esa categoría en vez de a un producto suelto.
async function searchCategories(query, limit = 8) {
  const cleanQuery = sanitizeQuery(query);
  if (!cleanQuery) return [];

  const params = new URLSearchParams({ search: cleanQuery, per_page: String(limit) });
  const categorias = await wcRequest(`/products/categories?${params.toString()}`);
  if (!Array.isArray(categorias)) return [];
  return categorias
    .filter((c) => c.count > 0)
    .map((c) => ({
      nombre: c.name,
      cantidadProductos: c.count,
      esSubcategoria: Boolean(c.parent),
      url: categoryUrl(c.slug),
    }));
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
// el pedido está en preparación pero no se paga hasta la entrega. Se decide con el
// dato real de pago (date_paid), no solo con el nombre del estado. "extra" es una
// frase aparte (después del total) para no romper la construcción "está X, por un
// total de Y" a media frase.
function fraseProcessing(order) {
  if (order.date_paid) return { estado: 'pagado y en preparación', extra: '' };
  if (order.payment_method === 'cod') {
    return { estado: 'en preparación', extra: ' Ha elegido pago contra reembolso, así que se paga al recibirlo.' };
  }
  return { estado: 'en preparación, pendiente de confirmar el pago', extra: '' };
}

// El sistema de gestión de las tiendas NO avisa a la web en cuanto se factura o
// envía un pedido (hace falta un cambio manual) — así que "en preparación" en la
// web puede ir por detrás de la realidad. Se avisa de eso solo en ese estado
// concreto (el resto de estados sí son fiables: completado, cancelado, etc.).
const AVISO_POSIBLE_DESACTUALIZACION =
  ' Ten en cuenta que si ya se ha facturado o enviado, ese cambio puede tardar en reflejarse aquí — para el dato exacto al momento, escribe a pedidos@ofipapelsl.com o llama al 922 753 520 (extensión 2).';

// Mensaje en español, listo para mandar por WhatsApp, con el estado real del pedido.
function formatOrderStatus(order) {
  const esProcessing = order.status === 'processing';
  const { estado, extra } = esProcessing
    ? fraseProcessing(order)
    : { estado: ESTADO_TRADUCIDO[order.status] || order.status, extra: '' };
  const fecha = order.date_created ? new Date(order.date_created).toLocaleDateString('es-ES') : null;
  const total = order.total ? `${Number(order.total).toFixed(2)}€` : null;
  let msg = `Tu pedido #${order.id}`;
  if (fecha) msg += ` (del ${fecha})`;
  msg += ` está ${estado}`;
  if (total) msg += `, por un total de ${total}`;
  msg += '.';
  if (extra) msg += extra;
  if (esProcessing) msg += AVISO_POSIBLE_DESACTUALIZACION;
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
  searchCategories,
  getOrder,
  phoneMatches,
  nombreCoincide,
  formatOrderStatus,
  isSpamOrder,
};
