// LA TRADUCCIÓN DE GEMINISWIN A LOS SIETE ESTADOS DEL BOT.
//
// Es la pieza delicada de todo el publicador: lo que salga de aquí se le dice
// a un cliente por WhatsApp. Un estado mal traducido no da un error, da una
// mentira educada — «lo recibirás el siguiente día laborable» sobre un pedido
// que se entregó hace una semana, o al revés.
//
// DOS NORMAS, Y LAS DOS SON DEL PROPIETARIO:
//
// 1. «Liquidado» en GeminisWin significa COBRADO (el repartidor ha pagado la
//    factura en administración), NO facturado. Es la trampa evidente y por eso
//    está escrita aquí arriba.
//
// 2. Los nombres de GeminisWin no salen nunca del publicador. El bot solo
//    entiende los siete de abajo.
//
// LO QUE NO SE SABE, NO SE INVENTA. El vocabulario real de los listados de
// GeminisWin no lo conocemos todavía (no tiene API: se mira con computer use en
// rober-pc). Así que aquí solo están traducidas las palabras que SIGNIFICAN
// LITERALMENTE LO MISMO que nuestro estado — «facturado» es facturado,
// «anulado» es anulado — y cualquier otra se queda SIN TRADUCIR a propósito.
//
// Una palabra sin traducir no se publica: ese pedido no entra en la tabla, el
// bot no lo encuentra y contesta con WooCommerce, que es exactamente lo que
// hace hoy. No se pierde nada y no se miente. Y al terminar, el publicador
// imprime la lista de palabras que se encontró y no supo traducir, con cuántos
// pedidos lleva cada una, para añadirlas aquí de una sentada la primera vez que
// corra contra un listado de verdad.

// Los siete que entiende el bot (netlify/functions/gestion-pedidos.js).
const ESTADOS_DEL_BOT = [
  'recibido',
  'facturado',
  'en_reparto',
  'entregado',
  'no_entregado',
  'incidencia',
  'anulado',
];

// Para comparar «Facturado», «FACTURADO» y «facturado " "» como la misma cosa.
function normalizar(palabra) {
  return String(palabra == null ? '' : palabra)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// LA TABLA. Clave: la palabra de GeminisWin, normalizada. Valor: el estado del
// bot.
//
// Para añadir una línea hace falta saber qué significa de verdad en GeminisWin,
// no qué parece que significa. Ante la duda, no se añade: se queda fuera y el
// bot contesta con WooCommerce.
const TRADUCCION = new Map(Object.entries({
  // Palabras que son literalmente nuestro estado. Sin riesgo.
  facturado: 'facturado',
  entregado: 'entregado',
  anulado: 'anulado',
  cancelado: 'anulado',
  'no entregado': 'no_entregado',
  incidencia: 'incidencia',
  'en reparto': 'en_reparto',

  // PENDIENTES DE CONFIRMAR CONTRA UN LISTADO REAL — se dejan fuera a
  // propósito hasta saber qué palabras usa GeminisWin de verdad:
  //
  //   «liquidado»  = COBRADO. Que esté cobrado implica que se entregó, así que
  //                  probablemente sea 'entregado' — pero «probablemente» no
  //                  basta para decírselo a un cliente. Lo decide el
  //                  propietario, no yo.
  //   «servido», «pdte. servir», «preparado», «albarán»… — no sabemos si un
  //                  albarán es una factura aquí, ni si «servido» es entregado
  //                  o solo cargado en la furgoneta. Son estados distintos para
  //                  el cliente, así que se preguntan.
}));

// Traduce una palabra de GeminisWin. Devuelve null si no la conocemos.
function traducir(palabraGeminis) {
  const clave = normalizar(palabraGeminis);
  if (!clave) return null;
  return TRADUCCION.get(clave) || null;
}

function esEstadoDelBot(estado) {
  return ESTADOS_DEL_BOT.includes(estado);
}

module.exports = { ESTADOS_DEL_BOT, TRADUCCION, normalizar, traducir, esEstadoDelBot };
