// CUANDO UN CLIENTE PIDE UNA PERSONA, EL AVISO TIENE QUE SALIR.
//
//   node scripts/probar-pedir-persona.js
//
// «Cuando un cliente pide hablar con una agente el bot ya no me está enviando
// mensajes a mi WhatsApp» (propietario, 20/11/2026).
//
// Al medirlo con 14 formas normales de pedirlo, OCHO no avisaban. Y no por un
// solo motivo, sino por dos distintos:
//
//   1. La petición no entraba al escalado. Para llegar había que encajar en la
//      lista de ~80 frases de la FAQ; `pidioHablarConAlguien` —que SÍ es una
//      regla general— solo se usaba un paso más abajo, para decidir si saltarse
//      los botones. «¿Me pueden pasar con un agente?» no lo cogía ninguna de
//      las dos: contestaba la IA y el equipo no se enteraba de nada.
//
//   2. Entraba, pero se quedaba en los botones. «Quiero hablar con un
//      responsable» sí encajaba en la lista, así que el bot preguntaba
//      «¿quieres que te pongamos en contacto?» — y si el cliente no pulsaba,
//      NADIE avisaba a nadie. Es el aro de más del 6/11/2026, pero con el
//      agravante de que el aviso se pierde.
//
// Por eso esta batería no comprueba si la frase encaja en una expresión: mira
// el recorrido entero del webhook y exige que SALGA EL AVISO AL DUEÑO. Las tres
// peticiones del caso 2 encajaban perfectamente y aun así no avisaban, así que
// una prueba sobre la expresión sola no habría cogido el fallo.
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const SECRETO = 's';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.OWNER_WHATSAPP_NUMBER = '34600999888';
process.env.OWNER_EMAIL = 'duenno@ofipapel.internal';
process.env.RESEND_API_KEY = 'rk-de-prueba';

let fallos = 0;
let log = [];

const orig = Module.prototype.require;
Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') {
    return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  }
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (to, m) => { log.push({ t: 'texto', to, m }); return { ok: true }; },
      sendWhatsappTemplate: async (to) => { log.push({ t: 'plantilla', to }); return { ok: true }; },
      uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './woocommerce-client') {
    return {
      ...m, isConfigured: () => true,
      buscarEnCatalogo: async () => ({ productos: [], fallo: false }),
      searchCategories: async () => [],
    };
  }
  if (p === './whatsapp-agent-core') {
    return {
      ...m,
      notifyOwner: async () => { log.push({ t: 'correo' }); },
      getHistory: async () => [], appendToHistory: async () => {}, appendCustomerMessage: async () => {},
      isBotPaused: async () => false, pauseBot: async () => { log.push({ t: 'pausa' }); },
      askClaude: async () => { log.push({ t: 'contestó la IA' }); return 'lo que diga la IA'; },
    };
  }
  if (p === './conversation-store') {
    return {
      ...m, isConfigured: () => true, claimMessage: async () => true,
      getFichaCliente: async () => ({ presentado: true }), getPausaGlobal: async () => null,
      marcarPresentado: async () => {}, listarNotasNegocio: async () => [],
      registrarPedidoVerificado: async () => {}, tomarFotosPendientes: async () => [],
      appendCustomerMessage: async () => {}, tomarTurno: async () => null, soltarTurno: async () => {},
    };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

global.fetch = async (url, opts) => {
  try {
    const b = JSON.parse(opts?.body || '{}');
    if (b.type === 'interactive') log.push({ t: 'botones', to: b.to });
  } catch { /* no es JSON */ }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
};

const ev = (contenido) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ from: '34600777222', id: `wamid.${Math.random()}`, ...contenido }],
    contacts: [{ profile: { name: 'Cliente' } }],
  } }] }] });
  return {
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}` },
    body,
  };
};

const texto = (t) => ({ type: 'text', text: { body: t } });

async function turno(contenido) {
  log = [];
  await wh.handler(ev(contenido));
  return {
    avisoWhatsapp: log.some((l) => l.to === process.env.OWNER_WHATSAPP_NUMBER),
    avisoCorreo: log.some((l) => l.t === 'correo'),
    botones: log.some((l) => l.t === 'botones'),
    habloLaIA: log.some((l) => l.t === 'contestó la IA'),
  };
}

const ok = (cond, etiqueta, extra) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}${cond || !extra ? '' : `  — ${extra}`}`);
  if (!cond) fallos += 1;
};

(async () => {
  console.log('\n=== Pida como pida una persona, el aviso sale\n');

  // Las 14 formas con las que se midió el fallo. Ocho de ellas no avisaban.
  for (const frase of [
    'quiero hablar con una persona',
    'quiero hablar con una agente',
    'me pueden pasar con un agente?',
    'puedo hablar con un agente',
    'quiero hablar con alguien',
    'pásame con una persona',
    'necesito hablar con un comercial',
    'hay alguien ahí?',
    'quiero que me atienda una persona',
    'prefiero hablar con un humano',
    'me puede atender alguien del equipo',
    'con una persona por favor',
    'quiero hablar con un responsable',
    'puedo hablar con atención al cliente',
  ]) {
    const r = await turno(texto(frase));
    ok(r.avisoWhatsapp && r.avisoCorreo, `«${frase}»`,
      `WhatsApp al dueño: ${r.avisoWhatsapp}, correo: ${r.avisoCorreo}, botones: ${r.botones}, IA: ${r.habloLaIA}`);
  }

  console.log('\n--- y en inglés, que el bot también atiende\n');
  for (const frase of ['can i talk to a person?', 'i want to speak to an agent', 'connect me with someone please']) {
    const r = await turno(texto(frase));
    ok(r.avisoWhatsapp && r.avisoCorreo, `«${frase}»`, `WhatsApp: ${r.avisoWhatsapp}, correo: ${r.avisoCorreo}`);
  }

  console.log('\n--- y al pulsar «Sí» en los botones, también\n');
  const r = await turno({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'escalate_yes', title: 'Sí' } } });
  ok(r.avisoWhatsapp && r.avisoCorreo, 'el cliente pulsa «Sí»', `WhatsApp: ${r.avisoWhatsapp}, correo: ${r.avisoCorreo}`);

  // ———————————————————————————————————————————————————————————————
  // LA OTRA MITAD, que es la que cuesta dinero: esto NO puede escalar.
  //
  // Cada escalado es un mensaje para el equipo. Si la regla se pasa de lista,
  // el bot deja de servir para lo que está puesto. Por eso la regla exige una
  // PETICIÓN, no la palabra suelta.
  console.log('\n=== Y lo que NO puede acabar en una persona\n');
  for (const frase of [
    'no quiero hablar con una persona',
    'un agente comercial pasó por la tienda ayer',
    '¿tenéis sillas para personas altas?',
    'el comercial me dijo que teníais cartulina',
    'hay alguna oferta de folios?',
    'hay algún descuento por cantidad?',
    'necesito 20 cajas de folios',
    '¿a qué hora abrís los sábados?',
  ]) {
    const r = await turno(texto(frase));
    ok(!r.avisoWhatsapp, `«${frase}»`, 'escaló una pregunta que no lo pedía');
  }

  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
