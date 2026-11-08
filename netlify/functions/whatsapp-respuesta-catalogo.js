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

// Construye la respuesta a partir de lo que devolvió la web, o null si no hay
// nada que decir (y entonces el webhook sigue por donde iba).
//
// `consulta` es lo que escribió el cliente: se usa solo para encabezar la
// lista, nunca para deducir nada.
function respuestaDeCatalogo(productos, { idioma = 'es', enlaceBusqueda = null } = {}) {
  if (!Array.isArray(productos) || productos.length === 0) return null;

  // EL STOCK SE AVISA, NO ESCONDE.
  //
  // El primer intento dejaba fuera lo que no tenía stock, y con ello se perdían
  // productos que el cliente había pedido: preguntó por «bolígrafos o plumas
  // estilográficas» y solo veía el bolígrafo. Se respeta el orden que trae la
  // búsqueda, que es el de relevancia, y cada línea dice si hay o no hay.
  const lista = productos.slice(0, MAXIMO_EN_LISTA);

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
  nadaEnElCatalogo,
  pareceUnaIncidencia,
  MAXIMO_EN_LISTA,
};
