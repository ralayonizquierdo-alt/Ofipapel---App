// CONTAR UN FALLO NO ES PREGUNTAR CÓMO SE HACE ALGO.
//
//   node scripts/probar-fallo-web.js
//
// Conversación real del 3/11/2026:
//
//   «Buenos días estoy intentando hacer un pedido, pero cuando meto mis datos
//    como cliente me sale todo el rato verificando»
//
// El bot le contestó la respuesta fija de siempre: «por WhatsApp no puedo
// tomarte el pedido, entra en la web, busca el producto, añádelo al carrito y
// ve a Finalizar Compra». O sea, le mandó a hacer exactamente lo que se le
// estaba rompiendo.
//
// Palabras del propietario: «comprensión CERO». Y el culpable no fue la IA:
// fue una REGLA FIJA, que saltó con «hacer un pedido» y se comió el turno
// antes de que nadie leyera el resto de la frase.
//
// Esta prueba cuida las dos mitades por igual. La segunda —lo que NO puede
// acabar en una persona— es la que importa de verdad: si esto salta de más,
// cada consulta normal termina molestando a alguien del equipo, y eso es peor
// que el fallo que arregla.
const path = require('path');
const c = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-agent-config.js'));

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

console.log('\n=== Fallos de verdad: a una persona');
for (const frase of [
  // El caso real, palabra por palabra.
  'Buenos días estoy intentando hacer un pedido, pero cuando meto mis datos como cliente me sale todo el rato verificando',
  'no puedo finalizar la compra, se queda cargando',
  'me da error al pagar',
  'la web no me deja registrarme',
  'no consigo pagar, la página se queda colgada',
  'me sale error en el formulario de registro',
  'el carrito no me deja añadir nada',
  'no hay manera de terminar el pedido en la web',
  'se me queda la pantalla en verificación y no avanza',
]) {
  ok(c.esFalloDeLaWeb(frase), frase.slice(0, 90));
}

console.log('\n=== Lo que NO puede acabar molestando a una persona');
for (const frase of [
  // Consultas de producto con un «no funciona» de por medio.
  'no me funciona la impresora, ¿qué cartucho lleva?',
  'se me ha roto la grapadora, ¿tenéis de esas?',
  // Preguntas normales sobre comprar o pagar.
  '¿puedo pagar con tarjeta?',
  '¿cómo hago un pedido por la web?',
  '¿se puede pagar en la tienda y recoger allí?',
  '¿hacéis envíos a Fuerteventura?',
  // Un pedido que no llega: tiene su propio camino, que sí funciona
  // (se busca de verdad en la web). No debe robárselo.
  'no me ha llegado el pedido 663273',
  'no me llega el pedido que hice la semana pasada',
  // Y cosas de la tienda física, que no son la web.
  'no puedo ir a la tienda esta tarde',
  '¿a qué hora abrís los sábados?',
]) {
  ok(!c.esFalloDeLaWeb(frase), `NO salta: ${frase}`);
}

console.log('\n=== El problema de cuenta sigue teniendo su propio mensaje');
// Esa rama va ANTES y es más concreta: no se la puede comer esta.
for (const frase of ['no puedo entrar en mi cuenta', 'no me llega el correo de confirmación']) {
  ok(c.esProblemaDeCuenta(frase), frase);
}

console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
