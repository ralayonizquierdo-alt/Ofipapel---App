// El bot que se quedó colgado repitiendo la misma frase.
//
//   node scripts/probar-bucle.js
//
// LA CONVERSACIÓN REAL (5/10/2026), cuatro mensajes seguidos:
//
//   cliente: "Queria saber si tenes boligrafos o plumas estilograficas"
//   bot:     "Sí, tengo acceso a todo el catálogo. ¿Qué estás buscando exactamente?"
//   cliente: "O alguna para regalar"
//   bot:     "Sí, tengo acceso a todo el catálogo. ¿Qué estás buscando exactamente?"
//   cliente: "Pluma estilograficas"
//   bot:     "Sí, tengo acceso a todo el catálogo. ¿Qué estás buscando exactamente?"
//   cliente: "Pluma estilografica"
//   bot:     "Sí, tengo acceso a todo el catálogo. ¿Qué estás buscando exactamente?"
//
// En el catálogo hay NUEVE plumas estilográficas. Hubo que escribirle a mano
// pidiendo disculpas.
//
// Dos fallos encadenados, y esta prueba cubre los dos:
//
// 1. NUNCA SE MIRÓ EL CATÁLOGO. Antes de buscar hay un filtro que se lo salta
//    cuando el mensaje no parece ir de un artículo (para no gastar segundos en
//    un "¿a qué hora abrís?"). Ese filtro es una lista de formas de preguntar, y
//    "tenes" (voseo) no estaba; "Pluma estilografica" no lleva verbo ninguno.
//    Ahora, si la IA intenta confirmar un producto, se busca igual: que lo
//    intente ES la señal de que era una consulta de producto.
//
// 2. LA MISMA FRASE, CUATRO VECES. La respuesta de seguridad es fija. Dicha una
//    vez es razonable; repetida es un bot colgado. Ahora, si toca repetirla, se
//    ofrece una persona.
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WHATSAPP_TOKEN = 'token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
process.env.ANTHROPIC_API_KEY = 'clave';
process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs';

// Las plumas que SÍ están en ofipapel.net (nombres reales).
const CATALOGO = [
  'PLUMA Faber-Castell (M) Estilográfica Grip 2010 NEGRA',
  'PLUMA ESTILOGRAFICA Faber-Castell SPARKLE OCEANO (M)',
  'PLUMA ESTILOGRAFICA Faber-Castell SPARKLE VIOLETA F',
  'PLUMA ESTILOGRAFICA ESCOLAR CLASSIC X1 (Blíster)',
  'BOLIGRAFO BIC Cristal Azul',
  'CALCULADORA CASIO MS-20UC Azul',
];
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
const comoWordpress = (term) => {
  const partes = norm(term).split(/\s+/).filter(Boolean);
  return partes.length ? CATALOGO.filter((n) => partes.every((p) => norm(n).includes(p))) : [];
};

let enviados = [];
let busquedasAlCatalogo = [];
let conversacion = [];

global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('api.anthropic.com')) {
    // Una IA que hace lo que hizo la de verdad: si NO le dan datos de catálogo,
    // contesta de memoria confirmando que sí lo tenemos. Si se los dan, los usa.
    const cuerpo = JSON.parse(opts.body);
    const tieneDatos = /PRODUCTOS que coinciden/.test(cuerpo.system || '');
    const texto = tieneDatos
      ? 'Tenemos la PLUMA ESTILOGRAFICA Faber-Castell SPARKLE OCEANO por 9,90€ + IGIC. Te paso el enlace.'
      : 'Sí, claro que tenemos bolígrafos y plumas estilográficas en nuestra tienda.';
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: texto }] }), text: async () => '{}' };
  }
  // Los botones de "¿quieres hablar con una persona?" no pasan por
  // whatsapp-send: se mandan a Meta directamente.
  if (u.includes('graph.facebook.com')) {
    try {
      const b = JSON.parse(opts?.body || '{}');
      if (b.type === 'interactive') enviados.push({ tipo: 'botones', texto: b.interactive?.body?.text || '' });
    } catch { /* no es un envío */ }
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.X' }] }), text: async () => '{}' };
  }
  if (u.includes('ofipapel.net')) {
    const m = u.match(/[?&]search=([^&]*)/);
    const term = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    const items = u.includes('/products?') && m ? comoWordpress(term) : [];
    if (m) busquedasAlCatalogo.push(term);
    return {
      ok: true, status: 200, headers: { get: () => 'application/json' },
      json: async () => items.map((name, i) => ({ id: i + 1, name, price: '9.90', permalink: 'https://ofipapel.net/p/' + i, stock_status: 'instock' })),
      text: async () => '[]',
    };
  }
  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

Module.prototype.require = function (p) {
  // Netlify Blobs solo existe dentro de Netlify; aquí no se usa (no hay fotos).
  if (p === '@netlify/blobs') return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (to, m) => { enviados.push({ tipo: 'texto', texto: m }); return { ok: true }; },
      sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    return {
      ...m,
      isConfigured: () => true,
      claimMessage: async () => true,
      getPausaGlobal: async () => null,
      isBotPaused: async () => false,
      getFichaCliente: async () => ({ presentado: true }),
      actualizarFichaCliente: async () => {},
      marcarPresentado: async () => {},
      guardarNombreWhatsapp: async () => {},
      registrarProductoPreguntado: async () => {},
      listarNotasNegocio: async () => [],
      getCachedSearch: async () => null,
      setCachedSearch: async () => {},
      getAliasesBusqueda: async () => ({}),
      appendCustomerMessage: async (f, t) => { conversacion.push({ role: 'user', content: t }); },
      loadConversation: async () => conversacion,
      appendMessages: async (f, u, b) => {
        conversacion.push({ role: 'user', content: u }, { role: 'assistant', content: b });
      },
    };
  }
  if (p === './whatsapp-agent-core') {
    const real = m;
    return {
      ...real,
      notifyOwner: async () => {},
      getHistory: async () => conversacion.map(({ role, content }) => ({ role, content, ts: Date.now() })),
      appendToHistory: async (f, u, b) => {
        conversacion.push({ role: 'user', content: u }, { role: 'assistant', content: b });
      },
      appendCustomerMessage: async (f, t) => { conversacion.push({ role: 'user', content: t }); },
      isBotPaused: async () => false,
      pauseBot: async () => {},
    };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

const evento = (texto) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ from: '34610772844', id: 'wamid.' + Math.random(), type: 'text', text: { body: texto } }],
    contacts: [{ profile: { name: 'Cliente' } }],
  } }] }] });
  return { httpMethod: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex') },
    body };
};

(async () => {
  let fallos = 0;
  const mal = (m) => { fallos++; console.log('  MAL  ' + m); };
  const bien = (m) => console.log('  OK   ' + m);

  const escribe = async (texto) => {
    enviados = [];
    busquedasAlCatalogo = [];
    await wh.handler(evento(texto));
    return { dicho: enviados.map((e) => e.texto).join(' // '), buscado: busquedasAlCatalogo };
  };

  console.log('\n=== El primer mensaje, tal cual lo escribió');
  const uno = await escribe('Queria saber si tenes boligrafos o plumas estilograficas');
  console.log('      busca:', uno.buscado.map((t) => `"${t}"`).join(' ') || '(no buscó)');
  console.log('      dice :', uno.dicho.slice(0, 160));
  uno.buscado.length > 0
    ? bien('mira el catálogo, aunque "tenes" no esté en la lista de palabras')
    : mal('sigue sin mirar el catálogo: contesta de memoria');
  /ESTILOGRAFICA/i.test(uno.dicho)
    ? bien('y le nombra una pluma de verdad, de las nueve que hay')
    : mal('no le da ningún producto');
  /Qué estás buscando exactamente/i.test(uno.dicho)
    ? mal('le pregunta qué busca a quien acaba de decirlo')
    : bien('no le pregunta qué busca, que ya se lo ha dicho');

  console.log('\n=== Sin verbo ninguno: "Pluma estilografica"');
  conversacion = [];
  const dos = await escribe('Pluma estilografica');
  console.log('      busca:', dos.buscado.map((t) => `"${t}"`).join(' ') || '(no buscó)');
  console.log('      dice :', dos.dicho.slice(0, 160));
  dos.buscado.length > 0
    ? bien('un nombre de producto a secas también hace que mire')
    : mal('sin verbo no mira el catálogo');
  /ESTILOGRAFICA/i.test(dos.dicho)
    ? bien('y contesta con el producto')
    : mal('no le da ningún producto');

  console.log('\n=== Y si aun así no hay nada que ofrecer, no se repite');
  // Se simula el peor caso: la frase de seguridad ya se dijo en el mensaje
  // anterior. Volver a soltarla es lo que convirtió esto en un bucle.
  const { PRODUCTO_NO_VERIFICADO_INFO } = require(path.join(RAIZ, 'netlify/functions/whatsapp-agent-config.js'));
  conversacion = [
    { role: 'user', content: 'un chisme rarisimo de esos' },
    { role: 'assistant', content: PRODUCTO_NO_VERIFICADO_INFO },
  ];
  // Redactado distinto a propósito: repetir la MISMA pregunta activa otro
  // camino (el de "está insistiendo"), y aquí se prueba el del bucle.
  const tres = await escribe('alguna maquina voladora para el tejado');
  console.log('      dice :', tres.dicho.slice(0, 180));
  tres.dicho.includes(PRODUCTO_NO_VERIFICADO_INFO)
    ? mal('repite la misma frase palabra por palabra: el cliente ve un bot colgado')
    : bien('no repite la frase que ya le dijo');
  /persona del equipo|te pongamos en contacto|en contacto con una persona/i.test(tres.dicho)
    ? bien('le ofrece una persona, que es lo que le resuelve')
    : mal('no le ofrece salida: se queda igual que estaba');

  console.log(fallos === 0 ? '\n✔ Ni se cuelga ni se repite' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
