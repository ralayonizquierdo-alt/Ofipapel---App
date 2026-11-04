// «¿ES CORRECTA ESTA DIRECCIÓN?» — UNA PREGUNTA QUE EL BOT SABE CONTESTAR.
//
//   node scripts/probar-correo-correcto.js
//
// Conversación real del 4/11/2026. Fabiana escribió:
//
//   «anoche envié un email para pedir un presupuesto. Querría SOLO saber si el
//    email que he encontrado en su sitio web "pedidos@ofipapel.net" es el
//    correcto.»
//
// Y recibió la presentación entera del bot —«soy el asistente virtual, puedo
// consultarte precios, disponibilidad… We also speak English»— seguida de
// «¿quieres que te ponga en contacto con una persona?». Ni sí, ni no, ni el
// correo bueno. Ella había escrito «solo saber»: lo que menos quería era una
// persona.
//
// El motivo: la palabra «presupuesto» dispara el escalado, y ese camino NO
// contesta nada, solo ofrece una persona. Mismo fallo que el «me sale
// verificando» del 3/11 — una palabra suelta decide el turno y nadie lee la
// frase.
const path = require('path');
const c = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-agent-config.js'));

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

console.log('\n=== El caso real');
const FABIANA =
  'Hola buen dias, soy Fabiana. Les contacto porque anoche envie una email para pedir un presupuesto. ' +
  'Querria solo saber si la email que he encontrado su el sitio web "pedidos@ofipapel.net" es la email correcta.';

const visto = c.preguntaSiEsNuestroCorreo(FABIANA);
ok(Boolean(visto), 'se reconoce la pregunta');
ok(visto && visto.correo === 'pedidos@ofipapel.net', `se extrae la dirección: ${visto && visto.correo}`);
ok(visto && visto.esNuestro === false, 'se sabe que NO es una de las nuestras');

const resp = visto ? c.mensajeSobreElCorreo(visto) : '';
ok(/pedidos@ofipapelsl\.com/.test(resp), 'la respuesta le da la dirección buena');
ok(!/no existe|es incorrect|est[áa]\s+mal/i.test(resp), 'NO afirma que la suya no exista — eso no lo sabemos');
console.log(`     → «${resp.trim()}»`);

console.log('\n=== Si la dirección SÍ es nuestra, se le dice que sí');
for (const correo of ['pedidos@ofipapelsl.com', 'compras@ofipapelsl.com', 'impresion.ofipapel@gmail.com']) {
  const r = c.preguntaSiEsNuestroCorreo(`¿${correo} es el correo correcto para pediros presupuesto?`);
  ok(r && r.esNuestro === true, correo);
  if (r) ok(/^S[ií],/.test(c.mensajeSobreElCorreo(r)), `   contesta que sí: «${c.mensajeSobreElCorreo(r).trim().slice(0, 60)}…»`);
}

console.log('\n=== En inglés');
const en = c.preguntaSiEsNuestroCorreo('is orders@ofipapel.net the correct email?');
ok(Boolean(en), 'se reconoce igual');
ok(en && /pedidos@ofipapelsl\.com/.test(c.mensajeSobreElCorreo(en, 'en')), 'y da la dirección buena');

console.log('\n=== Lo que NO puede disparar esto');
for (const frase of [
  // Dar una dirección para que le escriban no es preguntar si es correcta.
  'mándame el presupuesto a juan.perez@gmail.com',
  'mi correo es fabiana@hotmail.com, gracias',
  'apuntad mi email: pedidos@suempresa.es',
  // Preguntar si algo está bien, pero sin ninguna dirección de por medio.
  '¿está correcto el pedido que hice ayer?',
  '¿es correcta la dirección de la tienda de Los Cristianos?',
  '¿el precio que me disteis sigue siendo válido?',
]) {
  ok(c.preguntaSiEsNuestroCorreo(frase) === null, `NO salta: ${frase}`);
}

console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
