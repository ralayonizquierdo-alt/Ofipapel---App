// ¿Le contesta el bot en el idioma del cliente?
//
//   node scripts/probar-idioma.js
//
// El bot promete "We also speak English" y esa promesa la cumplía SOLO la IA:
// los 48 textos fijos iban en español pasara lo que pasara. Visto en real
// (10/9/2026): un cliente escribió "i would like to know when to expect my
// order", recibió la presentación en español, dio su número de pedido y se
// llevó "Tu pedido #643539 está pagado y en preparación".
//
// La parte difícil no es traducir: es que "643539" y "yes" NO tienen idioma.
// Si se decidiera mensaje a mensaje, la conversación volvería al español a la
// mitad — que es justo lo que pasó. Por eso el idioma se recuerda en la ficha,
// y esta prueba recorre la conversación ENTERA para comprobarlo.
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;

let enviados = [];
let ficha = {}; // la memoria del cliente, incluido su idioma

Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (to, m) => { enviados.push(m); return { ok: true }; },
      sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './whatsapp-agent-core') {
    return {
      ...m,
      notifyOwner: async () => {}, getHistory: async () => [], appendToHistory: async () => {},
      appendCustomerMessage: async () => {}, isBotPaused: async () => false, pauseBot: async () => {},
      // La IA no se prueba aquí: ya sabe cambiar de idioma. Lo que se prueba es
      // todo lo demás, que es lo que no sabía.
      // Sin palabras de ninguno de los dos idiomas: si el marcador llevara
      // "la" o "de", las marcas de más abajo lo darían por español.
      askClaude: async () => '[IA]',
    };
  }
  if (p === './conversation-store') {
    return {
      ...m, isConfigured: () => true, claimMessage: async () => true,
      getFichaCliente: async () => ({ ...ficha }),
      actualizarFichaCliente: async (f, cambios) => { ficha = { ...ficha, ...cambios }; },
      marcarPresentado: async () => { ficha.presentado = true; },
      getPausaGlobal: async () => null, guardarNombreWhatsapp: async () => {},
      registrarPedidoVerificado: async () => {},
    };
  }
  if (p === './whatsapp-catalogo') {
    return { ...m, construirContextoCatalogo: async () => ({ productContext: null, contextoConsumibles: null, impresoras: [], fallo: false }) };
  }
  if (p === './woocommerce-client') {
    return {
      ...m, isConfigured: () => true,
      // El pedido real de la conversación que destapó esto. Solo existe el
      // 643539: cualquier otro número cae en el "no lo encuentro", que es el
      // otro texto que hay que ver traducido.
      getOrder: async (id) => (String(id) === '643539'
        ? { id: 643539, status: 'processing', date_paid: '2026-09-08', date_created: '2026-09-08T10:00:00', total: '95.34', billing: {} }
        : null),
      isSpamOrder: () => false,
      phoneMatches: () => true,
    };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

global.fetch = async (url, opts) => {
  try {
    const b = JSON.parse(opts?.body || '{}');
    if (b.type === 'interactive') enviados.push(b.interactive?.body?.text);
  } catch {}
  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

const firmar = (body) => ({
  httpMethod: 'POST',
  headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex') },
  body,
});

const mensaje = (m) => firmar(JSON.stringify({ entry: [{ changes: [{ value: {
  messages: [{ from: '34659378276', id: 'wamid.' + Math.random(), ...m }],
  contacts: [{ profile: { name: 'Lyn' } }],
} }] }] }));

const ev = (texto) => mensaje({ type: 'text', text: { body: texto } });

// Pulsar uno de los botones "¿quieres hablar con una persona?". El id del botón
// es el mismo en los dos idiomas, así que aquí es donde se comprueba que el
// idioma recordado sirve para algo.
const evBoton = (id) => mensaje({
  type: 'interactive',
  interactive: { type: 'button_reply', button_reply: { id, title: id } },
});

// Marcas de que la respuesta se ha ido al idioma equivocado.
//
// La primera versión de esta lista dio "sin fallos" con una respuesta que decía
// "No encuentro ningún pedido con el número 643539" — español puro que no
// contenía ninguna de las palabras vigiladas. Por eso ahora se vigilan palabras
// FUNCIONALES (el, la, de, que, tu, no...), que aparecen en cualquier frase
// española por corta que sea, en vez de un puñado de frases concretas.
const SUENA_A_ESPANOL = /\b(el|la|los|las|un|una|de|del|que|con|por|para|tu|tus|es|está|dime|puedes|quieres|gracias|hola|pedido|número|persona|equipo|siento)\b/i;
const SUENA_A_INGLES = /\b(the|is|are|your|you|can|we|and|for|with|please|thanks|order|number|tell|would)\b/i;

async function conversacion(nombre, mensajes, esperado) {
  ficha = {};
  let fallos = 0;
  console.log(`\n=== ${nombre}`);
  for (const entrada of mensajes) {
    const esBoton = entrada.startsWith('boton:');
    enviados = [];
    await wh.handler(esBoton ? evBoton(entrada.slice(6)) : ev(entrada));
    // La presentación en español lleva a propósito una línea en inglés ("We
    // also speak English 🇬🇧") para que quien escriba en inglés sepa que puede.
    // No es una fuga de idioma: es el anuncio de que existe. Se descuenta.
    const respuesta = enviados.join(' | ').replace(/We also speak English[^\n|]*/g, '');
    const malIdioma = esperado === 'en' ? SUENA_A_ESPANOL.test(respuesta) : SUENA_A_INGLES.test(respuesta);
    if (malIdioma) fallos++;
    console.log(`  ${malIdioma ? 'MAL ' : 'OK  '} «${entrada}»`);
    console.log(`       -> ${respuesta.replace(/\s+/g, ' ')}`);
  }
  console.log(`  idioma recordado en la ficha: ${ficha.idioma || '(ninguno)'}`);
  if ((ficha.idioma || 'es') !== esperado) { fallos++; console.log(`  ✗ debería recordar "${esperado}"`); }
  return fallos;
}

(async () => {
  let fallos = 0;

  // La conversación real que destapó el fallo. Los dos mensajes del medio no
  // tienen idioma: son la trampa.
  fallos += await conversacion('Cliente inglés (caso real del 10/9/2026)', [
    'i would like to know when to expect my order.',
    '643539',
    'yes',
  ], 'en');

  fallos += await conversacion('Cliente español (no debe cambiar nada)', [
    'Hola, quería saber cuándo llega mi pedido',
    '637636',
    'sí',
  ], 'es');

  // El número que NO existe: el "no lo encuentro" es un texto fijo propio, y
  // fue el que se coló en español en la primera versión de esta prueba.
  fallos += await conversacion('Inglés con un pedido que no existe', [
    'hello, where is my order?',
    '111222',
    'boton:escalate_no',
  ], 'en');

  fallos += await conversacion('Inglés pidiendo una persona (el escalado manda)', [
    'Hello, I want to talk to a person please',
    'boton:escalate_yes',
  ], 'en');

  // No puede entrar en su cuenta: se pasa a una persona directamente, sin
  // botones. Es el caso que Roberto corrigió a mano, y su texto también era fijo.
  fallos += await conversacion('Inglés con un problema de cuenta', [
    "I can't log in and the password reset email never arrives",
  ], 'en');

  // Cliente enfadado: corta el turno antes que nada, así que el idioma tiene que
  // estar decidido ya cuando se llega ahí.
  fallos += await conversacion('Inglés enfadado', [
    'you are useless, nobody answers',
  ], 'en');

  console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
