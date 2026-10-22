// Enseñarle cosas al bot.
//
//   node scripts/probar-notas.js
//
// El aprendizaje que había solo sabía hacer una cosa: cambiar una palabra por
// otra al buscar en el catálogo ("folios" -> "papel fotocopia"). Eso arregla una
// búsqueda, pero no sirve para enseñarle un HECHO, que es lo que hace falta casi
// siempre. Los dos casos que lo destaparon, los dos reales:
//
//   "Las cajas registradoras de siempre ya no son legales: con Verifactu tienen
//    que estar conectadas con Hacienda. Vendemos las homologadas."
//   "El papel A4 normal es el Mattio de la oferta." (un cliente pidió "papel de
//    oficina. Normal" y se llevó un "tenemos muchas opciones" sin un producto
//    ni un precio)
//
// Ninguna de las dos cabe en un alias. Así que ahora hay NOTAS: texto libre que
// se escribe desde el panel, sin desplegar nada, y que viaja en el prompt de la
// IA. Esta prueba comprueba la cadena entera, que es donde están las trampas:
// que llegan al prompt de verdad, que mandan sobre la respuesta fija, que se
// pueden quitar, y que no cuestan una consulta a Upstash por mensaje.
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WHATSAPP_TOKEN = 'token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
process.env.DASHBOARD_PASSWORD = 'prueba';
process.env.UPSTASH_REDIS_REST_URL = 'https://ejemplo.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba';

const TEL = '34600111222';

// Base de datos de mentira, compartida entre el panel y el bot: lo que se
// escribe en uno tiene que leerlo el otro, que es justo lo que se prueba.
const BASE = new Map();
const HASHES = new Map();

let promptsAClaude = [];
let comandosRedis = [];
let busquedasAlCatalogo = [];

global.fetch = async (url, opts) => {
  const u = String(url);
  const cuerpo = opts?.body ? String(opts.body) : '';

  if (u.includes('upstash')) {
    const args = JSON.parse(cuerpo);
    const [cmd, clave] = args;
    comandosRedis.push(`${cmd} ${clave}`);
    const responder = (result) => ({ ok: true, json: async () => ({ result }), text: async () => JSON.stringify({ result }) });
    if (cmd === 'HSET') {
      const h = HASHES.get(clave) || new Map();
      h.set(args[2], args[3]);
      HASHES.set(clave, h);
      return responder(1);
    }
    if (cmd === 'HDEL') {
      HASHES.get(clave)?.delete(args[2]);
      return responder(1);
    }
    if (cmd === 'HGETALL') {
      const h = HASHES.get(clave);
      if (!h) return responder([]);
      return responder([...h].flat());
    }
    if (cmd === 'SET') { BASE.set(clave, args[2]); return responder('OK'); }
    if (cmd === 'GET') return responder(BASE.get(clave) ?? null);
    if (cmd === 'DEL') { BASE.delete(clave); return responder(1); }
    if (cmd === 'INCR') { const n = Number(BASE.get(clave) || 0) + 1; BASE.set(clave, n); return responder(n); }
    if (cmd === 'SMEMBERS') return responder([TEL]);
    if (cmd === 'ZRANGE') return responder([]);
    // La lista de notas de clientes recorre todas las fichas con SCAN + MGET.
    if (cmd === 'SCAN') return responder(['0', [...BASE.keys()].filter((c) => c.startsWith('cliente:'))]);
    if (cmd === 'MGET') return responder(args.slice(1).map((c) => BASE.get(c) ?? null));
    return responder(null);
  }

  if (u.includes('api.anthropic.com')) {
    promptsAClaude.push(JSON.parse(cuerpo).system);
    return {
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Respuesta de la IA.' }] }),
      text: async () => '{}',
    };
  }

  if (u.includes('ofipapel.net')) {
    busquedasAlCatalogo.push(u);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [],
      text: async () => '[]',
    };
  }

  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

// El webhook va REAL: se le quita solo el envío a WhatsApp (que si no, intenta
// escribirle a un cliente de verdad) y la búsqueda en el catálogo, que aquí no
// pinta nada. Nada de stubear conversation-store: la prueba es precisamente que
// lo que se guarda desde el panel llega al bot.
function cargarWebhook() {
  Module.prototype.require = function (p) {
    if (p === './whatsapp-send') {
      return { sendWhatsappMessage: async () => ({ ok: true }), sendWhatsappTemplate: async () => ({ ok: true }),
        uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}) };
    }
    const m = orig.apply(this, arguments);
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
    messages: [{ from: TEL, id: 'wamid.' + Math.random(), type: 'text', text: { body: texto } }],
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

  const notas = require(path.join(RAIZ, 'netlify/functions/whatsapp-notas.js'));
  const wh = cargarWebhook();
  const panel = cargarPanel();

  const login = await panel.handler({
    httpMethod: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=login&password=prueba', queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];
  const verAprendizaje = async () =>
    (await panel.handler({ httpMethod: 'GET', queryStringParameters: { vista: 'aprendizaje' }, headers: { cookie } })).body || '';
  const postear = (body) => panel.handler({
    httpMethod: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    queryStringParameters: {}, body,
  });

  // Cada mensaje del cliente empieza con el prompt limpio.
  const escribeElCliente = async (texto) => {
    promptsAClaude = [];
    await wh.handler(evento(texto));
    return promptsAClaude[0] || '';
  };

  console.log('\n=== Las dos que se pidieron, sin tener que escribir nada');
  // Van dentro del código a propósito: son las que no deben depender de que
  // alguien las vuelva a teclear ni de que Upstash esté vivo.
  const registradoras = notas.NOTAS_DE_CASA.find((n) => n.id === 'casa:registradoras-verifactu');
  const papel = notas.NOTAS_DE_CASA.find((n) => n.id === 'casa:papel-a4-de-batalla');
  /verifactu/i.test(registradoras?.texto || '')
    ? bien('sabe que las registradoras de siempre ya no valen (Verifactu)')
    : mal('no sabe nada de Verifactu');
  /sam4s zeta a50/i.test(registradoras?.texto || '') && /ofipapel\.net\/producto\//.test(registradoras.texto)
    ? bien('y sabe cuál ofrecer en su lugar, con enlace')
    : mal('dice que las viejas no valen pero no ofrece alternativa');
  /mattio/i.test(papel?.texto || '') && /ofipapel\.net\/producto\//.test(papel.texto)
    ? bien('sabe que el papel A4 de batalla es el Mattio de la oferta')
    : mal('no sabe cuál es el papel normal');

  console.log('\n=== ¿Vienen a cuento?');
  notas.notasQueAplican('quiero una caja registradora nueva', notas.NOTAS_DE_CASA).length === 1
    ? bien('preguntar por una registradora saca la nota de las registradoras')
    : mal('preguntar por una registradora no saca su nota');
  notas.notasQueAplican('necesito papel A4 normal', notas.NOTAS_DE_CASA).some((n) => n.id === 'casa:papel-a4-de-batalla')
    ? bien('pedir papel saca la del papel')
    : mal('pedir papel no saca la del papel');
  notas.notasQueAplican('¿a qué hora abrís?', notas.NOTAS_DE_CASA).length === 0
    ? bien('y preguntar por el horario no saca ninguna')
    : mal('saca notas que no vienen a cuento: se le llena el prompt de ruido');
  // Por palabra completa. Sin esto, "papel" encajaba dentro de "papelería" y
  // cualquier "hola, papelería Ofipapel" arrastraba la nota del papel.
  notas.notasQueAplican('sois una papelería muy buena', notas.NOTAS_DE_CASA).length === 0
    ? bien('"papelería" no cuenta como "papel"')
    : mal('encaja dentro de otra palabra: saltaría a cada rato');

  console.log('\n=== Llegan a la IA de verdad');
  const prompt = await escribeElCliente('Hola, ¿tenéis cajas registradoras?');
  /verifactu/i.test(prompt)
    ? bien('el prompt que se le manda a la IA lleva la nota')
    : mal('la nota no llega al prompt: el bot sigue sin enterarse');
  /VIENE A CUENTO AHORA/.test(prompt)
    ? bien('y marcada como que encaja con lo que acaban de preguntar')
    : mal('llega sin marcar: se pierde entre el resto del prompt');
  /MANDA sobre cualquier otra cosa/.test(prompt)
    ? bien('y dejando claro que manda sobre lo que la IA crea saber')
    : mal('no dice que mande: la IA puede ignorarla y contestar lo de siempre');

  console.log('\n=== Una nota gana a la respuesta fija');
  // Las respuestas fijas (FAQ) cortan el turno antes de llegar a la IA. Si una
  // nota toca ese mismo tema, contestar con el texto de siempre es contestar con
  // lo que ya sabemos que está mal.
  const sinNota = await escribeElCliente('¿cuál es vuestro horario?');
  sinNota === ''
    ? bien('sin nota, el horario lo sigue contestando la respuesta fija (ni se llama a la IA)')
    : mal('el horario ya no lo contesta la respuesta fija: se ha roto el camino rápido');

  await postear(`action=nota-add&tema=${encodeURIComponent('horario, abrís')}&texto=${encodeURIComponent('En Navidad cerramos a las 14:00.')}`);
  // Preguntado de otra forma a propósito: repetir la MISMA frase se toma como
  // que el cliente está insistiendo, y entonces el bot escala a una persona —
  // que es otro camino distinto y no el que se está probando aquí.
  const conNota = await escribeElCliente('necesito saber el horario de la tienda de Los Cristianos el sábado por la mañana');
  conNota !== ''
    ? bien('con una nota sobre el horario, pasa a la IA (que sí la lleva)')
    : mal('sigue contestando el texto fijo: la nota no sirve de nada');
  /En Navidad cerramos a las 14:00/.test(conNota)
    ? bien('y la nota escrita desde el panel viaja en el prompt')
    : mal('la nota del panel no llega al bot');

  console.log('\n=== Se ve y se quita desde el panel');
  let html = await verAprendizaje();
  html.includes('En Navidad cerramos a las 14:00')
    ? bien('la nota recién escrita se ve en el panel')
    : mal('se guarda pero no se ve: no hay forma de saber qué le has enseñado');
  html.includes('Verifactu')
    ? bien('y también las que vienen dentro del bot')
    : mal('las de dentro del bot no se ven: no hay manera de saber qué sabe');
  (html.match(/value="nota-del"/g) || []).length === 1
    ? bien('solo se puede quitar la del panel (las de dentro del bot no)')
    : mal('ofrece quitar notas que no se pueden quitar');

  const id = (html.match(/name="id" value="([^"]+)"/) || [])[1];
  await postear(`action=nota-del&id=${encodeURIComponent(id)}`);
  html = await verAprendizaje();
  !html.includes('En Navidad cerramos a las 14:00')
    ? bien('y se quita cuando deja de valer')
    : mal('no se puede quitar: un dato caducado se queda fijado para siempre');

  console.log('\n=== La plastificadora (dos veces con el mismo cliente)');
  // "plastificadora" es la MÁQUINA, que se vende. Se colaba por la puerta de
  // atrás: la palabra contiene "plastificado", que era clave del SERVICIO de
  // Reprografía. El cliente preguntó si se la llevaban hoy o mañana y se llevó
  // el precio de los plastificados y un teléfono.
  const { matchFaqRule } = require(path.join(RAIZ, 'netlify/functions/whatsapp-agent-core.js'));
  const preguntaDeLaEntrega = 'Buenas tardes les escribo brevemente para saber si finalmente hoy van a llevar la plastificadora o es para mañana dado que hoy todavía no he recibido nada en el local.';
  !/Reprografía/.test(matchFaqRule(preguntaDeLaEntrega) || '')
    ? bien('preguntar por la entrega de una plastificadora ya no contesta lo de Reprografía')
    : mal('sigue contestando el precio de los plastificados a quien espera una máquina');
  /Reprografía/.test(matchFaqRule('¿hacéis plastificados de documentos?') || '')
    ? bien('y plastificar un documento sí sigue siendo Reprografía')
    : mal('se ha roto la respuesta del servicio de plastificado');

  console.log('\n=== Lo que el equipo apunta de un cliente');
  // La nota estaba escrita en su ficha y el bot la ignoró, porque una respuesta
  // fija contesta y corta el turno: la IA, que sí la tenía en el prompt, no
  // llegó a mirarla. Escribir una nota y que el bot la ignore es peor que no
  // tener notas.
  await postear(`phone=${TEL}&action=notas&notas=${encodeURIComponent('Ha pedido una plastificadora y está esperando a que llegue.')}`);
  const hilo = await panel.handler({ httpMethod: 'GET', queryStringParameters: { phone: TEL }, headers: { cookie } });
  /Ha pedido una plastificadora/.test(hilo.body || '')
    ? bien('la nota se vuelve a ver en la ficha después de guardarla')
    : mal('se guarda y luego no se puede consultar');

  // Y la nota de la ficha cuenta como nota a la hora de apartar una respuesta
  // fija, aunque el texto no lleve palabras clave puestas a mano: salen de la
  // propia nota.
  notas.notasQueAplican('¿me traen hoy la plastificadora?', [
    notas.notaDeFicha({ notas: 'Ha pedido una plastificadora y está esperando a que llegue.' }),
  ]).length === 1
    ? bien('lo apuntado sobre un cliente aparta la respuesta fija cuando él lo menciona')
    : mal('lo apuntado en su ficha no aparta nada: el texto de siempre le gana otra vez');

  const conFicha = await escribeElCliente('¿me traen hoy la plastificadora?');
  conFicha !== ''
    ? bien('y preguntando por eso contesta la IA, que sí tiene la nota')
    : mal('la respuesta fija sigue ganándole a la nota del equipo');
  /Ha pedido una plastificadora/.test(conFicha)
    ? bien('la nota del equipo viaja en el prompt')
    : mal('la nota no llega al prompt');

  html = await verAprendizaje();
  /Ha pedido una plastificadora/.test(html)
    ? bien('y todas las notas de clientes se pueden consultar juntas')
    : mal('solo se ven abriendo la conversación de esa persona');

  console.log('\n=== La nota, a la vista');
  const cuerpoHilo = hilo.body || '';
  // Dentro del cuadro de escribir se lee mal y no se distingue de un cuadro
  // vacío con su texto de ejemplo. Fue lo que pasó: se dio una nota por perdida
  // mirando un cuadro que parecía vacío.
  /ficha-nota/.test(cuerpoHilo)
    ? bien('se lee como dato en la ficha, no solo dentro del cuadro')
    : mal('solo está dentro del cuadro de escribir: parece vacío de un vistazo');
  /con notas/.test(cuerpoHilo)
    ? bien('y la ficha avisa de que hay notas aunque esté plegada')
    : mal('con la ficha plegada no hay forma de saber que hay algo apuntado');

  const listado = (await panel.handler({ httpMethod: 'GET', queryStringParameters: {}, headers: { cookie } })).body || '';
  /convo-nota/.test(listado) && /Ha pedido una plastificadora/.test(listado)
    ? bien('y en el listado se ve qué clientes tienen nota, sin entrar')
    : mal('desde el listado no se sabe quién tiene notas');

  console.log('\n=== Lo que se recargaba solo y borraba lo escrito');
  // La página se refresca sola cada medio minuto. Miraba solo el cuadro de
  // responder para no interrumpir, así que escribir una nota en la ficha y
  // tardar treinta segundos en darle a Guardar acababa con la página
  // recargándose y lo escrito en la basura. Varias notas se perdieron así.
  /querySelectorAll\('textarea, input\[type=text\]'\)/.test(cuerpoHilo)
    ? bien('ahora mira todos los cuadros de la página, no solo el de responder')
    : mal('sigue mirando solo el de responder: lo que escribas en la ficha se pierde');
  /data-inicial/.test(cuerpoHilo)
    ? bien('y compara con lo que había al cargar, para no dejar de refrescar nunca')
    : mal('un cuadro con texto guardado dejaría la página sin refrescarse jamás');

  console.log('\n=== Lo que cuesta');
  // El prompt se manda en CADA mensaje, así que si esto se leyera de Upstash
  // cada vez sería una petición más por mensaje, que es justo lo que costó
  // dinero la última vez.
  comandosRedis = [];
  await escribeElCliente('hola');
  await escribeElCliente('otra cosa');
  await escribeElCliente('y otra más');
  const lecturas = comandosRedis.filter((c) => c === 'HGETALL notas_negocio').length;
  lecturas <= 1
    ? bien(`tres mensajes seguidos = ${lecturas} lectura de notas (se guardan un minuto en memoria)`)
    : mal(`${lecturas} lecturas para tres mensajes: una petición más por mensaje`);

  console.log('\n=== El papel "normal", en la búsqueda');
  // Además de la nota, la búsqueda tiene que apuntar al Mattio: con "papel" a
  // secas el catálogo devuelve medio mundo (cuadernos, blocs, etiquetas) y con
  // esa lista delante no hay forma de elegir. Fue el fallo real.
  const wc = require(path.join(RAIZ, 'netlify/functions/woocommerce-client.js'));
  busquedasAlCatalogo = [];
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_prueba';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_prueba';
  await wc.buscarEnCatalogo('quiero papel normal', 3);
  busquedasAlCatalogo.some((u) => /mattio/i.test(decodeURIComponent(u)))
    ? bien('"papel normal" se busca como el papel Mattio')
    : mal('"papel normal" sigue buscando papel a secas: vuelve el "tenemos muchas opciones"');

  busquedasAlCatalogo = [];
  comandosRedis = [];
  await wc.buscarEnCatalogo('papel fotográfico brillo', 3);
  !busquedasAlCatalogo.some((u) => /mattio/i.test(decodeURIComponent(u)))
    ? bien('y pedir otro papel distinto no se convierte en Mattio')
    : mal('cualquier papel acaba en Mattio: se le cuela a quien pide otra cosa');

  console.log('\n=== Lo que se ha quitado: "búsquedas sin resultado"');
  // Apuntaba la frase del cliente cada vez que una búsqueda volvía vacía, para
  // revisarla luego. Lo que salía en la lista eran trozos de frase inconexos que
  // casi nunca se parecían a la pregunta, así que no había forma de saber qué
  // enseñarle. Se quitó entera: ahora se enseña con notas.
  !comandosRedis.some((c) => c.startsWith('ZINCRBY'))
    ? bien('una búsqueda sin resultado ya no escribe nada (una petición menos)')
    : mal('sigue apuntando trozos de frase en cada búsqueda vacía');
  const aprendizaje = await verAprendizaje();
  !/Búsquedas sin resultado/.test(aprendizaje)
    ? bien('y el apartado ya no está en el panel')
    : mal('el apartado sigue ahí');
  /Cosas que le has enseñado/.test(aprendizaje)
    ? bien('lo que queda es enseñarle cosas en cristiano')
    : mal('se ha llevado por delante el apartado de notas');

  console.log(fallos === 0 ? '\n✔ Al bot se le puede enseñar' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
