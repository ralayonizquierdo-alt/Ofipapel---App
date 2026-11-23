// LA CONVERSACIÓN DE LOS 19 ARMARIOS Y LAS 14 MESAS (23/11/2026).
//
//   node scripts/probar-vender-y-confirmar.js
//
// Conversación real, pasada por el propietario. Un cliente escribe a las 14:37
// —fuera de horario— y pasa esto, en este orden:
//
//   1. «No se si ustedes compran mobiliario de oficina de segunda mano»
//      → el bot lo BUSCA EN EL CATÁLOGO: «no me aparece en nuestro catálogo».
//        Él no quería comprar un armario: quería vendernos diecinueve.
//   2. «Si porfa» (a «¿quieres que igualmente te pongamos en contacto?»)
//      → NO AVISÓ A NADIE. El aviso al equipo solo salía desde el botón, así
//        que la respuesta escrita se perdió, la IA redactó «te paso con un
//        agente en cuanto abramos» —texto que no está en el código— y el bot
//        NO SE PARÓ: siguió contestando él solo doce mensajes más.
//   3. «Las sillas que se ven en las imágenes no van»
//      → le contestó con el enlace de nuestras sillas de oficina y sus precios.
//        Estaba excluyéndolas del lote.
//   4. Nueve fotos, todas como `document` (WhatsApp hace eso cuando se
//      adjuntan desde el explorador o «sin comprimir»)
//      → nueve veces el mismo párrafo: «no puedo leer un documento por aquí».
//        Eran JPEG, y los JPEG se leen desde el 19/10.
//
// El fallo 2 es la llave de todos: con el escalado confirmado, `pauseBot(24)`
// habría callado al bot y los fallos 3 y 4 no habrían llegado a pasar. Por eso
// esta batería no comprueba frases: recorre el webhook entero y exige el
// EFECTO —que salga el aviso, que el bot se calle, que la foto se lea—.
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
let historial = [];
let pausado = false;
let lecturasPedidas = 0;

// Un JPEG de verdad (cabecera mínima), para que `sePuedeLeer` lo acepte.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

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
  if (p === './whatsapp-media') {
    return {
      ...orig.apply(this, arguments),
      // Lo que devuelve Meta para una foto adjuntada como fichero: el tipo real
      // es image/jpeg aunque el mensaje venga como `document`.
      guardarAdjuntoDeCliente: async () => ({
        mediaId: 'media-1', tipo: 'image/jpeg', bytes: JPEG.length, buffer: JPEG,
      }),
    };
  }
  if (p === './whatsapp-vision') {
    const m = orig.apply(this, arguments);
    return {
      ...m,
      leerFoto: async () => {
        lecturasPedidas += 1;
        return { seVe: 'armarios de madera con puertas, interior de oficina', texto: '', buscar: false };
      },
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
      getHistory: async () => historial,
      appendToHistory: async (from, user, bot) => {
        historial.push({ role: 'user', content: user });
        historial.push({ role: 'assistant', content: bot });
      },
      appendCustomerMessage: async (from, c) => { historial.push({ role: 'user', content: c }); },
      isBotPaused: async () => pausado,
      pauseBot: async () => { pausado = true; log.push({ t: 'pausa' }); },
      askClaude: async () => { log.push({ t: 'contestó la IA' }); return 'lo que diga la IA'; },
    };
  }
  if (p === './conversation-store') {
    return {
      ...m, isConfigured: () => true, claimMessage: async () => true,
      getFichaCliente: async () => ({ presentado: true }), getPausaGlobal: async () => null,
      marcarPresentado: async () => {}, listarNotasNegocio: async () => [],
      registrarPedidoVerificado: async () => {}, tomarFotosPendientes: async () => [],
      guardarFotoPendiente: async () => false,
      appendCustomerMessage: async (from, c) => { historial.push({ role: 'user', content: c }); },
      tomarTurno: async () => null, soltarTurno: async () => {},
    };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
const { escalateQuestion, respuestaALaPregunta, esPreguntaDeEscalado } = require(
  path.join(RAIZ, 'netlify/functions/whatsapp-escalado.js')
);
const { nosQuiereVenderAlgo } = require(path.join(RAIZ, 'netlify/functions/whatsapp-respuesta-catalogo.js'));
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
    messages: [{ from: '34645509956', id: `wamid.${Math.random()}`, ...contenido }],
    contacts: [{ profile: { name: 'Cliente' } }],
  } }] }] });
  return {
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}` },
    body,
  };
};

const texto = (t) => ({ type: 'text', text: { body: t } });
const fotoComoFichero = () => ({ type: 'document', document: { id: 'media-1', mime_type: 'image/jpeg', filename: 'IMG_0001.jpg' } });

async function turno(contenido) {
  log = [];
  lecturasPedidas = 0;
  await wh.handler(ev(contenido));
  return {
    avisoWhatsapp: log.some((l) => l.to === process.env.OWNER_WHATSAPP_NUMBER),
    avisoCorreo: log.some((l) => l.t === 'correo'),
    botones: log.some((l) => l.t === 'botones'),
    habloLaIA: log.some((l) => l.t === 'contestó la IA'),
    pausa: log.some((l) => l.t === 'pausa'),
    leyoLaFoto: lecturasPedidas > 0,
    dijo: log.filter((l) => l.t === 'texto').map((l) => l.m).join(' | '),
    callado: !log.some((l) => l.t === 'texto' || l.t === 'botones'),
  };
}

function reiniciar() {
  historial = [];
  pausado = false;
}

const ok = (cond, etiqueta, extra) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}${cond || !extra ? '' : `  — ${extra}`}`);
  if (!cond) fallos += 1;
};

(async () => {
  // ———————————————————————————————————————————————————————————————
  console.log('\n=== 1. «Si porfa» es un sí: tiene que salir el aviso\n');

  // La pregunta se reconoce, venga de dentro o de fuera de horario, en los dos
  // idiomas. Si esto se rompe, nada de lo de abajo se dispara.
  ok(esPreguntaDeEscalado(`Bla bla. ${escalateQuestion('es')}`), 'la pregunta en español se reconoce');
  ok(esPreguntaDeEscalado(`Bla bla. ${escalateQuestion('en')}`), 'la pregunta en inglés se reconoce');
  ok(!esPreguntaDeEscalado('Aquí tienes nuestras sillas de oficina'), 'otra respuesta NO se confunde con la pregunta');

  for (const [frase, esperado] of [
    ['Si porfa', 'si'],
    ['sí', 'si'],
    ['Sí, por favor', 'si'],
    ['si quiero hablar con una persona', 'si'],
    ['vale', 'si'],
    ['ok gracias', 'si'],
    ['Yes please', 'si'],
    ['adelante', 'si'],
    ['no', 'no'],
    ['No, gracias', 'no'],
    ['no hace falta', 'no'],
    ['no quiero hablar con una persona', 'no'],
    // Y lo que NO es una respuesta a la pregunta: sigue su camino normal.
    ['sí, pero antes dime si tenéis folios A4', null],
    ['¿cuánto vale el papel A4?', null],
    ['necesito 20 cajas de folios', null],
    ['685025', null],
    ['vale de descuento', null],
  ]) {
    const r = respuestaALaPregunta(frase);
    ok(r === esperado, `«${frase}» → ${esperado === null ? 'no es respuesta' : esperado}`, `dio ${r}`);
  }

  // ———————————————————————————————————————————————————————————————
  console.log('\n=== 2. El recorrido real: el aviso sale y el bot se calla\n');
  reiniciar();

  const uno = await turno(texto('No se si ustedes compran mobiliario de oficina de segunda mano'));
  ok(uno.avisoWhatsapp && uno.avisoCorreo, 'el «¿compran de segunda mano?» avisa al equipo',
    `WhatsApp: ${uno.avisoWhatsapp}, correo: ${uno.avisoCorreo}, IA: ${uno.habloLaIA}`);
  ok(!/catálogo|catalogo/i.test(uno.dijo), 'y NO se le contesta que no aparece en el catálogo', uno.dijo);
  ok(uno.pausa, 'y el bot se para, que es lo que impide los doce mensajes de después');

  // Con el bot parado, todo lo que siga se archiva y no se contesta: ni las
  // sillas, ni las nueve fotos.
  const sillas = await turno(texto('Las sillas que se ven en las imágenes no van'));
  ok(sillas.callado, 'con el bot parado, «las sillas no van» no recibe el enlace de sillas', sillas.dijo);

  const foto = await turno(fotoComoFichero());
  ok(foto.callado, 'y las fotos se archivan sin repetirle nada', foto.dijo);

  // ———————————————————————————————————————————————————————————————
  console.log('\n=== 3. Una foto mandada como fichero se lee como una foto\n');
  reiniciar();

  const f1 = await turno(fotoComoFichero());
  ok(f1.leyoLaFoto, 'un `document` que es un JPEG se mira', 'no se leyó');
  ok(!/documento/i.test(f1.dijo), 'y no se le dice «no puedo leer un documento»', f1.dijo);

  // ———————————————————————————————————————————————————————————————
  console.log('\n=== 4. No se le repite nueve veces la misma pregunta\n');
  reiniciar();
  // Se fuerza el camino de «no se pudo contestar»: la pregunta queda hecha.
  historial = [
    { role: 'user', content: '[El cliente envió una foto]' },
    { role: 'assistant', content: `Gracias. ${escalateQuestion('es')}` },
  ];
  const f2 = await turno(fotoComoFichero());
  ok(f2.callado, 'con la pregunta ya hecha y sin contestar, la segunda foto no repite el párrafo', f2.dijo);

  // ———————————————————————————————————————————————————————————————
  // LA OTRA MITAD. Cada escalado es trabajo para el equipo: lo que NO es
  // alguien vendiéndonos algo no puede acabar en una persona.
  console.log('\n=== 5. Y lo que NO es alguien vendiéndonos algo\n');
  for (const frase of [
    'quiero comprar una silla de oficina',
    'quiero comprar 20 cajas de folios',
    '¿cuánto cuesta comprar un armario?',
    '¿vendéis sillas ergonómicas?',
    '¿tenéis mobiliario de oficina?',
    'la compra que hice ayer no ha llegado',
    '¿me pueden hacer un presupuesto de mobiliario?',
  ]) {
    ok(!nosQuiereVenderAlgo(frase), `«${frase}»`, 'se tomó por alguien que nos vende');
  }

  console.log('\n--- y lo que sí lo es\n');
  for (const frase of [
    'No se si ustedes compran mobiliario de oficina de segunda mano',
    '¿compráis material usado?',
    'tengo 19 armarios para vender',
    'quiero venderles unas mesas de oficina',
    '¿me compráis las estanterías?',
    'os vendo 14 mesas seminuevas',
  ]) {
    ok(nosQuiereVenderAlgo(frase), `«${frase}»`, 'no se detectó');
  }

  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
