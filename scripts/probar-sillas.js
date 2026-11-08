// SILLAS DE OFICINA Y ERGONÓMICAS: EL ENLACE, DIRECTO.
//
//   node scripts/probar-sillas.js
//
// Instrucción del propietario (3/11/2026): «cuando un cliente pide sillas
// ergonómicas o sillas de oficina yo le pasaré directamente este link», con la
// dirección exacta que se comprueba abajo. Es la búsqueda de la web ya hecha,
// con fotos y precios.
//
// Lo que más se vigila aquí es que el enlace salga SIEMPRE que se pregunte por
// sillas, se pregunte como se pregunte: el primer intento llevaba
// `familiaDeProducto` y se apartaba con un «¿vendéis sillones?» o con «para la
// espalda», de modo que el enlace casi nunca salía — justo lo contrario de lo
// pedido.
//
// Y la otra mitad: «mesilla» lleva «silla» dentro, y las palabras clave se
// buscan sin mirar fronteras de palabra.
const path = require('path');
const core = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-agent-core.js'));

const ENLACE = 'https://ofipapel.net/?s=Silla+oficina+gama+senior&post_type=product&dgwt_wcas=1';

let fallos = 0;
const respuesta = (texto) => {
  const r = core.matchFaqRule(texto);
  return String((typeof r === 'string' ? r : r && r.reply) || '');
};
const daElEnlace = (texto) => respuesta(texto).includes(ENLACE);
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

console.log('\n=== Pregunte como pregunte, sale el enlace');
for (const frase of [
  '¿tenéis sillas ergonómicas?',
  'busco una silla de oficina',
  'quiero una silla ergonomica para la espalda',
  'me interesan sillas de escritorio',
  '¿vendéis sillones de oficina?',
  'necesito sillas para la oficina nueva',
  'precio de una silla de oficina',
  'hola buenos dias, queria preguntar por sillas',
  // Con marca y modelo también, a sabiendas: el enlace lleva a todas las
  // sillas, así que la encuentra igual.
  '¿tenéis la silla Topstar Syncro?',
]) {
  ok(daElEnlace(frase), frase);
}

console.log('\n=== Y es EXACTAMENTE el enlace que fijó el propietario');
ok(respuesta('¿tenéis sillas de oficina?').includes(ENLACE), ENLACE);

console.log('\n=== Las GAMING no van en este enlace');
// Aviso del propietario (4/11/2026): «esas son sólo las sillas de oficina, las
// de gaming tienen otro enlace, ojo con eso». Estaban entre las palabras clave
// y se les mandaba el enlace de oficina: el cliente abre la página y no
// encuentra lo suyo. Hasta que llegue el enlace bueno, las contesta el
// catálogo, que busca en la web de verdad.
for (const frase of ['silla gaming', '¿tenéis sillas gaming?', 'busco una silla gamer para el PC']) {
  ok(!daElEnlace(frase), `NO sale el de oficina: ${frase}`);
}

console.log('\n=== Lo que NO es una silla');
for (const frase of [
  'necesito una mesilla de noche', // «mesilla» lleva «silla» dentro
  '¿tenéis mesillas?',
  'quiero una mesa de oficina',
  '¿a qué hora abrís?',
  'quiero hacer un pedido',
]) {
  ok(!daElEnlace(frase), `NO sale: ${frase}`);
}

// ———————————————————————————————————————————————————————————————
// PEGAMENTO EN SPRAY (8/11/2026). Mismo encargo —«le pasaré este link»— pero
// con una diferencia que importa: el spray casi nunca se pregunta solo.
//
// El caso que lo motivó pedía cartón pluma «y además» un spray de pegamento, y
// el bot contestó «no tengo la respuesta para eso». Si esta respuesta cortara
// el turno, el cliente se quedaría ahora sin la otra mitad — el fallo de las
// agendas del 2/11. Por eso esta SÍ se aparta cuando se nombra otra cosa.
const SPRAY = 'https://ofipapel.net/?s=Pegamento+spray&post_type=product&dgwt_wcas=1';
const daElSpray = (texto) => respuesta(texto).includes(SPRAY);

console.log('\n=== Pegamento en spray: el enlace');
for (const frase of [
  '¿tenéis pegamento en spray?',
  'vendéis spray de pegamento',
  'busco un spray adhesivo',
  '¿me recomendáis algún spray de pegamento?',
  'cola en spray',
]) {
  ok(daElSpray(frase), frase);
}

console.log('\n=== Pero no tapa lo demás: eso lo contesta el catálogo');
for (const frase of [
  'me gustaría comprar vuestro cartón pluma y además un spray de pegamento',
  'quiero el spray adhesivo 3M Photo Mount',
]) {
  ok(!daElSpray(frase), `NO corta el turno: ${frase}`);
}

console.log('\n=== Y no es cualquier pegamento');
for (const frase of ['¿tenéis pegamento de barra?', 'quiero cola blanca', '¿a qué hora abrís?']) {
  ok(!daElSpray(frase), `NO sale: ${frase}`);
}

console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
