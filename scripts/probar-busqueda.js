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
  // El tóner del caso real del 10/11/2026 (ver más abajo).
  'TONER LASER Compatible Brother TN-243/247 (Negro)',
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

  // TODA REFERENCIA, CON GUION Y SIN GUION. SIEMPRE (11/11/2026).
  //
  // Regla del propietario, después de tres años de parches: «no le vas a tener
  // que poner todos los modelos de tóner que trabajamos... la regla es que
  // cualquier modelo lo pruebe con guión y sin guión. No vamos a tener que
  // meterle los miles de modelos, porque si no hoy fallará uno, mañana otro».
  //
  // Por eso esto NO comprueba modelos: comprueba la regla. Varios de los de
  // abajo están inventados a propósito y no existen en ninguna lista de este
  // repo — si la regla es de verdad una regla, también valen.
  //
  // Y se mira QUÉ SE LE PIDE A LA WEB, no qué sale: lo que estaba roto es que
  // la referencia bien escrita no llegaba a pedirse nunca, y eso no se ve en
  // los resultados de una simulación.
  console.log('\n=== Con guion y sin guion, venga como venga\n');

  const CON_Y_SIN_GUION = [
    // La referencia del caso real, en las dos formas de escribirla.
    ['TN-247 brother', ['tn-247', 'tn247']],
    ['tn247 brother', ['tn247', 'tn-247']],
    // Modelos de verdad de otras marcas.
    ['toner TK-3190', ['tk-3190', 'tk3190']],
    ['cartucho CF283A', ['cf283a', 'cf-283']],
    ['tambor DR-2400', ['dr-2400', 'dr2400']],
    ['cartucho 305XL', ['305xl', '305-xl']],
    // INVENTADOS: no están en ninguna lista y tienen que funcionar igual.
    ['toner ZQ-9971', ['zq-9971', 'zq9971']],
    ['zq9971 negro', ['zq9971', 'zq-9971']],
    ['referencia XY4812B', ['xy4812b', 'xy-4812']],
    // Doble: el mismo tóner vale para dos modelos y el catálogo puede tener
    // escrito solo uno, así que se prueban los dos por separado.
    ['toner TN-243/247', ['tn-243/247', 'tn-243', 'tn-247']],
    // Con la cola del color.
    ['TN-247BK', ['tn-247bk', 'tn-247']],
  ];

  for (const [consulta, esperados] of CON_Y_SIN_GUION) {
    pedidas = [];
    await wc.buscarEnCatalogo(consulta, 6);
    const faltan = esperados.filter((e) => !pedidas.includes(e));
    if (faltan.length) fallos++;
    console.log(`${faltan.length ? 'MAL ' : 'OK  '} ${consulta}`);
    console.log(`       pidió: ${pedidas.map((t) => `"${t}"`).join(' ') || '(nada)'}`);
    if (faltan.length) console.log(`       NO pidió: ${faltan.join(' ')}`);
  }

  // LO QUE NO PUEDE PASAR: que esto se dispare con cualquier cosa. Una medida,
  // una fecha o nuestro código interno NO son referencias, y gastar en ellas
  // las pocas consultas que hay se las quita a la que sí lo es (pasó: la
  // etiqueta del tóner traía «Cod.101012010» y se comía las plazas).
  console.log('\n=== Y lo que NO es una referencia\n');

  const NO_SON_REFERENCIAS = [
    'papel a4 80gr 500 hojas',
    'sobres 162x229 blancos',
    'entregamos hasta 2026 en toda Canarias',
    'me mandas 2 cajas de 500 folios',
    'papeleras de rejilla',
  ];

  for (const consulta of NO_SON_REFERENCIAS) {
    pedidas = [];
    await wc.buscarEnCatalogo(consulta, 6);
    // Una variante inventada es la que va pegada o con guion y no estaba en el
    // mensaje: «80-gr», «162-x», «2026-...».
    const inventadas = pedidas.filter(
      (t) => !t.includes(' ') && /^[a-z]{1,5}-?\d/.test(t) && !consulta.toLowerCase().includes(t)
    );
    if (inventadas.length) {
      fallos++;
      console.log(`MAL  ${consulta}\n       se inventó: ${inventadas.join(' ')}`);
    } else {
      console.log(`OK   ${consulta}`);
    }
  }

  // Y la etiqueta entera del caso real: la referencia tiene que ir DELANTE del
  // código interno, que no existe en la web.
  pedidas = [];
  await wc.buscarEnCatalogo(
    'Cod.101012010, TONER LASER Compatible, Brother TN-243/247 (Negro), TN-247BK Compatible, 04090-91439-27102025',
    6
  );
  const trajoLaBuena = pedidas.includes('tn-243/247') || pedidas.includes('tn-247');
  if (!trajoLaBuena) fallos++;
  console.log(
    `${trajoLaBuena ? 'OK  ' : 'MAL '} la etiqueta del tóner, entera\n       pidió: ${pedidas
      .map((t) => `"${t}"`)
      .join(' ')}`
  );

  console.log(
    fallos === 0
      ? '\n✔ Encuentra lo que le piden, en singular y en plural'
      : `\n✗ ${fallos} consultas se quedan sin resultados`
  );
  process.exit(fallos === 0 ? 0 : 1);
})();
