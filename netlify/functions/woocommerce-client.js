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

// Alias entre cómo pide la gente un producto y cómo está escrito de verdad en el
// catálogo — SOLO se añaden casos confirmados fallando en real (no es (ni
// pretende ser) una lista exhaustiva de entrada; se amplía sobre la marcha).
//   'block' -> 'bloc': "block de manualidades" no encontraba nada porque en el
//   catálogo está como "BLOC" (grafía española), no "block" (anglicismo).
//   'tippex' -> 'corrector': la marca real en el catálogo es "Tipp-Ex" (con
//   guion), así que buscar "tippex" tal cual no encontraba nada — ni siquiera la
//   búsqueda cruda de WordPress, el guion rompe la coincidencia — pero
//   "corrector" sí encuentra el producto real.
const SINONIMOS_BUSQUEDA = {
  block: 'bloc',
  blocks: 'blocs',
  tippex: 'corrector',
};

// Alias de FRASE completa (no palabra por palabra) — para casos donde el
// término de búsqueda no tiene ninguna palabra en común con el nombre real del
// producto. "post it" no encontraba nada relevante (ni con la palabra "post"
// sola, que además coincidía por error con "postre") porque en el catálogo esos
// artículos están como "notas adhesivas", no como la marca genérica. Lo mismo
// con "folios": en el catálogo no existe ningún producto llamado así — el papel
// suelto está como "PAPEL Fotocopia A-4 ...", y "folio"/"Fº" solo se usa como
// abreviatura de tamaño dentro de otros artículos (carpetas, cajas...).
const FRASES_ALIAS = {
  'post it': 'nota adhesiva',
  postit: 'nota adhesiva',
  folios: 'papel fotocopia',
  folio: 'papel fotocopia',
};

// Los alias se aplican solo sobre PALABRAS COMPLETAS: si se reemplazara por
// trozos de palabra, "portafolio" se convertiría en "portapapel fotocopia" y
// "postre" en "nota adhesivare". El límite de cierre va como lookahead para no
// consumir el separador y poder encajar dos apariciones seguidas.
function applyPhraseAlias(text) {
  let result = normalizeForMatch(text || '');
  for (const [frase, reemplazo] of Object.entries(FRASES_ALIAS)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(frase)}(?=[^a-z0-9]|$)`, 'g');
    result = result.replace(re, (_m, pre) => `${pre}${reemplazo}`);
  }
  return result;
}

function applySynonyms(words) {
  return words.map((w) => SINONIMOS_BUSQUEDA[w] || w);
}

function sanitizeQuery(text) {
  return sanitizeWords(text).join(' ').trim();
}

async function rawProductSearch(term, limit) {
  const params = new URLSearchParams({ search: term, per_page: String(limit), status: 'publish' });
  const products = await wcRequest(`/products?${params.toString()}`);
  return Array.isArray(products) ? products : [];
}

function normalizeForMatch(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// El buscador nativo de WordPress/WooCommerce es un LIKE en bruto SIN ranking de
// relevancia (confirmado: no es un fallo nuestro, es una limitación conocida y
// documentada de la búsqueda por defecto) — por eso el producto correcto puede
// aparecer en los resultados pero enterrado detrás de coincidencias irrelevantes
// (comprobado en real: "jabón de manos" traía el jabón correcto en 3er lugar de
// 3, detrás de un fregadero y un rotulador). Se pide un lote más grande del que
// hace falta y se reordena aquí mismo por cuántas palabras de la búsqueda
// aparecen de verdad en el nombre del producto, descartando los que no tengan
// ninguna coincidencia, antes de recortar al límite que se va a usar.
const FETCH_LIMIT_INTERNO = 15;

// Tolerancia básica de plural/singular ("pistolas" debe contar como coincidencia
// con "PISTOLA") — no es un stemmer completo, solo prueba la palabra tal cual y
// quitando/añadiendo una "s" final. Sin esto, "pistolas de silicona" puntuaba
// igual (por "silicona") tanto los recambios de silicona como las pistolas de
// silicona de verdad, y el orden quedaba a la suerte del buscador de WordPress.
function wordVariants(word) {
  if (word.endsWith('s') && word.length > 3) return [word, word.slice(0, -1)];
  return [word, `${word}s`];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Puntúa más una coincidencia de PALABRA COMPLETA que una coincidencia a medias
// dentro de otra palabra — sin esto, "mesa" contaba igual tanto para una mesa de
// verdad como para un teléfono "SOBREmesa", y "folio" igual para un folio de
// papel que para una carpeta "portaFOLIo" (comprobado en real: ambos casos
// sacaban el producto irrelevante primero). Sigue contando algo la coincidencia
// parcial (no se pone a 0) porque ahí es donde vive el caso de los compuestos
// pegados tipo SACAGRAPAS/AFILALAPICES, que si no se romperían.
function scoreWordMatch(word, normalizedName) {
  const limite = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`);
  if (limite.test(normalizedName)) return 2;
  return normalizedName.includes(word) ? 1 : 0;
}

function rerankByRelevance(products, words) {
  return products
    .map((p) => {
      const nombreNorm = normalizeForMatch(p.name);
      const score = words.reduce((acc, w) => {
        const mejor = Math.max(...wordVariants(w).map((v) => scoreWordMatch(v, nombreNorm)));
        return acc + mejor;
      }, 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

function dedupeById(lists) {
  const vistos = new Set();
  return lists.flat().filter((p) => {
    if (vistos.has(p.id)) return false;
    vistos.add(p.id);
    return true;
  });
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
// que haya más de una palabra, y reordenar todo junto por relevancia real antes
// de recortar (ver rerankByRelevance).
// El singular/plural también se pierde a nivel de la propia búsqueda de
// WordPress, no solo al comparar después: "pistola silicona" (singular)
// encuentra las pistolas de pegamento reales, pero "pistolas silicona" (plural,
// como lo escribe el cliente) no encuentra NINGUNA — no es un problema de orden,
// esos productos ni siquiera vienen en la respuesta cruda de la API. Por eso hay
// que generar también una variante en singular de la propia búsqueda, no solo
// tolerar plural/singular al puntuar después (ver rerankByRelevance).
function singularize(word) {
  return word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
}

async function searchProducts(query, limit = 3) {
  const words = applySynonyms(sanitizeWords(applyPhraseAlias(query)));
  if (words.length === 0) return [];

  const fetchLimit = Math.max(limit, FETCH_LIMIT_INTERNO);
  let raw = await rawProductSearch(words.join(' '), fetchLimit);

  if (words.length > 1) {
    const concatResults = await rawProductSearch(words.join(''), fetchLimit);
    raw = dedupeById([concatResults, raw]);

    const singularWords = words.map(singularize);
    if (singularWords.some((w, i) => w !== words[i])) {
      const singularResults = await rawProductSearch(singularWords.join(' '), fetchLimit);
      raw = dedupeById([raw, singularResults]);
    }
  }

  let products = rerankByRelevance(raw, words).slice(0, limit);

  if (products.length === 0 && words.length > 1) {
    const porPalabra = await Promise.all(words.map((w) => rawProductSearch(w, fetchLimit)));
    const combinedRaw = dedupeById(porPalabra);
    products = rerankByRelevance(combinedRaw, words).slice(0, limit);
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
