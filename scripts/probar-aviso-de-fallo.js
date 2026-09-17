// Si el bot se rompe, ¿se entera alguien?
//
//   node scripts/probar-aviso-de-fallo.js
//
// Ésta es la prueba del fallo que costó más caro de todo el proyecto, y no
// prueba que el bot funcione: prueba que cuando NO funcione, se note.
//
// Qué pasó (10-17/9/2026): un TypeError en cada mensaje entrante. El webhook lo
// capturaba, lo escribía en unos logs que nadie mira, y le devolvía 200 a Meta
// — así que Meta lo daba por entregado y no reintentaba. Desde fuera era
// indistinguible de "hoy no ha escrito nadie". Siete días sin contestar a un
// solo cliente, descubierto de casualidad.
//
// El arreglo de aquel TypeError concreto lo cubre probar-arranque-real.js. Esto
// cubre lo otro, que es lo que de verdad importa: el próximo fallo será otro
// distinto, y lo único que puede evitar otra semana muda es que el panel lo
// grite el mismo día.
//
// Por eso aquí se PROVOCA un error a propósito y se comprueba la cadena entera:
// que se anota, que el panel lo enseña, que dice qué pasó y cuándo, y que se
// puede quitar cuando se arregle.
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WHATSAPP_TOKEN = 'token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
process.env.DASHBOARD_PASSWORD = 'prueba';
process.env.UPSTASH_REDIS_REST_URL = 'https://ejemplo.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba';

// Una base de datos de mentira, en memoria. Hace falta que sea de verdad
// persistente entre el webhook y el panel: lo que se prueba es justamente que
// lo que escribe uno lo lea el otro.
const BASE = new Map();

global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('upstash')) {
    const args = JSON.parse(opts.body);
    const [cmd, clave] = args;
    // text() hace falta porque el diagnóstico de Upstash lee el cuerpo así.
    const responder = (result) => ({ ok: true, json: async () => ({ result }), text: async () => JSON.stringify({ result }) });
    if (cmd === 'SET') { BASE.set(clave, args[2]); return responder('OK'); }
    if (cmd === 'GET') return responder(BASE.get(clave) ?? null);
    if (cmd === 'DEL') { BASE.delete(clave); return responder(1); }
    if (cmd === 'SMEMBERS') return responder([]);
    if (cmd === 'INCR') { const n = Number(BASE.get(clave) || 0) + 1; BASE.set(clave, n); return responder(n); }
    return responder(null);
  }
  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

// EL ERROR PROVOCADO. Se rompe getFichaCliente, que es de las primeras cosas
// que toca cualquier mensaje — el mismo sitio, más o menos, donde estaba el
// TypeError de verdad.
function cargarWebhook() {
  Module.prototype.require = function (p) {
    if (p === './whatsapp-send') {
      return { sendWhatsappMessage: async () => ({ ok: true }), sendWhatsappTemplate: async () => ({ ok: true }),
        uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}) };
    }
    const m = orig.apply(this, arguments);
    if (p === './conversation-store') {
      return {
        ...m,
        getFichaCliente: async () => { throw new TypeError('algo.queNoExiste is not a function'); },
      };
    }
    if (p === './whatsapp-agent-core') return { ...m, askClaude: async () => 'respuesta' };
    if (p === './whatsapp-catalogo') {
      return { ...m, construirContextoCatalogo: async () => ({ productContext: null, contextoConsumibles: null, impresoras: [], fallo: false }) };
    }
    return m;
  };
  const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
  Module.prototype.require = orig;
  return wh;
}

function cargarPanel() {
  Module.prototype.require = function (p) {
    if (p === './whatsapp-send') {
      return { sendWhatsappMessage: async () => ({ ok: true }), sendWhatsappTemplate: async () => ({ ok: true }),
        uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
        getBusinessProfile: async () => ({ ok: true, perfil: {} }), getPhoneNumberStatus: async () => ({ ok: true, numero: {} }) };
    }
    const m = orig.apply(this, arguments);
    if (p === './conversation-store') return { ...m, getPanelPassword: async () => null };
    return m;
  };
  const panel = require(path.join(RAIZ, 'netlify/functions/conversations.js'));
  Module.prototype.require = orig;
  return panel;
}

const evento = (texto) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ from: '34600111222', id: 'wamid.' + Math.random(), type: 'text', text: { body: texto } }],
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

  const wh = cargarWebhook();
  const panel = cargarPanel();

  console.log('\n=== Con el bot roto');
  const respuesta = await wh.handler(evento('hola'));

  // Se le sigue devolviendo 200 a propósito: un 500 haría que Meta reintentara
  // el mismo mensaje sin parar, y si el fallo es del código va a fallar igual.
  respuesta.statusCode === 200
    ? bien('a Meta se le devuelve 200 (un 500 provocaría reintentos infinitos)')
    : mal(`se le devuelve ${respuesta.statusCode} a Meta: reintentaría en bucle`);

  BASE.has('ultimo_fallo')
    ? bien('el fallo queda anotado, no solo en unos logs que nadie mira')
    : mal('el fallo NO queda anotado: otra semana muda esperando a que alguien lo note');

  const login = await panel.handler({
    httpMethod: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=login&password=prueba', queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];

  const pagina = await panel.handler({ httpMethod: 'GET', queryStringParameters: {}, headers: { cookie } });
  const html = pagina.body || '';

  console.log('\n=== Lo que ve quien abre el panel');
  /El bot falló al atender un mensaje/.test(html)
    ? bien('el panel lo dice, y arriba del todo')
    : mal('el panel no dice nada: el fallo sigue siendo invisible');
  html.includes('algo.queNoExiste is not a function')
    ? bien('enseña el error tal cual, para poder pegármelo')
    : mal('no enseña el error: "algo ha ido mal" no sirve para arreglarlo');
  /hace (menos de una hora|\d+ (h|días))/.test(html)
    ? bien('dice cuánto hace que pasó')
    : mal('no dice cuándo pasó, que es lo que distingue un susto viejo de uno vivo');
  // Contra la etiqueta de la lista, no contra "convo-list" a secas: eso
  // aparece antes en el CSS y daba un falso negativo.
  const posAviso = html.indexOf('El bot falló');
  const posLista = html.indexOf('<ul class="convo-list">');
  posAviso >= 0 && posLista > posAviso
    ? bien('sale por encima de la lista de conversaciones')
    : mal('sale enterrado debajo de la lista');

  console.log('\n=== Cuando se arregla');
  await panel.handler({
    httpMethod: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    queryStringParameters: {}, body: 'action=fallo-visto',
  });
  const limpia = await panel.handler({ httpMethod: 'GET', queryStringParameters: {}, headers: { cookie } });
  /El bot falló al atender un mensaje/.test(limpia.body || '')
    ? mal('el aviso no se puede quitar: en dos días se convierte en decorado y se deja de mirar')
    : bien('el aviso se quita al darle a "ya está resuelto"');

  console.log(fallos === 0 ? '\n✔ Un bot roto ya no pasa desapercibido' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
