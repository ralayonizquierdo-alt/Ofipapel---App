// TRES FALLOS EN UNA SOLA CONVERSACIÓN (6/11/2026).
//
//   node scripts/probar-carton-pluma.js
//
// Un cliente escribió:
//
//   «me gustaría comprar vuestro cartón pluma para pegar encima papel
//    fotográfico. Mi pregunta es si además del cartón pluma tienen algún spray
//    de pegamento que sea bueno y seguro para lo que voy hacer o que otro
//    pegamento me recomendarían para el cartón pluma.»
//
//   1. Al catálogo se le preguntó por la FRASE ENTERA, de 24 palabras, dos
//      veces y nada más. El «spray de pegamento» nunca llegó a buscarse, y el
//      bot contestó «lo siento, no tengo la respuesta para eso».
//   2. El enlace que se le mandó llevaba esas 24 palabras dentro
//      («?s=vuestro+carton+pluma+pegar+encima+…»): al abrirlo no salía nada, y
//      ocupaba media pantalla del móvil.
//   3. Contestó «Pásame a un agente» y se le respondió «¿Quieres que
//      igualmente te pongamos en contacto?» — un aro más para algo que acababa
//      de pedir con todas las letras.
const path = require('path');
const dir = path.join(__dirname, '..', 'netlify/functions');
const wc = require(path.join(dir, 'woocommerce-client.js'));
const cfg = require(path.join(dir, 'whatsapp-agent-config.js'));

const MENSAJE =
  'Hola, me gustaría comprar vuestro cartón pluma para pegar encima papel fotográfico. ' +
  'Mi pregunta es si además del cartón pluma tienen algún spray de pegamento que sea bueno ' +
  'y seguro para lo que voy hacer o que otro pegamento me recomendarían para el cartón pluma.';

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

console.log('\n=== 1. Se busca lo que pide, no su mensaje entero');
const enlace = wc.urlDeBusqueda(MENSAJE);
console.log(`     → ${enlace}`);
ok(/[?&]s=carton\+pluma&/.test(enlace), 'el enlace busca «carton pluma»');
ok(!/pegar\+encima|recomendarian|vuestro/.test(enlace), 'y no arrastra el mensaje entero');

console.log('\n=== 2. Un enlace corto sigue saliendo igual que antes');
for (const [texto, esperado] of [
  ['¿tenéis cartón pluma?', 'carton+pluma'],
  ['quiero folios A4', 'folios+a4'],
  ['tornillos de rosca chapa', 'tornillos+rosca+chapa'],
]) {
  ok(wc.urlDeBusqueda(texto).includes(`s=${esperado}&`), `«${texto}» → ${esperado}`);
}

console.log('\n=== 3. «Pásame a un agente» se hace, no se vuelve a preguntar');
for (const frase of [
  'Pásame a un agente',
  'pasame con alguien',
  'quiero hablar con una persona',
  '¿puedo hablar con un agente?',
  'ponme con el encargado',
  'Yes please connect me to someone',
  'I want to speak to a person',
]) {
  ok(cfg.pidioHablarConAlguien(frase), frase);
}

console.log('\n--- y lo que NO es pedir una persona:');
for (const frase of [
  'un agente comercial pasó por la tienda',
  'no quiero hablar con nadie, solo el precio',
  '¿me lo podéis mandar sin hablar con una persona?',
  'quiero hablar de precios',
  'necesito una grapadora',
]) {
  ok(!cfg.pidioHablarConAlguien(frase), `NO: ${frase}`);
}

console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
