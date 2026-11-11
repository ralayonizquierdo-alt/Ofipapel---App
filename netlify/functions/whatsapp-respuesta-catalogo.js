// LA RESPUESTA DE PRODUCTO LA ESCRIBE EL CATÁLOGO, NO LA IA.
//
// Instrucción del propietario, 8/11/2026: «la IA no debe contestar sobre
// productos del catálogo».
//
// Y viene de lejos. Cada fallo de estas semanas ha sido la IA redactando sobre
// productos: medidas de cartón pluma que no existían (1/11), «sí, tenemos
// tornillos de rosca chapa» con el enlace vacío (2/11), «no tengo acceso al
// catálogo en tiempo real» (2/11), «lo siento, no tengo la respuesta para eso»
// con el spray sin buscar (6/11). Cada uno se tapó con una red de seguridad
// que revisa lo que la IA ya ha escrito. Son siete redes y seguían apareciendo
// formas nuevas de colarse, porque el agujero no era ninguna de ellas: era
// dejar que la conclusión la escribiera quien no tiene los datos.
//
// Aquí la conclusión sale de los datos. Lo que la web devuelve es lo que se
// dice, con su nombre, su precio y su enlace — ni una palabra más. No hay nada
// que revisar después porque no hay nada inventado que revisar.
//
// LO QUE ESTO **NO** TOCA, a propósito: saludar, el estado de un pedido, los
// horarios, los envíos, una queja, una conversación normal. Ahí la IA sigue,
// porque ahí no hay datos que inventarse. Esto manda solo cuando el cliente
// pregunta por un artículo y la web ha contestado.

// Los precios del catálogo van SIN IGIC (así los muestra la web). Decirlo en la
// misma frase es obligatorio: un precio sin ese aviso es un precio mal dado.
function precioDe(p, idioma) {
  if (!p.precio) return idioma === 'en' ? 'price on request' : 'precio a consultar';
  const base = `${p.precio}${idioma === 'en' ? ' + IGIC' : ' + IGIC'}`;
  // Un escalado por cantidad no se resume ni se inventa: solo se avisa de que
  // existe y se manda a la ficha, que es donde están los tramos de verdad.
  if (!p.ofertaPorCantidad) return base;
  return idioma === 'en'
    ? `${base} per unit (cheaper by quantity — the full scale is on the product page)`
    : `${base} por unidad (baja según la cantidad; el escalado está en la ficha)`;
}

function lineaDe(p, idioma) {
  const sinStock = p.disponible ? '' : idioma === 'en' ? ' — out of stock' : ' — sin stock';
  return `• ${p.nombre}: ${precioDe(p, idioma)}${sinStock}\n${p.url}`;
}

// Cuántos se listan. Más de esto no es una respuesta, es un catálogo pegado en
// el chat: a partir de ahí vale más el enlace de la búsqueda entera.
const MAXIMO_EN_LISTA = 5;

// ¿LO ENCONTRADO ES LO QUE PIDIÓ, O SOLO SE LE PARECE?
//
// Encontrado con el sondeo del 8/11/2026, y es la factura de quitar a la IA de
// las respuestas de producto: la IA, además de redactar, juzgaba si los
// resultados venían a cuento («si no tienen nada que ver, ignóralos por
// completo», dice el prompt). Al dejar de escribir ella, ese juicio se perdió
// y pasó esto:
//
//   cliente: «necesito una caja registradora»   (no vendemos)
//   bot:     «Esto es lo que tenemos: • SOBRE BURBUJA 270x360 (Caja 100 uds)»
//
// El buscador de la web es generoso a propósito —puntúa por parecido— así que
// con «caja» ya devuelve cosas. El fallo no es que las devuelva: es
// presentarlas como si fueran lo que el cliente pidió.
//
// No hace falta acertar con el juicio, que es difícil y se equivocaría: basta
// con no afirmar más de lo que se sabe. Si lo encontrado cuadra, «esto es lo
// que tenemos»; si solo se le parece, «no encuentro exactamente eso, esto es
// lo más parecido». En los dos casos ve los productos de verdad, con su precio
// y su enlace, y decide él — que es lo que pide el propietario: enseñarle lo
// que hay, no adivinar.
//
// Se mide por cuántas de sus palabras aparecen en el nombre del producto:
//   «cartucho 603xl negro» → CARTUCHO EPSON 603XL Negro        3 de 3 → cuadra
//   «papel a4»             → PAPEL Fotocopia A-4 80gr          2 de 2 → cuadra
//   «papel a4»             → PAPEL Fotocopia A-3 80gr          1 de 2 → parecido
//   «plastificadora a3»    → PLASTIFICADORA FELLOWES Halo A-4  1 de 2 → parecido
//   «caja registradora»    → SOBRE BURBUJA (Caja 100 uds)      1 de 2 → parecido
const CUADRA_DESDE = 0.6;

// Muletillas con las que se pide algo. No dicen nada del artículo, así que no
// cuentan para la cuenta («¿cuánto vale el papel A4?» son dos palabras:
// «papel» y «a4»). La lista de `sanitizeWords` quita las de siempre («el»,
// «de»); estas son las de preguntar, que allí sí hacen falta para buscar.
const AL_PEDIR = new Set([
  'cuanto', 'cuanta', 'cuantos', 'cuantas', 'vale', 'valen', 'cuesta', 'cuestan',
  'precio', 'precios', 'teneis', 'tienen', 'tiene', 'tenes', 'hay', 'vendeis', 'venden',
  'vende', 'quiero', 'quisiera', 'queria', 'necesito', 'necesitaba', 'necesitamos',
  'busco', 'buscando', 'interesa', 'interesan', 'dame', 'ponme', 'mandame', 'manda',
  'por', 'favor', 'para', 'con', 'sin', 'una', 'uno', 'unos', 'unas', 'algun', 'alguna',
  'mas', 'menos', 'tambien', 'hola', 'buenas', 'gracias', 'disponible', 'disponibles',
  'stock', 'me', 'mi', 'tu', 'su', 'eso', 'esto', 'que', 'si', 'no',
]);

const sinSignos = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

// Cuántas de las palabras del cliente aparecen en el nombre, de 0 a 1. Se
// comparan sin acentos ni guiones («a4» = «A-4») y aguantando el plural
// («boligrafos» = «BOLIGRAFO», «azules» = «Azul»).
function cuantoCuadra(nombre, palabras) {
  if (!palabras.length) return 1;
  const enElNombre = sinSignos(nombre);
  const aciertos = palabras.filter((p) => {
    const limpia = sinSignos(p);
    if (!limpia) return false;
    if (enElNombre.includes(limpia)) return true;
    // Plural: se prueba sin la «s» o sin «es», solo si queda algo con cuerpo.
    const singular = limpia.replace(/(?:es|s)$/, '');
    return singular.length >= 4 && enElNombre.includes(singular);
  }).length;
  return aciertos / palabras.length;
}

function palabrasDeLaConsulta(consulta) {
  if (!consulta) return [];
  try {
    const { sanitizeWords } = require('./woocommerce-client');
    return sanitizeWords(consulta).filter((p) => !AL_PEDIR.has(p));
  } catch {
    // Sin la lista de muletillas se mide con todo: como mucho dirá «parecido»
    // alguna vez de más, que es el lado seguro.
    return String(consulta).toLowerCase().split(/\s+/).filter((p) => p.length > 2 && !AL_PEDIR.has(p));
  }
}

// TENER RESULTADOS NO ES TENER EL RESULTADO.
//
// Visto en real el 10/11/2026, y es el fallo que más caro sale de todos los de
// esta semana porque el bot se contradice a sí mismo delante del cliente:
//
//   cliente: [foto de la etiqueta de su tóner, leída perfecta: TN-243/247]
//   bot:     «veo que buscas tóner láser compatible Brother TN-247.
//             TENEMOS ESE MODELO EN STOCK.»
//   cliente: «Láser»
//   bot:     «No me aparece en nuestro catálogo, así que no te lo puedo
//             confirmar yo.»
//
// Las redes que vigilan esto (`isUnverifiedStockClaim`, `isUnverifiedConfirmation`)
// solo miran si el catálogo devolvió ALGO —«!productContext»—. Y devolvió algo:
// otros tóneres, porque la referencia buena no se llegaba a buscar (ver
// `referenciasLiterales` en woocommerce-client.js). Con esos delante, la IA
// afirmó tener «ese modelo», que no estaba en la lista.
//
// Es el mismo razonamiento que ya se aplicó aquí arriba con `cuantoCuadra`,
// visto desde la referencia: si el cliente nombra una referencia concreta y
// NINGUNA de las que nombra aparece en lo que devolvió la web, no hay nada que
// respalde un «sí, lo tenemos».
//
// Solo opina cuando hay una referencia de verdad —tres dígitos seguidos, con
// letras pegadas o con separador: TN-247, 305XL, TN248—. Un «a4», un «80gr» o
// un «c5» no bastan: son medidas, salen en media papelería y harían saltar la
// red con respuestas correctas. Y basta con que coincida UNA: la etiqueta de la
// foto traía también «Cod.101012010», que es nuestro código interno y no sale
// en ningún nombre de la web.
const REF_FUERTE = /\b(?:[a-z]{1,5}[-/]?\d{3,6}(?:[-/]\d{1,5})*[a-z]{0,3}|\d{3,6}[a-z]{1,3})\b/g;

const aplanar = (t) => String(t || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]/g, '');

function referenciasFuertes(consulta) {
  const texto = String(consulta || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const fuera = [];
  for (const bruto of texto.match(REF_FUERTE) || []) {
    fuera.push(bruto);
    // «TN-243/247» y «TN-247BK» son la misma referencia escrita de dos formas:
    // vale que el catálogo tenga cualquiera de las dos.
    const m = /^([a-z]{1,5})[-/]?([\d/-]*\d)([a-z]{0,3})$/.exec(bruto);
    if (!m) continue;
    const partes = m[2].split(/[-/]/).filter(Boolean);
    if (partes.length > 1 || m[3]) for (const n of partes) fuera.push(`${m[1]}${n}`);
  }
  return [...new Set(fuera.map(aplanar))].filter(Boolean);
}

// true = el cliente pide una referencia concreta y no hay ni rastro de ella en
// lo que devolvió la web. Quien llama NO manda entonces una confirmación ni un
// «en stock» de la IA. false = o no nombra ninguna referencia (esta red no
// opina), o alguna está respaldada.
function referenciaSinRespaldo(consulta, datos) {
  const refs = referenciasFuertes(consulta);
  if (refs.length === 0) return false;
  const texto = aplanar(datos);
  if (!texto) return true;
  return !refs.some((r) => texto.includes(r));
}

// Construye la respuesta a partir de lo que devolvió la web, o null si no hay
// nada que decir (y entonces el webhook sigue por donde iba).
//
// `consulta` es lo que escribió el cliente: se usa solo para encabezar la
// lista, nunca para deducir nada.
function respuestaDeCatalogo(productos, { idioma = 'es', enlaceBusqueda = null, consulta = '' } = {}) {
  if (!Array.isArray(productos) || productos.length === 0) return null;

  // Lo que más cuadra, primero: el buscador ya ordena por parecido, pero con
  // las palabras del cliente delante se afina (ver cuantoCuadra).
  const palabras = palabrasDeLaConsulta(consulta);

  // SIN NINGUNA PALABRA DE PRODUCTO, AQUÍ NO HAY NADA QUE CONTESTAR.
  //
  // «Si existen, ¿cuánto cuestan?» se queda sin una sola palabra con
  // contenido: son todas muletillas. Antes eso contaba como «cuadra perfecto»
  // (cero de cero) y se le colocaba el primer resultado de la búsqueda —
  // justo el fallo del 10/11/2026. Un mensaje así es una pregunta de
  // seguimiento: la contesta la IA, que tiene el hilo.
  if (consulta && palabras.length === 0) return null;
  const puntuados = productos
    .map((p) => ({ p, cuadre: cuantoCuadra(p.nombre, palabras) }))
    .sort((a, b) => b.cuadre - a.cuadre);
  const ordenados = puntuados.map((x) => x.p);

  // SI NO CUADRA, AQUÍ NO SE CONTESTA (10/11/2026, dos casos reales).
  //
  // El primer intento sí contestaba, encabezando con «no encuentro
  // exactamente X, esto es lo más parecido». Dos conversaciones de verdad
  // enseñaron que eso está mal de dos maneras a la vez:
  //
  //   cliente: «¿tienes láminas de sublimación para tazas?»
  //   bot:     (bien) no me aparece, pregunta al equipo
  //   cliente: «Si existen, ¿cuánto cuestan?»
  //   bot:     «No encuentro exactamente "Si existen, ¿cuánto cuestan?".
  //             Esto es lo más parecido: PACK 3 LÁMINAS MAGNÉTICAS PARA
  //             SMARTPHONES»
  //
  // 1. La pregunta de seguimiento NO es el nombre de un producto, y aquí se
  //    trataba como si lo fuera — repitiéndosela al cliente, y cortada a
  //    mitad de palabra cuando era larga («…qué precio tien»).
  // 2. «Lo más parecido» salía aunque no se pareciera en NADA: unas láminas
  //    magnéticas para móviles no son láminas de sublimación.
  // 3. Y lo de fondo: ese «¿cuánto cuestan?» hablaba de las láminas del
  //    mensaje anterior. Al componer la respuesta aquí se saltaba a la IA,
  //    que es quien tiene el historial de la conversación.
  //
  // Así que esto contesta SOLO cuando lo encontrado cuadra de verdad. Si no,
  // devuelve null y sigue el turno por donde iba: la IA, con el catálogo en
  // el prompt, el hilo de la conversación y todas las redes de seguridad.
  // Buscar de menos aquí no pierde nada; contestar de más deja al cliente con
  // un producto que no tiene nada que ver.
  if ((puntuados[0]?.cuadre ?? 1) < CUADRA_DESDE) return null;

  // EL STOCK SE AVISA, NO ESCONDE.
  //
  // El primer intento dejaba fuera lo que no tenía stock, y con ello se perdían
  // productos que el cliente había pedido: preguntó por «bolígrafos o plumas
  // estilográficas» y solo veía el bolígrafo. Se respeta el orden que trae la
  // búsqueda, que es el de relevancia, y cada línea dice si hay o no hay.
  const lista = ordenados.slice(0, MAXIMO_EN_LISTA);

  // UNO SOLO: se confirma con su nombre, su precio y su enlace.
  if (lista.length === 1) {
    const p = lista[0];
    const cabecera = idioma === 'en' ? 'This is what we have:' : 'Esto es lo que tenemos:';
    const aviso = p.disponible
      ? ''
      : idioma === 'en'
        ? '\n\nIt shows as out of stock right now — for availability, write to compras@ofipapelsl.com or call 922 753 520.'
        : '\n\nAhora mismo figura sin stock. Para disponibilidad o reposición, escribe a compras@ofipapelsl.com o llama al 922 753 520.';
    return `${cabecera}\n\n${lineaDe(p, idioma)}${aviso}`;
  }

  // VARIOS: se enseñan tal cual, con su precio y su enlace, y se le deja elegir
  // a él. Preguntarle «¿qué tamaño quieres?» antes de enseñarle nada es lo que
  // hacía la IA, y por el camino se inventaba los tamaños.
  const cabecera =
    idioma === 'en' ? 'This is what we have, with prices:' : 'Esto es lo que tenemos, con sus precios:';
  const cierre = enlaceBusqueda
    ? idioma === 'en'
      ? `\n\nAll of them here: ${enlaceBusqueda}`
      : `\n\nAquí están todos: ${enlaceBusqueda}`
    : '';
  const hayMas =
    productos.length > lista.length
      ? idioma === 'en'
        ? `\n\n(${productos.length - lista.length} more in that link.)`
        : `\n\n(Hay ${productos.length - lista.length} más en ese enlace.)`
      : '';
  return `${cabecera}\n\n${lista.map((p) => lineaDe(p, idioma)).join('\n\n')}${hayMas}${cierre}`;
}

// CUÁNDO MANDA EL CATÁLOGO Y CUÁNDO NO.
//
// Que el mensaje nombre un producto no quiere decir que esté preguntando el
// precio. «El papel que me mandasteis viene roto» nombra papel, y el buscador
// devuelve papel — pero contestar con una lista de precios a quien se está
// quejando es peor que cualquier alucinación. Una queja con las palabras de
// siempre («quiero una queja», «pásame con alguien») ya la coge la regla de
// escalado antes de llegar aquí; la que no las lleva se reconoce por lo que
// cuenta: algo que ya pasó con mercancía que ya tiene.
//
// Cuando se reconoce, esto NO contesta y el turno sigue por donde iba: la IA,
// con el contexto del catálogo y con las redes de seguridad de siempre. No se
// pierde nada, solo se deja de imponer la respuesta de producto.
const ES_UNA_INCIDENCIA = [
  // Mercancía que llegó mal
  /\brot[oa]s?\b/, /\bda[nñ]ad/, /\bdeteriorad/, /\bdefectuos/, /\bmojad[oa]s?\b/, /\bgolpead/,
  /\bvino mal\b/, /\bviene mal\b/, /\bvinieron mal\b/, /\best[aá] mal\b/, /\best[aá]n mal\b/,
  /\bequivocad/, /\bno es lo que\b/, /\bno era lo que\b/,
  // Mercancía que no llegó
  /\bno (?:me )?(?:ha|han) llegado\b/, /\bno (?:me )?lleg[oó]\b/, /\bsin llegar\b/,
  /\bno (?:lo |la |los |las )?he recibido\b/, /\bno recib[ií]\b/,
  // Lo que quiere hacer con ello
  /\bdevolver\b/, /\bdevoluci[oó]n\b/, /\breembolso\b/, /\babono\b/, /\bcambiarl[oa]\b/,
  // Un pedido concreto del que se habla en pasado
  /\b(?:me )?(?:mandasteis|enviasteis|mandaron|enviaron)\b/,
  /\bel pedido que\b/, /\bmi [uú]ltimo pedido\b/,
];

function pareceUnaIncidencia(texto) {
  const t = sinAcentosNi(texto);
  return ES_UNA_INCIDENCIA.some((re) => re.test(t));
}

function sinAcentosNi(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Cuando se ha buscado de verdad y la web no tiene nada. No se dice «no lo
// tenemos» —puede estar en la tienda y no en la web— sino lo único que consta.
function nadaEnElCatalogo(idioma = 'es', enlaceBusqueda = null) {
  const base =
    idioma === 'en'
      ? "I can't find that in our online catalogue."
      : 'No encuentro eso en nuestro catálogo de la web.';
  const enlace = enlaceBusqueda
    ? idioma === 'en'
      ? ` You can check here: ${enlaceBusqueda}`
      : ` Puedes mirarlo aquí: ${enlaceBusqueda}`
    : '';
  return `${base}${enlace} `;
}

module.exports = {
  respuestaDeCatalogo,
  referenciaSinRespaldo,
  referenciasFuertes,
  nadaEnElCatalogo,
  pareceUnaIncidencia,
  MAXIMO_EN_LISTA,
};
