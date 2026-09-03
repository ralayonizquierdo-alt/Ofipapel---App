// Enrutado de las FAQ: ¿quién contesta a cada mensaje?
//
//   node scripts/probar-faq.js
//
// Dos cosas que comprobar, y las dos han fallado con clientes reales:
//   1. Que una palabra suelta de FAQ no se coma una consulta de producto
//      ("¿tenéis el 305XL? ¿me lo mandáis a casa?" no es una pregunta de envíos).
//   2. Que una regla de contexto no se quede sin contestar por culpa de otra
//      regla que aparece pero luego se descarta a sí misma.
const { matchFaqRule } = require('../netlify/functions/whatsapp-agent-core.js');

// esperado: 'catalogo' = debe pasar de largo (contesta la IA con el catálogo),
//           'faq:<texto>' = debe contestar una regla, y llevar ese texto dentro.
const CASOS = [
  // --- Consultas de producto con una palabra de FAQ dentro ---
  ['¿Tenéis el 305XL? ¿Me lo podéis mandar a domicilio?', 'catalogo'],
  ['Quiero comprar un TN-248 ¿cómo hago el pedido?', 'catalogo'],
  ['¿A qué hora abrís? Necesito un 603XL', 'catalogo'],
  ['¿Dónde estáis? Voy a por un cartucho 604XL', 'catalogo'],
  ['En la factura del mes pasado venía un 305XL, ¿me pueden mandar otro?', 'catalogo'],
  ['¿Tenéis tinta para la XP-4200? ¿La mandáis a Santa Cruz?', 'catalogo'],
  ['Necesito el 219X para la HP LaserJet, ¿lo tenéis?', 'catalogo'],
  ['¿Cuánto cuesta el TK5490? ¿Se puede comprar en la web?', 'catalogo'],
  ['Busco el 415-A original', 'catalogo'],
  ['¿Tenéis el nº305 en tienda física?', 'catalogo'],

  // --- Preguntas de FAQ de verdad: alguien tiene que contestarlas ---
  ['¿abrís el 24 a las 9?', 'faq:horario'],
  ['¿A qué hora cerráis hoy?', 'faq:horario'],
  ['¿Dónde estáis?', 'faq:'],
  ['¿Cuánto cuestan los portes a Tenerife?', 'faq:'],
  ['¿Cómo hago un pedido?', 'faq:'],
  ['Necesito una copia de la factura de mi pedido', 'faq:pedidos@ofipapelsl.com'],
  ['¿Hacéis presupuestos de material escolar?', 'faq:presupuesto'],

  // La regla de gracias solo contesta si el mensaje es SOLO un agradecimiento;
  // con coletilla se aparta a propósito y contesta la IA.
  ['Muchas gracias, muy amables', 'catalogo'],

  // --- Caso real (3/9/2026), que se quedó sin respuesta ---
  // "muchas gracias" (14) le ganaba a "la factura" (10) y apartaba la regla de
  // facturas por ser de contexto; luego la de gracias se descartaba a sí misma
  // por no ser el mensaje solo un agradecimiento, y no quedaba nadie. El cliente
  // preguntó dónde estaba su factura y se le contestó solo sobre el pedido.
  [
    'Buenos días,\n\nMi pedido #637966 ha sido entregado.\n\n¿Dónde puedo encontrar la factura?\n\nMuchas gracias.',
    'faq:repartidor',
  ],
  // La misma trampa con otras dos reglas de contexto.
  ['¿Cuál es vuestro horario? Muchas gracias', 'faq:horario'],
  ['¿Me lo mandáis a casa? Muchas gracias de antemano', 'faq:'],

  // --- Dos preguntas en el mismo mensaje ---
  // Una regla fija contesta una cosa y se acaba, así que la otra mitad se
  // perdía en silencio. Cuando el mensaje toca dos temas se deja pasar a la IA,
  // que tiene todas estas respuestas en su prompt y sí puede contestar las dos.
  ['¿A qué hora abrís? ¿Hacéis fotocopias?', 'catalogo'],
  ['¿Dónde estáis y cuál es vuestro horario?', 'catalogo'],
  ['Necesito la factura del pedido 637966. ¿Y hacéis envíos a La Palma?', 'catalogo'],
  ['¿Cuánto cuestan los portes? ¿Y cómo hago el pedido?', 'catalogo'],
  ['¿Hacéis presupuestos para colegios? ¿A qué hora abrís?', 'catalogo'],
  ['¿Puedo devolver un producto? ¿Dónde está la tienda?', 'catalogo'],

  // --- Y que UNA sola pregunta siga contestándose con su texto fijo ---
  // "¿dónde está mi pedido?" no es la dirección de la tienda: va al flujo de
  // pedidos. Es la razón de que "donde esta" a secas no sea palabra clave.
  ['¿Dónde está mi pedido?', 'faq:número de tu pedido'],
  ['¿Dónde está la tienda?', 'faq:Chajofe'],
  ['¿Cómo hago el pedido?', 'faq:'],
  ['¿Puedo devolver un producto?', 'faq:14 días'],
];

let ok = 0;
for (const [mensaje, esperado] of CASOS) {
  const r = matchFaqRule(mensaje);
  let bien;
  if (esperado === 'catalogo') {
    bien = !r;
  } else {
    const quiere = esperado.slice(4).toLowerCase();
    bien = Boolean(r) && (!quiere || r.toLowerCase().includes(quiere));
  }
  if (bien) ok++;
  const salida = r ? r.replace(/\s+/g, ' ').slice(0, 52) : '(pasa al catálogo)';
  console.log(`${bien ? 'OK  ' : 'MAL '} ${salida.padEnd(54)} <- ${mensaje.replace(/\n+/g, ' ⏎ ').slice(0, 70)}`);
}

console.log(`\n${ok}/${CASOS.length} correctos`);
process.exit(ok === CASOS.length ? 0 : 1);
