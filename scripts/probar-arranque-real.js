// ¿Arranca el bot de verdad, con los módulos de verdad?
//
//   node scripts/probar-arranque-real.js
//
// POR QUÉ EXISTE ESTA BATERÍA, que es lo importante:
//
// El 10/9/2026 se añadió el idioma del cliente y el webhook empezó a llamar a
// `conversationStore.actualizarFichaCliente(...)`. Esa función existía en
// conversation-store.js, pero se quedó SIN EXPORTAR. Resultado: TypeError en
// CADA mensaje, antes de contestar. Y como el handler captura el error y
// devuelve 200, Meta lo daba por entregado y no reintentaba. El bot estuvo una
// semana muerto sin un solo aviso: ni respuesta al cliente, ni mensaje en el
// panel, ni error visible en ningún sitio.
//
// Las otras baterías (probar-faq, probar-idioma, probar-fotos, probar-consumo-*)
// pasaron todas, 48/48 incluidas. No podían verlo: TODAS sustituyen
// conversation-store por un objeto falso que sí tiene esa función. Estaban
// probando la lógica contra un doble, no contra el módulo real.
//
// Por eso esta batería NO sustituye ningún módulo nuestro. Solo corta la red
// (fetch), que es lo único que no se puede tener en local. Lo que comprueba es
// deliberadamente tonto y por eso vale: que el webhook recorra cada tipo de
// mensaje de punta a punta sin reventar, y que al cliente le salga algo.
//
// Regla para el futuro: si se añade una llamada a un módulo nuestro, esta
// batería lo dice. Si solo se añade a los tests con dobles, no lo dice nadie.
const path = require('path');
const crypto = require('crypto');
const RAIZ = path.join(__dirname, '..');

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WHATSAPP_TOKEN = 'token-de-prueba';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
process.env.ANTHROPIC_API_KEY = 'sk-de-prueba';
process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck-de-prueba';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs-de-prueba';
// Upstash configurado pero sin servidor detrás. Se hace a propósito: es el peor
// caso realista (credenciales viejas, base caída, plan cambiado) y además
// obliga a que todo el código de almacenamiento se ejecute de verdad.
process.env.UPSTASH_REDIS_REST_URL = 'https://no-existe.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-que-no-vale';

// Errores de programación: un módulo que no exporta lo que se le pide, una
// variable usada antes de existir, una propiedad de algo que es null. Son los
// que matan el turno entero, y los que el 200 de respuesta esconde.
const ERRORES_DE_CODIGO = /TypeError|ReferenceError|SyntaxError|RangeError|is not a function|is not defined|Cannot read/;

let aMeta = [];
let reventones = [];

const errorOriginal = console.error;
console.error = (...args) => {
  const texto = args.map((a) => (a && a.stack) || String(a)).join(' ');
  // Los fallos de Upstash están provocados por esta prueba y son los esperados.
  if (!texto.includes('Upstash') && ERRORES_DE_CODIGO.test(texto)) reventones.push(texto.split('\n')[0]);
};

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('upstash')) throw new Error('getaddrinfo ENOTFOUND (provocado por la prueba)');
  if (u.includes('graph.facebook.com')) aMeta.push(u);
  if (u.includes('anthropic')) {
    return { ok: true, status: 200, headers: { get: () => 'application/json' },
      json: async () => ({ content: [{ text: 'respuesta de la IA' }] }), text: async () => '{}' };
  }
  return { ok: true, status: 200, headers: { get: () => 'application/json' },
    json: async () => ([]), text: async () => '[]' };
};

const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));

const firmar = (body) => ({
  httpMethod: 'POST',
  headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex') },
  body,
});

const evento = (mensaje) => firmar(JSON.stringify({ entry: [{ changes: [{ value: {
  messages: [{ from: '34600111222', id: 'wamid.' + Math.random(), ...mensaje }],
  contacts: [{ profile: { name: 'Cliente de prueba' } }],
} }] }] }));

// Un mensaje de cada clase que sabe atender el bot: cada uno entra por una
// rama distinta del webhook, y basta con que una reviente para dejar a ese
// cliente sin respuesta.
const CASOS = [
  ['saludo', { type: 'text', text: { body: 'hola' } }],
  ['pregunta de FAQ', { type: 'text', text: { body: '¿a qué hora abrís?' } }],
  ['consulta de producto', { type: 'text', text: { body: '¿tenéis el 305XL?' } }],
  ['número de pedido', { type: 'text', text: { body: '643539' } }],
  ['pedir una persona', { type: 'text', text: { body: 'quiero hablar con una persona' } }],
  ['cliente enfadado', { type: 'text', text: { body: 'sois unos ladrones' } }],
  ['problema de cuenta', { type: 'text', text: { body: 'no puedo entrar en mi cuenta' } }],
  ['en inglés', { type: 'text', text: { body: 'i would like to know when my order arrives' } }],
  ['una foto', { type: 'image', image: { id: '999', mime_type: 'image/jpeg' } }],
  ['un audio', { type: 'audio', audio: { id: '888', mime_type: 'audio/ogg' } }],
  ['botón de escalado', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'escalate_yes', title: 'Sí' } } }],
  ['botón de sellos', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'sellos_web', title: 'Web' } } }],
];

(async () => {
  let fallos = 0;
  for (const [nombre, mensaje] of CASOS) {
    aMeta = [];
    reventones = [];
    let lanzo = null;
    try {
      await wh.handler(evento(mensaje));
    } catch (err) {
      lanzo = err;
    }

    const roto = Boolean(lanzo) || reventones.length > 0;
    // Al cliente le tiene que llegar algo. La única excepción legítima sería
    // el bot en pausa, que aquí no puede estar: Upstash no responde.
    const mudo = aMeta.length === 0;

    if (roto || mudo) fallos++;
    console.log(`  ${roto || mudo ? 'MAL ' : 'OK  '} ${nombre}`);
    if (lanzo) console.log(`        lanzó: ${lanzo.message}`);
    for (const r of reventones) console.log(`        ${r}`);
    if (mudo && !roto) console.log('        no se le mandó nada al cliente');
  }

  console.log(fallos === 0
    ? '\n✔ El bot atiende todos los tipos de mensaje sin romperse'
    : `\n✗ ${fallos} de ${CASOS.length} tipos de mensaje dejan al cliente sin respuesta`);
  console.error = errorOriginal;
  process.exit(fallos === 0 ? 0 : 1);
})();
