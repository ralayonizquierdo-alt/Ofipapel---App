// ¿Encuentra el bot lo que el cliente le pide?
//
//   node scripts/probar-busqueda.js
//
// Hay una batería que decide CUÁNDO se consulta el catálogo
// (probar-catalogo.js). Ésta mira lo otro, que es lo que de verdad se nota:
// consultándolo, ¿aparece el producto?
//
// Nace de un fallo real (1/10/2026). Un cliente pidió etiquetadoras de precios
// y el bot le contestó que no le aparecían modelos concretos y que llamara por
// teléfono. En el catálogo hay once, y se encuentran a la primera buscándolas
// en la web. El motivo: el cliente preguntó EN PLURAL.
//
// CÓMO BUSCA WORDPRESS, que es la clave de todo esto: exige que estén TODAS las
// palabras del término (son un Y, no un O), y las busca como trozo de palabra.
// Dos consecuencias:
//   - Sobra una palabra que no esté en el nombre del producto y la búsqueda
//     vuelve vacía. "etiquetadora precios" no encuentra nada, porque ningún
//     producto lleva "precios" en el nombre.
//   - El singular encuentra también los plurales ("cinta" encuentra "CINTAS"),
//     pero el plural NO encuentra los singulares. Y el catálogo está escrito
//     casi entero en singular.
//
// Los nombres de abajo son REALES, sacados del catálogo de ofipapel.net. Da
// igual que el día de mañana cambie alguno: lo que se prueba es la forma de
// buscar, no el inventario.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck-de-prueba';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs-de-prueba';

const CATALOGO = [
  // Etiquetadoras: el caso que lo destapó.
  'MAQUINA ETIQUETADORA NUMERADOR MX-808 Alfanumerico',
  'MAQUINA ETIQUETADORA TEXTILES (STANDAR)',
  'MAQUINA ETIQUETADORA 1-Linea 80-Caracteres METALICA PREMIUM',
  'MAQUINA ETIQUETADORA Apli 2-Linea 10-Caracteres',
  'MAQUINA ETIQUETADORA Apli 1-Linea 8-Caracteres',
  'MAQUINA ETIQUETADORA Open 1-Linea 6-Dgtos 26x12 6.26',
  'RODILLOS TINTA ETIQUETADORA Apli (1-Linea) 101418 (Pvp/2uds)',
  'CINTAS CERA RC-110 S/4 2300 450mts 110mm (Etiquetadora)',
  // Papeleras: el catálogo las tiene en singular y en plural.
  'PAPELERA CON ASA 38 LITROS BLANCA MODA TONTARELLI',
  'PAPELERA CONTENEDOR Q-Connect 58L PLASTICO c/Balancin',
  'SET 3 PAPELERAS DE RECICLAJE DE 25LITROS TONTARELLI',
  'PAPELERA MINI Endos PLASTICA C/TAPA PIVOTANTE',
  // Mochilas, para el género: el cliente dice "negro", el catálogo "GRIS"...
  'MOCHILA Urban Factory Nylee PORTATIL 16"',
  'MOCHILA Premium PORTATIL 15.6" GRIS',
  'MOCHILA PARA HERRAMIENTAS 40X30X18CM MADER',
  // Y algo de ruido, para que encontrar no sea gratis.
  'PAPEL Fotocopia A-4 80gr MATTIO (Oferta PV 500 h)',
  'BOLIGRAFO BIC Cristal Azul',
  'CALCULADORA CASIO MS-20UC Azul',
  'TONER BROTHER TN-248 Negro Original',
];

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');

// Igual que WordPress: todas las palabras del término, como trozo de palabra.
function comoWordpress(term) {
  const partes = norm(term).split(/\s+/).filter(Boolean);
  if (!partes.length) return [];
  return CATALOGO.filter((nombre) => {
    const t = norm(nombre);
    return partes.every((p) => t.includes(p));
  });
}

let pedidas = [];
global.fetch = async (url) => {
  const u = String(url);
  const m = u.match(/[?&]search=([^&]*)/);
  const term = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  const items = u.includes('/products?') && m ? comoWordpress(term) : [];
  if (m) pedidas.push(term);
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () =>
      items.map((name, i) => ({
        id: i + 1,
        name,
        price: '9.90',
        permalink: `https://ofipapel.net/producto/${i}/`,
        stock_status: 'instock',
      })),
    text: async () => '[]',
  };
};

// Sin caché y sin alias guardados: lo que se mide es la búsqueda, no lo que
// alguien le haya enseñado por el camino.
Module.prototype.require = function (p) {
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    return {
      ...m,
      isConfigured: () => false,
      getCachedSearch: async () => null,
      setCachedSearch: async () => {},
      getAliasesBusqueda: async () => ({}),
    };
  }
  return m;
};
const wc = require(path.join(RAIZ, 'netlify/functions/woocommerce-client.js'));
Module.prototype.require = orig;

// Cada caso: lo que escribe el cliente -> qué tiene que aparecer entre los
// resultados. Se comprueba que esté, no en qué puesto: ordenar bien es otra
// pelea, y lo que deja al cliente sin respuesta es que no salga nada.
const CASOS = [
  ['etiquetadora de precios', 'MAQUINA ETIQUETADORA'],
  // EL CASO REAL: el mismo, en plural. Devolvía cero.
  ['etiquetadoras de precios', 'MAQUINA ETIQUETADORA'],
  ['¿tenéis etiquetadoras?', 'MAQUINA ETIQUETADORA'],
  ['busco una etiquetadora de precios para mi tienda', 'MAQUINA ETIQUETADORA'],
  // Plurales de toda la vida, que es como habla la gente.
  ['papeleras de rejilla', 'PAPELERA'],
  ['mochilas para portátil', 'MOCHILA'],
  // Y lo que ya funcionaba, para no romperlo al arreglar lo otro.
  ['papelera contenedor', 'PAPELERA CONTENEDOR'],
  ['toner TN248', 'TN-248'],
  ['papel fotocopia A4', 'MATTIO'],
];

(async () => {
  let fallos = 0;
  for (const [consulta, esperado] of CASOS) {
    pedidas = [];
    const { productos } = await wc.buscarEnCatalogo(consulta, 6);
    const acierta = productos.some((p) => p.nombre.includes(esperado));
    if (!acierta) fallos++;
    console.log(`${acierta ? 'OK  ' : 'MAL '} ${consulta}`);
    console.log(
      `       pidió: ${pedidas.map((t) => `"${t}"`).join(' ') || '(nada)'}`
    );
    console.log(
      `       salió: ${productos.length ? productos.map((p) => p.nombre).join(' · ').slice(0, 150) : '*** NADA ***'}`
    );
  }

  console.log(
    fallos === 0
      ? '\n✔ Encuentra lo que le piden, en singular y en plural'
      : `\n✗ ${fallos} consultas se quedan sin resultados`
  );
  process.exit(fallos === 0 ? 0 : 1);
})();
