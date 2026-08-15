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

const store = require('./conversation-store');

const WC_BASE_URL = 'https://ofipapel.net/wp-json/wc/v3';

function isConfigured() {
  return Boolean(process.env.WOOCOMMERCE_CONSUMER_KEY && process.env.WOOCOMMERCE_CONSUMER_SECRET);
}

// La búsqueda de WordPress tarda unos 3,5 s por consulta contra el servidor real,
// y la función tiene un límite de tiempo para contestarle a Meta (si se pasa,
// Meta reintenta y el cliente recibe respuestas duplicadas). Con este tope, si la
// web va especialmente lenta se abandona esa consulta y el bot sigue adelante sin
// datos de catálogo — igual que cuando no hay claves configuradas — en vez de
// bloquear toda la respuesta.
const WC_TIMEOUT_MS = 6000;
// La consulta de ofertas por cantidad es un extra (solo enriquece la respuesta),
// así que se le da menos margen: si tarda, se prescinde de ese dato y se
// contesta igual, en vez de arriesgar el tiempo total de la respuesta.
const WC_TIMEOUT_EXTRA_MS = 3000;

async function wcRequest(path, timeoutMs = WC_TIMEOUT_MS) {
  if (!isConfigured()) return null;
  const auth = Buffer.from(
    `${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`
  ).toString('base64');

  try {
    const resp = await fetch(`${WC_BASE_URL}${path}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      console.error('Error de WooCommerce API:', resp.status, await resp.text());
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error('Fallo llamando a WooCommerce:', err.name === 'TimeoutError' ? `tiempo agotado (${timeoutMs} ms)` : err);
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
function applyPhraseAlias(text, aliasAprendidos = {}) {
  let result = normalizeForMatch(text || '');
  // Los aprendidos van primero: si una persona ha corregido un término desde el
  // panel, esa decisión manda sobre la lista fija del código.
  const todos = { ...aliasAprendidos, ...FRASES_ALIAS, ...aliasAprendidos };
  for (const [frase, reemplazo] of Object.entries(todos)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizeForMatch(frase))}(?=[^a-z0-9]|$)`, 'g');
    result = result.replace(re, (_m, pre) => `${pre}${normalizeForMatch(reemplazo)}`);
  }
  return result;
}

// Los aliases aprendidos se leen del almacén compartido, pero se guardan unos
// minutos en memoria del proceso: cambian poquísimo (los edita una persona a
// mano) y no compensa consultarlos en cada búsqueda.
const ALIAS_MEMORIA_MS = 5 * 60 * 1000;
let aliasEnMemoria = { datos: null, ts: 0 };

async function getAliasAprendidos() {
  if (!store.isConfigured()) return {};
  if (aliasEnMemoria.datos && Date.now() - aliasEnMemoria.ts < ALIAS_MEMORIA_MS) {
    return aliasEnMemoria.datos;
  }
  const datos = (await store.getAliasesBusqueda()) || {};
  aliasEnMemoria = { datos, ts: Date.now() };
  return datos;
}

function applySynonyms(words) {
  return words.map((w) => SINONIMOS_BUSQUEDA[w] || w);
}

function sanitizeQuery(text) {
  return sanitizeWords(text).join(' ').trim();
}

// Se piden SOLO los campos que se usan: la respuesta completa de 40 productos
// pesa ~1,1 MB (lleva descripciones y caché del maquetador de la web), mientras
// que con _fields baja a ~8 KB. Medido contra el servidor real — misma consulta,
// 130 veces menos datos que transferir desde la función de Netlify.
const CAMPOS_LIGEROS = 'id,name,price,permalink,stock_status';

async function rawProductSearch(term, limit) {
  const params = new URLSearchParams({
    search: term,
    per_page: String(limit),
    status: 'publish',
    _fields: CAMPOS_LIGEROS,
  });
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
const FETCH_LIMIT_INTERNO = 40;

// Tolerancia básica de plural/singular ("pistolas" debe contar como coincidencia
// con "PISTOLA") — no es un stemmer completo, solo prueba la palabra tal cual y
// quitando/añadiendo una "s" final. Sin esto, "pistolas de silicona" puntuaba
// igual (por "silicona") tanto los recambios de silicona como las pistolas de
// silicona de verdad, y el orden quedaba a la suerte del buscador de WordPress.
// En referencias de consumibles, la misma pieza aparece con el número y las
// letras juntos o separados según el producto: los cartuchos originales están
// como "(603XL)" y los compatibles equivalentes como "603 XL". El cliente
// escribe una de las dos formas y se pierde la otra — comprobado en real:
// "603XL" solo encontraba los originales (18-88€) y dejaba fuera los
// compatibles (4,56€), que era justo lo que buscaba el cliente.
function splitAlfaNum(word) {
  return word.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
}

function wordVariants(word) {
  const variantes = word.endsWith('s') && word.length > 3 ? [word, word.slice(0, -1)] : [word, `${word}s`];
  const separada = splitAlfaNum(word);
  if (separada !== word) variantes.push(separada);
  return variantes;
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

// Señal real de "este producto tiene precio escalado por cantidad" (la "Oferta
// Cantidad" que se ve en su ficha web): el meta n_tarifas > 0. Comprobado contra
// el catálogo real — los dos papeles de oferta que el propietario quiere ofrecer
// (Mattio y Paperline) lo llevan a 6, mientras que otros papeles equivalentes
// sin oferta (ZOOM, Golden-Star) lo llevan a 0. OJO: los meta pvp_1..pvp_6 NO
// son ese escalado (no coinciden con la tabla que muestra la web), así que no se
// usan para calcular precios — solo se avisa de que el escalado existe y se
// remite a la ficha.
function tieneOfertaPorCantidad(product) {
  const meta = product?.meta_data?.find((m) => m.key === 'n_tarifas');
  return Boolean(meta && Number(meta.value) > 0);
}

// El dato de oferta por cantidad vive en meta_data, que es lo pesado de la
// respuesta (~14 KB por producto, frente a ~200 bytes de los campos ligeros).
// Por eso NO se pide en las búsquedas: se consulta después, en una sola petición
// y solo para los pocos finalistas que se van a mostrar.
async function fetchOfertaFlags(ids) {
  if (ids.length === 0) return new Set();
  const params = new URLSearchParams({
    include: ids.join(','),
    per_page: String(ids.length),
    _fields: 'id,meta_data',
  });
  const productos = await wcRequest(`/products?${params.toString()}`, WC_TIMEOUT_EXTRA_MS);
  if (!Array.isArray(productos)) return new Set();
  return new Set(productos.filter(tieneOfertaPorCantidad).map((p) => p.id));
}

function scoreProducts(products, words) {
  return products
    .map((p) => {
      const nombreNorm = normalizeForMatch(p.name);
      const score = words.reduce((acc, w) => {
        const mejor = Math.max(...wordVariants(w).map((v) => scoreWordMatch(v, nombreNorm)));
        return acc + mejor;
      }, 0);
      return { p, score };
    })
    .filter((x) => x.score > 0);
}

// A igualdad de relevancia, se prefiere lo que de verdad le sirve al cliente:
// primero lo que está en stock, y luego los productos con oferta por cantidad
// (que son los que el negocio quiere ofrecer). No se toca el orden cuando la
// relevancia difiere: un producto en oferta nunca adelanta a otro que encaja
// mejor con lo que ha pedido el cliente.
function ordenarPorRelevancia(scored, idsConOferta) {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const stockA = a.p.stock_status === 'instock' ? 1 : 0;
    const stockB = b.p.stock_status === 'instock' ? 1 : 0;
    if (stockB !== stockA) return stockB - stockA;

    return (idsConOferta.has(b.p.id) ? 1 : 0) - (idsConOferta.has(a.p.id) ? 1 : 0);
  });
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
// de recortar (ver ordenarPorRelevancia).
// El singular/plural también se pierde a nivel de la propia búsqueda de
// WordPress, no solo al comparar después: "pistola silicona" (singular)
// encuentra las pistolas de pegamento reales, pero "pistolas silicona" (plural,
// como lo escribe el cliente) no encuentra NINGUNA — no es un problema de orden,
// esos productos ni siquiera vienen en la respuesta cruda de la API. Por eso hay
// que generar también una variante en singular de la propia búsqueda, no solo
// tolerar plural/singular al puntuar después (ver ordenarPorRelevancia).
function singularize(word) {
  return word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
}

async function searchProducts(query, limit = 3) {
  const aliasAprendidos = await getAliasAprendidos();
  const words = applySynonyms(sanitizeWords(applyPhraseAlias(query, aliasAprendidos)));
  if (words.length === 0) return [];

  // La consulta ya normalizada es la clave de caché: dos clientes que preguntan
  // lo mismo con otras palabras ("¿tenéis cartulina fucsia?" / "cartulina
  // fucsia") comparten resultado.
  const cacheKey = `${words.join(' ')}|${limit}`;
  const cacheado = await store.getCachedSearch(cacheKey);
  if (cacheado) return cacheado;

  const fetchLimit = Math.max(limit, FETCH_LIMIT_INTERNO);

  // Las variantes se lanzan EN PARALELO: hechas una tras otra sumaban sus
  // tiempos (~3,4 s cada una contra el servidor real, hasta 10 s en total), lo
  // que se acercaba peligrosamente al límite de tiempo de la función. En
  // paralelo, el total es el de la más lenta.
  const terminos = [words.join(' ')];
  if (words.length > 1) {
    terminos.push(words.join(''));
    const singularWords = words.map(singularize);
    if (singularWords.some((w, i) => w !== words[i])) terminos.push(singularWords.join(' '));
  }
  // Referencias tipo "603XL" -> "603 XL" (ver splitAlfaNum): hay productos
  // catalogados de una forma y otros de la otra, así que se busca en las dos.
  const alfaNumSeparado = words.map(splitAlfaNum).join(' ');
  if (alfaNumSeparado !== words.join(' ')) terminos.push(alfaNumSeparado);
  const [frase, ...otras] = await Promise.all(terminos.map((t) => rawProductSearch(t, fetchLimit)));
  let raw = dedupeById([...otras, frase]);

  let scored = scoreProducts(raw, words);

  if (scored.length === 0 && words.length > 1) {
    const porPalabra = await Promise.all(words.map((w) => rawProductSearch(w, fetchLimit)));
    scored = scoreProducts(dedupeById(porPalabra), words);
  }

  // Se comprueba la oferta por cantidad de unos cuantos finalistas (no de todos
  // los candidatos, que sería muchísimo más pesado) y con ese dato se afina el
  // orden definitivo antes de recortar a lo que se va a mostrar.
  const preseleccion = ordenarPorRelevancia(scored, new Set()).slice(0, Math.max(limit * 2, 8));
  const idsConOferta = await fetchOfertaFlags(preseleccion.map((x) => x.p.id));
  const finalistas = ordenarPorRelevancia(preseleccion, idsConOferta).slice(0, limit);

  const resultado = finalistas.map(({ p }) => ({
    nombre: p.name,
    precio: p.price ? `${Number(p.price).toFixed(2)}€` : null,
    disponible: p.stock_status === 'instock',
    ofertaPorCantidad: idsConOferta.has(p.id),
    url: p.permalink,
  }));

  if (resultado.length > 0) {
    await store.setCachedSearch(cacheKey, resultado);
  } else {
    // Sin resultados: se anota lo que pidió el cliente para poder revisarlo en el
    // panel y enseñarle al bot a qué corresponde. Cada fallo se convierte así en
    // una mejora, en vez de repetirse con el siguiente cliente. No se cachea el
    // vacío a propósito: en cuanto alguien defina el alias, debe funcionar ya.
    await store.registrarBusquedaSinResultado(words.join(' '));
  }

  return resultado;
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
