// CONFIRMAR UN PRODUCTO QUE NO TENEMOS.
//
//   node scripts/probar-confirmaciones.js
//
// Nace de la conversación del 2/11/2026. El cliente preguntó por nota de voz
// «que si venden tornillos de rosca chapa» y el bot contestó:
//
//   «Sí, tenemos tornillos de rosca chapa. (…) ¿qué medida buscas? (diámetro y
//    largo, por ejemplo 4,2×16mm)»
//
// y le pasó un enlace de búsqueda que, al abrirlo, decía «No se encontraron
// resultados». Dos fallos en una sola frase, y ninguna red saltó:
//
//   1. El patrón de «Sí, tenemos» NUNCA ha funcionado con la tilde. En
//      JavaScript la «í» no es carácter de palabra, así que el \b de detrás no
//      casa. Solo saltaba con «Si, tenemos» sin tilde, que es justo lo que la
//      IA no escribe. Llevaba ciego desde el día que se escribió.
//
//   2. Aunque hubiera saltado, esa red SOLO se mira cuando la búsqueda vuelve
//      vacía. Aquí vino con resultados —ninguno un tornillo— y con resultados
//      en la mano cualquier confirmación se daba por buena. Tener catálogo no
//      es tener ESO.
//
// La mitad de esta prueba es lo que NO puede saltar: negar, confirmar algo que
// sí está en los resultados, y las frases de todos los días.
const path = require('path');
const c = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-agent-config.js'));

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}`);
  if (!cond) fallos++;
};

// ———————————————————————————————————————————————————————————————
console.log('\n=== La tilde: «Sí, tenemos» tiene que saltar igual que «Si, tenemos»');

// El caso real, palabra por palabra.
ok(
  c.isUnverifiedConfirmation('Sí, tenemos tornillos de rosca chapa.'),
  'Sí, tenemos tornillos de rosca chapa.   ← el fallo real del 2/11'
);
for (const frase of [
  'Si, tenemos eso',
  'Sí tenemos eso',
  'Sí, vendemos ese tipo de artículos',
  'Sí, claro que tenemos plumas estilográficas',
  'Claro, tenemos de eso',
  'Por supuesto, disponemos de ese artículo',
]) {
  ok(c.isUnverifiedConfirmation(frase), frase);
}

// Y lo que no puede saltar.
for (const frase of [
  'No, no tenemos ese artículo',
  '¿Quieres que te confirme si lo tenemos?',
  'Sí, hacemos entregas a otras islas',
  'Sí, abrimos los sábados por la mañana',
]) {
  ok(!c.isUnverifiedConfirmation(frase), `NO salta: ${frase}`);
}

// ———————————————————————————————————————————————————————————————
console.log('\n=== Afirmar que tenemos algo (sin el «sí» delante)');

for (const frase of ['Tenemos tornillos de rosca chapa', 'Vendemos ese modelo', 'Disponemos de varios']) {
  ok(c.afirmaTenerAlgo(frase), frase);
}
for (const frase of [
  'No tenemos tornillos',
  'no lo vendemos, lo siento',
  'Tenemos que pedirlo al proveedor',
  'Tenemos previsto recibirlo la semana que viene',
  '¿Tenéis tornillos?',
]) {
  ok(!c.afirmaTenerAlgo(frase), `NO salta: ${frase}`);
}

// ———————————————————————————————————————————————————————————————
console.log('\n=== Confirmar contra lo que devolvió la búsqueda');

const PREGUNTA = 'que si venden tornillos de rosca chapa';
const RESPUESTA = 'Sí, tenemos tornillos de rosca chapa. ¿Qué medida buscas?';

// Resultados reales que NO son tornillos: es lo que pasó.
const CATALOGO_DE_OTRA_COSA = `
  Canutillo espiral 16mm negro — 3,45 €
  Cinta doble cara 16mm x 10m — 2,10 €
  Grapas 24/6 caja 1000 uds — 1,25 €
`;

ok(
  c.confirmaLoQueNoHay(RESPUESTA, CATALOGO_DE_OTRA_COSA, PREGUNTA).length > 0,
  'con resultados que no son tornillos, la confirmación se descarta'
);

// Si la búsqueda vuelve vacía, con más motivo.
ok(c.confirmaLoQueNoHay(RESPUESTA, '', PREGUNTA).length > 0, 'sin resultados, se descarta');

// Y si SÍ los hay, no se toca la respuesta: es la mitad que importa, porque
// una red que se lleve por delante las respuestas buenas es peor que el fallo.
const CATALOGO_CON_TORNILLOS = 'Tornillos rosca chapa 4,2x16 caja 100 uds — 5,90 €';
ok(
  c.confirmaLoQueNoHay(RESPUESTA, CATALOGO_CON_TORNILLOS, PREGUNTA).length === 0,
  'con tornillos de verdad en los resultados, la confirmación pasa'
);

// Basta con que aparezca lo esencial: el cliente dice «rosca chapa» y la ficha
// puede no decirlo. Quien pide tornillos y recibe tornillos está servido.
ok(
  c.confirmaLoQueNoHay(RESPUESTA, 'Caja de tornillos autorroscantes 100 uds', PREGUNTA).length === 0,
  'basta con que una palabra del cliente esté en los resultados'
);

// Casos reales de todos los días que no pueden acabar escalados.
ok(
  c.confirmaLoQueNoHay(
    'Sí, tenemos cartuchos para esa impresora.',
    'Cartucho Epson 604 negro — 14,50 €\nCartucho Epson 604 color — 16,20 €',
    '¿tenéis cartuchos para la Epson XP-4200?'
  ).length === 0,
  'cartuchos que sí están: pasa'
);
ok(
  c.confirmaLoQueNoHay('Sí, tenemos folios A4.', 'Folios A-4 80gr paquete 500h — 3,94 €', 'quiero folios A4').length === 0,
  'folios que sí están: pasa'
);
// Sin nada propio que comprobar no se puede juzgar, así que no se toca.
ok(
  c.confirmaLoQueNoHay('Sí, tenemos de eso.', '', '¿tenéis de eso?').length === 0,
  'sin palabras propias del cliente, no se juzga'
);
// Una respuesta que no confirma nada tampoco entra.
ok(
  c.confirmaLoQueNoHay('No me aparece nada de eso en el catálogo.', '', 'tenéis tornillos').length === 0,
  'una respuesta que no confirma, no se toca'
);

// ———————————————————————————————————————————————————————————————
console.log('\n=== «No tengo acceso al catálogo en tiempo real» también es mentira');

ok(
  c.prometeMirarloLuego('Lo siento, no tengo acceso al catálogo en tiempo real para mostrarte opciones.'),
  'no tengo acceso al catálogo en tiempo real   ← dicho el 2/11 a las 19:58'
);
ok(
  c.prometeMirarloLuego('El precio te lo puedo ver cuando abramos y tenga acceso al catálogo completo'),
  'cuando abramos y tenga acceso al catálogo    ← el del 1/11'
);
ok(!c.prometeMirarloLuego('Puedes verlo todo en nuestra web.'), 'NO salta: una respuesta normal');

// ———————————————————————————————————————————————————————————————
console.log('\n=== El mismo fallo de la tilde, en la foto («llegó»)');

ok(c.pideLaFotoOtraVez('No me ha llegado la foto, ¿me la reenvías?'), 'no me ha llegado la foto');
ok(c.pideLaFotoOtraVez('No me llegó la foto'), 'no me llegó la foto   ← con tilde, antes no saltaba');

console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
