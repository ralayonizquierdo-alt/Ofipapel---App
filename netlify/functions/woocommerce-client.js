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
let WC_TIMEOUT_MS = 6000;

// El reintento en segundo plano no tiene el límite de 10 segundos del webhook,
// así que ahí se le da a la web todo el margen que necesite: si va lenta,
// esperarla es justo lo que queremos, y es la diferencia entre contestarle al
// cliente con datos reales o con un genérico.
function usarTiemposLargos(ms = 20000) {
  WC_TIMEOUT_MS = ms;
}
// La consulta de ofertas por cantidad es un extra (solo enriquece la respuesta),
// así que se le da menos margen: si tarda, se prescinde de ese dato y se
// contesta igual, en vez de arriesgar el tiempo total de la respuesta.
const WC_TIMEOUT_EXTRA_MS = 3000;

// Con qué se identifica el bot ante ofipapel.net.
//
// Hace falta porque la protección anti-bots del hosting va DELANTE de
// WordPress: corta la petición antes de que WooCommerce llegue a mirar las
// claves de la API, así que tener claves válidas no sirve de nada frente a
// ella. Comprobado en real: devuelve una página HTML de "One moment,
// please..." en vez del JSON, y el bot se queda sin datos de catálogo.
//
// Por defecto, Node no manda User-Agent, y una petición sin User-Agent es justo
// lo que esas protecciones consideran sospechoso. Con este, quien administre la
// web puede reconocernos y dejarnos pasar sin abrirle la puerta a nadie más.
const USER_AGENT = 'OfipapelWhatsAppBot/1.0 (+https://ofipapel.net; bot de atencion al cliente)';

// Y si además hace falta una marca que nadie pueda imitar, se configura
// WOOCOMMERCE_BYPASS_TOKEN en Netlify y el mismo valor en la regla del
// cortafuegos. Sin la variable no se manda nada y todo sigue igual.
function cabeceras(auth) {
  const headers = {
    Authorization: `Basic ${auth}`,
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };
  const token = process.env.WOOCOMMERCE_BYPASS_TOKEN;
  if (token) headers['X-Ofipapel-Bot'] = token;
  return headers;
}

async function wcRequest(path, timeoutMs = WC_TIMEOUT_MS) {
  if (!isConfigured()) return null;
  const auth = Buffer.from(
    `${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`
  ).toString('base64');

  try {
    const resp = await fetch(`${WC_BASE_URL}${path}`, {
      headers: cabeceras(auth),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      console.error('Error de WooCommerce API:', resp.status, await resp.text());
      return null;
    }

    // Un 200 con HTML no es una respuesta de la API: es la pantalla de "One
    // moment, please..." del cortafuegos del hosting. Se distingue en el log
    // porque el arreglo es completamente distinto (una regla en el hosting, no
    // algo del código) y sin este mensaje parece un fallo nuestro.
    const tipo = resp.headers.get('content-type') || '';
    if (!tipo.includes('json')) {
      console.error(
        `WooCommerce devolvió "${tipo}" en vez de JSON: la protección anti-bots de ofipapel.net ` +
          'nos ha bloqueado (ver WHATSAPP_SETUP.md, "Cuando ofipapel.net nos bloquea").'
      );
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
  // "cartucho hp NÚMERO 305" — aquí "número" solo introduce la referencia, no
  // describe el producto, y de paso ensucia la búsqueda.
  'numero', 'número',
  // Verbos con los que la gente introduce lo que busca. No describen el
  // artículo y arrastran la búsqueda: comprobado en real, "Busco tóner HP 83"
  // devolvía una nevera de 83 litros y tóners 219-X, mientras que sin el
  // "busco" encuentra los tóner HP 83-A y 83-X correctos.
  'busco', 'buscaba', 'buscando', 'buscar', 'busca', 'queria', 'quería',
  'quisiera', 'querria', 'querría', 'tendrian', 'tendrían', 'tendria', 'tendría',
  'teneis', 'tenéis', 'tienes', 'dispone', 'disponen', 'venderian', 'venderían',
  // Cortesía y rodeos con los que se abre una pregunta. Cuestan caro porque la
  // búsqueda de WordPress exige que estén TODAS las palabras: comprobado en
  // real, "Buenas TARDES, SABRÍAN DECIRME si tienen soportes de móvil para
  // coche" no devolvía nada, mientras que "soportes de móvil para coche" sí
  // encuentra los seis soportes de coche que hay en el catálogo. Tres palabras
  // de educación dejaban al cliente sin respuesta.
  'buenos', 'buen', 'saludos', 'hey', 'tardes', 'dias', 'días', 'noches',
  'si', 'no', 'me', 'te', 'le', 'nos',
  'sabrian', 'sabrían', 'sabria', 'sabría', 'sabes', 'sabe', 'saber',
  'decirme', 'decir', 'indicarme', 'indicar', 'informarme', 'comentarme',
  'preguntar', 'pregunta', 'consultar', 'consulta', 'mirar', 'ver',
  'gustaria', 'gustaría', 'podria', 'podría', 'podrian', 'podrían',
  'seria', 'sería', 'posible', 'porfa', 'porfavor', 'disculpa', 'disculpe',
  'perdona', 'perdone', 'oye', 'oiga', 'mira', 'vera', 'verá',
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
// "Mochila de color NEGRO": ahí "color" solo introduce el color, no describe el
// artículo, y ensucia la búsqueda igual que hacía "número" en "cartucho hp
// número 305" — comprobado en real, con "color" dentro solo aparecía una de las
// cinco mochilas negras del catálogo. Pero "color" NO se puede meter sin más en
// las palabras vacías, porque en consumibles sí describe el producto ("cartucho
// 305 color", "tricolor"). Por eso solo se quita cuando la frase ya trae un
// color de verdad, que es cuando sobra.
const COLORES = new Set([
  'negro', 'negra', 'blanco', 'blanca', 'rojo', 'roja', 'azul', 'verde',
  'amarillo', 'amarilla', 'gris', 'rosa', 'morado', 'morada', 'naranja',
  'marron', 'fucsia', 'violeta', 'lila', 'dorado', 'dorada', 'plateado',
  'plateada', 'beige', 'celeste', 'turquesa', 'burdeos', 'salmon',
]);

function quitarColorRedundante(words) {
  if (!words.includes('color')) return words;
  if (!words.some((w) => COLORES.has(w))) return words;
  return words.filter((w) => w !== 'color');
}

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
  // Se distingue "la web no contestó" de "no hay nada con ese nombre". Antes las
  // dos cosas acababan en una lista vacía y el bot las trataba igual: le decía
  // al cliente que no encontraba el producto cuando en realidad ni había podido
  // mirarlo. Encima ensuciaba el panel de aprendizaje con términos que sí
  // existen. wcRequest ya devuelve null cuando falla, y eso es lo que se
  // propaga hacia arriba.
  return { items: Array.isArray(products) ? products : [], fallo: products === null };
}

// Además de acentos, se neutraliza TODA la puntuación (guiones, paréntesis,
// barras, puntos) convirtiéndola en espacios. En el catálogo las referencias van
// casi siempre entre paréntesis y con guion — "(83-A)", "(Nº302-XL)", "TN-3280",
// "M127FN/M127FW" — mientras el cliente escribe "83a" o "302xl". Sin esto, el
// guion impedía reconocer la referencia EXACTA y el 83-A puntuaba igual que el
// 83-X, que es la puerta por la que se coló ofrecerle un 87-A a quien pedía un
// 83.
function normalizeForMatch(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
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

// El catálogo escribe muchos tóneres con guion donde el fabricante no lo pone:
// "TN-248", "TK-5490", "DR-2510", y también "415-A" o "219-X". Comprobado en
// real: buscar "BROTHER TN-248" devuelve los seis productos y buscar "TN248" no
// devuelve nada. Como la referencia nos llega del proveedor sin guion, hay que
// pedirla también con él.
//
// Dos formas y solo dos, porque son las que usa el catálogo:
//   LETRAS+NÚMERO  -> TN248 se convierte en TN-248
//   NÚMERO+1 LETRA -> 415a se convierte en 415-a
// Las de NÚMERO+VARIAS LETRAS se quedan como están: el catálogo escribe
// "(603XL)" y "(305XL)" sin guion, y meterlo ahí solo gastaría una petición.
function guionAlfaNum(word) {
  const letrasNumero = /^([a-z]{2,4})(\d{2,5}[a-z]{0,3})$/.exec(word);
  if (letrasNumero) return `${letrasNumero[1]}-${letrasNumero[2]}`;

  const numeroLetra = /^(\d{2,4})([a-z])$/.exec(word);
  if (numeroLetra) return `${numeroLetra[1]}-${numeroLetra[2]}`;

  return null;
}

// En consumibles, la referencia útil es la MARCA + EL NÚMERO, sin la letra
// final: el mismo consumible existe como "HP (83-A)" original y "Compatible HP
// (83-A) CF283A", y buscando "83A" se pierden variantes por el guion o por la
// letra. Buscando "HP 83" salen los originales y los compatibles a la vez
// (criterio del propietario, confirmado contra el catálogo).
// Solo se aplica a referencias con forma NÚMERO+LETRAS (83a, 305xl, 603xl); no
// a tamaños tipo A4 o A3, que son LETRA+NÚMERO y quedarían reducidos a "4"/"3".
function soloNumeroDeReferencia(word) {
  const m = /^(\d+)[a-z]+$/.exec(word);
  return m ? m[1] : null;
}

// Variantes con las que se acepta que un nombre de producto "contiene" esta
// palabra, cada una con lo que vale respecto a la palabra tal cual la escribió
// el cliente. Singular/plural y la referencia partida ("603XL"/"603 XL") son
// LA MISMA cosa escrita de otra forma, así que valen igual (1). La referencia
// sin la letra ("83a" -> "83") vale MENOS: sirve para que aparezcan a la vez el
// original y el compatible, pero no debe empatar con la referencia exacta.
// Comprobado en real, y es justo el fallo más grave que se vio: al cliente que
// pedía un HP 83 se le llegó a ofrecer un 87-A como si fuera el suyo.
const VALOR_REFERENCIA_APROXIMADA = 0.75;

// Masculino/femenino de los adjetivos con los que la gente describe un artículo.
// El cliente escribe "mochila de color NEGRO" y el catálogo la tiene como
// "MOCHILA ... NEGRA": sin esto solo aparecía una de las cinco mochilas negras
// reales. NO se aplica una regla general de cambiar la -o final por -a, que
// emparejaría cosas sin ninguna relación (banco/banca, puerto/puerta): solo
// estas palabras concretas, que son las que de verdad se usan para describir
// un producto de papelería.
const GENERO_ALTERNATIVO = {
  negro: 'negra', blanco: 'blanca', rojo: 'roja', amarillo: 'amarilla',
  morado: 'morada', plateado: 'plateada', dorado: 'dorada', claro: 'clara',
  oscuro: 'oscura', pequeno: 'pequena', mediano: 'mediana', liso: 'lisa',
  cuadriculado: 'cuadriculada', rayado: 'rayada', adhesivo: 'adhesiva',
};
const GENERO_INVERSO = Object.fromEntries(
  Object.entries(GENERO_ALTERNATIVO).map(([m, f]) => [f, m])
);

function otroGenero(word) {
  return GENERO_ALTERNATIVO[word] || GENERO_INVERSO[word] || null;
}

function wordVariants(word) {
  const base = word.endsWith('s') && word.length > 3 ? [word, word.slice(0, -1)] : [word, `${word}s`];
  const variantes = base.map((v) => ({ v, valor: 1 }));
  const genero = otroGenero(word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word);
  if (genero) variantes.push({ v: genero, valor: 1 }, { v: `${genero}s`, valor: 1 });
  const separada = splitAlfaNum(word);
  if (separada !== word) variantes.push({ v: separada, valor: 1 });
  const numero = soloNumeroDeReferencia(word);
  if (numero) variantes.push({ v: numero, valor: VALOR_REFERENCIA_APROXIMADA });
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
// Una palabra con dígitos es casi siempre la referencia del producto ("305",
// "603XL", "A4", "80gr") y vale mucho más que una palabra genérica: comprobado
// en real, "cartucho de impresora hp número 305 en color negro" devolvía una
// IMPRESORA de 78€ porque "impresora" y "color" sumaban tanto como el "305" que
// de verdad identificaba el cartucho que pedía el cliente.
function pesoDePalabra(word) {
  return /\d/.test(word) ? 3 : 1;
}

function scoreWordMatch(word, normalizedName) {
  const peso = pesoDePalabra(word);
  const limite = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`);
  if (limite.test(normalizedName)) return 2 * peso;
  return normalizedName.includes(word) ? peso : 0;
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
        const mejor = Math.max(
          ...wordVariants(w).map(({ v, valor }) => scoreWordMatch(v, nombreNorm) * valor)
        );
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

// Tope de variantes de búsqueda por consulta y cuántas van en la primera
// oleada. Son el equilibrio entre encontrar el producto y no tumbar la web:
// más allá de esto, las peticiones se estorban entre ellas (ver searchProducts).
const MAX_TERMINOS_BUSQUEDA = 4;
const TERMINOS_PRIMERA_OLEADA = 2;

// Un producto que solo coincide con PARTE de lo que pidió el cliente no es un
// resultado: es ruido. Comprobado en real con "mochila negra", que devolvía una
// cafetera, un cargador inalámbrico y una carpa de 3x3 metros — los tres por la
// palabra "negra", ninguno una mochila. Con esa lista delante la IA hace lo
// prudente (no confirmar nada y mandar a la web) y el cliente se queda sin la
// única mochila negra que sí tenemos, que estaba ahí con su precio y su enlace.
//
// El criterio es relativo al MEJOR resultado de esa misma búsqueda, no un
// número fijo: si hay algo que encaja con todo lo que pidió el cliente, lo que
// encaja a medias sobra. Y si lo mejor que hay encaja a medias, se enseña
// igualmente — más vale una aproximación que nada.
const UMBRAL_RUIDO = 0.6;

function descartarRuido(scored) {
  if (scored.length === 0) return scored;
  const mejor = Math.max(...scored.map((x) => x.score));
  return scored.filter((x) => x.score >= mejor * UMBRAL_RUIDO);
}

function dedupeScored(scored) {
  const vistos = new Set();
  return scored.filter((x) => {
    if (vistos.has(x.p.id)) return false;
    vistos.add(x.p.id);
    return true;
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

// Construye, EN ORDEN DE UTILIDAD DEMOSTRADA, las variantes con las que merece
// la pena preguntarle al buscador de WordPress. El orden importa porque no se
// lanzan todas (ver MAX_TERMINOS_BUSQUEDA): las primeras son las que en las
// pruebas contra el catálogo real resolvieron por sí solas el caso.
function construirTerminos(words) {
  const frase = words.join(' ');
  const terminos = [frase];
  const añadir = (t) => {
    if (t && !terminos.includes(t)) terminos.push(t);
  };

  // Referencias tipo "TN248" -> "TN-248" (ver guionAlfaNum). Va la PRIMERA de
  // las alternativas, y por tanto en la primera oleada: cuando la referencia
  // sale del índice de consumibles nos llega sin guion, y con guion es
  // exactamente como la escribe el catálogo. Comprobado en real: "BROTHER
  // TN-248" devuelve los seis productos (originales y compatibles) y "TN248" no
  // devuelve ninguno. En una consulta normal de papelería no se añade nada,
  // porque ninguna palabra tiene esa forma.
  if (words.some((w) => guionAlfaNum(w))) {
    añadir(words.map((w) => guionAlfaNum(w) || w).join(' '));
  }

  // Cuantas más palabras lleva la frase, PEOR busca WordPress: comprobado en
  // real, "cartucho hp 305" encuentra el cartucho correcto, pero añadiendo
  // "impresora" y "color" ("cartucho de impresora hp número 305 en color
  // negro") solo devuelve impresoras — las palabras genéricas arrastran la
  // búsqueda hacia otro tipo de artículo. Por eso, cuando la frase es larga y
  // contiene una referencia (una palabra con dígitos: 305, 603XL, A4...), se
  // busca también con la versión reducida: el sustantivo principal + la
  // referencia, que es lo que de verdad identifica el producto. Va la primera
  // de las alternativas porque en frases largas la frase entera casi nunca
  // acierta.
  const referencias = words.filter((w) => /\d/.test(w));
  if (referencias.length > 0 && words.length > 3) {
    añadir([words[0], ...referencias.filter((w) => w !== words[0])].join(' '));
  }

  // Referencia sin la letra final ("83a" -> "83"), que es como se encuentran a
  // la vez el original y el compatible (ver soloNumeroDeReferencia). Solo sirve
  // acompañada de la MARCA o del tipo de artículo ("toner hp 83"), que es como
  // lo describió el propietario. Si al quitar la letra queda un número suelto
  // (el cliente escribió únicamente "603XL"), ese término no identifica nada:
  // comprobado en real, buscar "603" devuelve cables de red, pinturas y lápices
  // y desplaza a los cartuchos compatibles que sí quería el cliente.
  const sinLetra = words.map((w) => soloNumeroDeReferencia(w) || w).join(' ');
  if (sinLetra.includes(' ')) añadir(sinLetra);

  // Plural del cliente -> singular del catálogo. Es la alternativa que más
  // veces salva la búsqueda en artículos corrientes de papelería: "papeleras
  // rejilla" devuelve CERO y "papelera rejilla" devuelve las doce papeleras
  // reales; igual con "pistolas silicona".
  añadir(words.map(singularize).join(' '));

  // Masculino/femenino, por el mismo motivo que el singular: no basta con
  // tolerarlo al puntuar después, hay que PEDIRLE a WordPress la otra forma.
  // "mochila negro" no aparece en ningún título del catálogo (están como
  // "MOCHILA ... NEGRA"), así que esa búsqueda vuelve casi vacía por mucho que
  // luego sepamos que negro y negra son lo mismo.
  añadir(words.map((w) => otroGenero(w) || w).join(' '));

  // Referencias tipo "603XL" -> "603 XL" (ver splitAlfaNum): hay productos
  // catalogados de una forma y otros de la otra, así que se busca en las dos.
  añadir(words.map(splitAlfaNum).join(' '));

  // Compuestos pegados en el catálogo (SACAGRAPAS, AFILALAPICES, BORRATINTA)
  // que el cliente escribe con espacio. Solo tiene sentido con dos palabras:
  // pegar una frase larga entera ("papelerasrejillametal") no encuentra nunca
  // nada y solo gasta una petición.
  if (words.length === 2) añadir(words.join(''));

  return terminos;
}

// Puntuación que tendría un producto cuyo nombre contiene TODAS las palabras
// que escribió el cliente como palabras completas: el techo de scoreProducts.
// Sirve para saber si ya hemos encontrado lo que buscaba y podemos parar.
function scoreMaximo(words) {
  return words.reduce((acc, w) => acc + 2 * pesoDePalabra(w), 0);
}

async function buscarConTerminos(terminos, words, fetchLimit) {
  const respuestas = await Promise.all(terminos.map((t) => rawProductSearch(t, fetchLimit)));
  const fallo = respuestas.some((r) => r.fallo);
  const listas = respuestas.map((r) => r.items);
  // Se juntan del término MÁS afinado al menos afinado (o sea, al revés de como
  // se generaron): cuando dos productos empatan en puntuación, el orden final
  // lo decide quién entró antes, y ahí interesa que mande la variante concreta
  // y no la frase literal del cliente. Comprobado en real con "603XL": los
  // originales y los compatibles puntúan exactamente igual, y dejando ganar a
  // la frase literal las seis plazas se las llevaban los originales de 18-88 €,
  // dejando fuera los compatibles de 4,56 € que era lo que quería el cliente.
  return { scored: scoreProducts(dedupeById([...listas].reverse()), words), fallo };
}

async function buscarEnCatalogo(query, limit = 3) {
  const aliasAprendidos = await getAliasAprendidos();
  const words = quitarColorRedundante(applySynonyms(sanitizeWords(applyPhraseAlias(query, aliasAprendidos))));
  if (words.length === 0) return { productos: [], fallo: false };

  // La consulta ya normalizada es la clave de caché: dos clientes que preguntan
  // lo mismo con otras palabras ("¿tenéis cartulina fucsia?" / "cartulina
  // fucsia") comparten resultado.
  const cacheKey = `${words.join(' ')}|${limit}`;
  const cacheado = await store.getCachedSearch(cacheKey);
  if (cacheado) return { productos: cacheado, fallo: false };

  const fetchLimit = Math.max(limit, FETCH_LIMIT_INTERNO);
  const terminos = construirTerminos(words).slice(0, MAX_TERMINOS_BUSQUEDA);

  // Las variantes de cada oleada se lanzan EN PARALELO: hechas una tras otra
  // sumaban sus tiempos (~3,4 s cada una contra el servidor real, hasta 10 s en
  // total), lo que se acercaba peligrosamente al límite de tiempo de la
  // función. En paralelo, el total es el de la más lenta.
  //
  // Pero tampoco se lanzan TODAS a la vez: cada búsqueda de WordPress es una
  // consulta pesada, y disparar cinco o seis en paralelo (más la de ofertas y
  // la de categorías) satura ofipapel.net — comprobado en real, empezaban a
  // agotarse los tiempos de espera unas búsquedas a otras y el bot se quedaba
  // sin datos de catálogo, contestando el genérico de "pásate por la tienda"
  // aunque el producto existiera. Por eso van en dos oleadas: si la primera ya
  // encuentra el producto exacto, la segunda no llega a lanzarse.
  const primera = await buscarConTerminos(terminos.slice(0, TERMINOS_PRIMERA_OLEADA), words, fetchLimit);
  let scored = primera.scored;
  let fallo = primera.fallo;

  const resueltoDeSobra =
    scored.length >= limit && scored.some((x) => x.score >= scoreMaximo(words));
  if (!resueltoDeSobra && terminos.length > TERMINOS_PRIMERA_OLEADA) {
    const segunda = await buscarConTerminos(terminos.slice(TERMINOS_PRIMERA_OLEADA), words, fetchLimit);
    scored = dedupeScored([...scored, ...segunda.scored]);
    fallo = fallo || segunda.fallo;
  }

  // Último recurso: palabra a palabra. Solo con las dos palabras de más peso
  // (las referencias primero), no con todas — buscar cada palabra de una frase
  // larga era precisamente lo que más carga metía justo cuando el servidor ya
  // iba mal.
  if (scored.length === 0 && words.length > 1) {
    const clave = [...words].sort((a, b) => pesoDePalabra(b) - pesoDePalabra(a)).slice(0, 2);
    const ultima = await buscarConTerminos(clave, words, fetchLimit);
    scored = ultima.scored;
    fallo = fallo || ultima.fallo;
  }

  scored = descartarRuido(scored);

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

  // Solo se guarda en caché lo que salió de una búsqueda COMPLETA. Si alguna
  // consulta falló, lo que tenemos son las sobras de las que sí respondieron, y
  // cachearlas serviría ese resultado cojo a todo el mundo durante una hora.
  if (resultado.length > 0 && !fallo) {
    await store.setCachedSearch(cacheKey, resultado);
  } else if (resultado.length === 0 && !fallo) {
    // Sin resultados: se anota lo que pidió el cliente para poder revisarlo en el
    // panel y enseñarle al bot a qué corresponde. Cada fallo se convierte así en
    // una mejora, en vez de repetirse con el siguiente cliente. No se cachea el
    // vacío a propósito: en cuanto alguien defina el alias, debe funcionar ya.
    //
    // Solo se anota si la web SÍ contestó. Si no llegó a contestar no sabemos
    // si el producto existe, y apuntarlo llenaría el panel de aprendizaje de
    // términos que en realidad sí están en el catálogo.
    await store.registrarBusquedaSinResultado(words.join(' '));
  }

  return { productos: resultado, fallo };
}

// Compatibilidad: quien solo quiere los productos y no le importa por qué no
// hay ninguno (p. ej. una búsqueda de apoyo) sigue llamando a searchProducts.
async function searchProducts(query, limit = 3) {
  return (await buscarEnCatalogo(query, limit)).productos;
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
  buscarEnCatalogo,
  usarTiemposLargos,
  searchCategories,
  getOrder,
  phoneMatches,
  nombreCoincide,
  formatOrderStatus,
  isSpamOrder,
};
