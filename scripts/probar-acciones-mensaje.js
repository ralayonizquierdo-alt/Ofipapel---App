// Responder a un mensaje concreto y quitar un mensaje del panel.
//
//   node scripts/probar-acciones-mensaje.js
//
// Las dos cosas que se pidieron "tipo WhatsApp", con sus dos trampas:
//
// RESPONDER CITANDO. WhatsApp pinta la respuesta enganchada al mensaje original
// si se manda `context.message_id` con el identificador (wamid) que Meta le dio
// a ese mensaje. Hasta ahora no se guardaba ninguno, así que solo se puede
// citar lo que entre a partir de ahora — y los mensajes viejos NO deben enseñar
// el botón, porque daría un envío fallido.
//
// QUITAR UN MENSAJE. Meta NO permite borrar un mensaje ya enviado: no existe
// ese endpoint en la Cloud API. Así que esto solo lo quita del panel, y eso hay
// que decirlo donde se pulsa. La trampa aquí es otra: el índice de un mensaje
// cambia si mientras tanto llega otro, así que borrar "el número 7" a ciegas
// puede borrar el mensaje equivocado. Por eso va con una huella del contenido:
// si no coincide, no se borra nada.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

process.env.DASHBOARD_PASSWORD = 'prueba';
process.env.UPSTASH_REDIS_REST_URL = 'https://ejemplo.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba';

const TEL = '34600111222';
const WAMID = 'wamid.ABC123';

// La conversación tal y como estaría archivada. El primer mensaje del cliente
// trae wamid (entró después del cambio); el tercero no (es de los de antes).
let CONVERSACION = [
  { role: 'user', content: '¿Tenéis folios A4?', ts: Date.now() - 60000, wamid: WAMID },
  { role: 'assistant', content: 'Sí, tenemos varios formatos.', ts: Date.now() - 59000 },
  { role: 'user', content: 'Mensaje viejo sin identificador', ts: Date.now() - 58000 },
  // Una respuesta del bot con la marca interna con la que se acuerda de por
  // dónde iba una búsqueda de pedido. Al cliente le llegó sin ella; en el panel
  // salía tal cual, y parecía un error.
  { role: 'assistant', content: '[PEDIDO:ESPERANDO_NOMBRE:643514]Para confirmar que el pedido es tuyo, dime el nombre.', ts: Date.now() - 57000 },
];

const enviados = [];

global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('upstash')) {
    const args = JSON.parse(opts.body);
    const [cmd, clave] = args;
    const responder = (result) => ({ ok: true, json: async () => ({ result }), text: async () => JSON.stringify({ result }) });
    if (cmd === 'GET' && clave === `conv:${TEL}`) return responder(JSON.stringify(CONVERSACION));
    if (cmd === 'SET' && clave === `conv:${TEL}`) { CONVERSACION = JSON.parse(args[2]); return responder('OK'); }
    if (cmd === 'SMEMBERS') return responder([TEL]);
    return responder(null);
  }
  if (u.includes('graph.facebook.com')) {
    enviados.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({}), text: async () => '{}' };
  }
  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

// El panel va REAL salvo el envío a WhatsApp, que se intercepta arriba por
// fetch para poder mirar exactamente qué se le manda a Meta.
Module.prototype.require = function (p) {
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    return { ...m, getPanelPassword: async () => null, getEstadoEntrega: async () => ({}), markAsViewed: async () => {} };
  }
  return m;
};
const panel = require(path.join(RAIZ, 'netlify/functions/conversations.js'));
Module.prototype.require = orig;

(async () => {
  let fallos = 0;
  const mal = (m) => { fallos++; console.log('  MAL  ' + m); };
  const bien = (m) => console.log('  OK   ' + m);

  const login = await panel.handler({
    httpMethod: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=login&password=prueba', queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];
  const abrir = () => panel.handler({ httpMethod: 'GET', queryStringParameters: { phone: TEL }, headers: { cookie } });
  const postear = (body) => panel.handler({
    httpMethod: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    queryStringParameters: {}, body,
  });

  console.log('\n=== Los botones en la conversación');
  const html = (await abrir()).body || '';
  html.includes('↩︎ Responder') ? bien('el mensaje del cliente trae botón de responder') : mal('no hay botón de responder');
  html.includes(WAMID) ? bien('lleva el identificador del mensaje que se va a citar') : mal('no lleva el identificador: la cita no llegaría');
  (html.match(/↩︎ Responder/g) || []).length === 1
    ? bien('solo se puede citar el mensaje que sí tiene identificador')
    : mal('ofrece citar mensajes que no se pueden citar: el envío fallaría');
  (html.match(/value="borrar-mensaje"/g) || []).length === CONVERSACION.length
    ? bien('todos los mensajes se pueden quitar del panel')
    : mal('faltan botones de quitar');
  /Meta no permite borrarlo de su lado/.test(html)
    ? bien('avisa de que al cliente le sigue apareciendo')
    : mal('no avisa: se daría por hecho que se borra para los dos, y no es así');

  console.log('\n=== Copiar (lo que hace de "reenviar")');
  (html.match(/⧉ Copiar/g) || []).length === CONVERSACION.length
    ? bien('todos los mensajes se pueden copiar')
    : mal('faltan botones de copiar');
  html.includes('data-copiar="¿Tenéis folios A4?"')
    ? bien('copia el texto del mensaje, listo para pegar')
    : mal('el texto a copiar no llega bien al botón');

  console.log('\n=== Las marcas internas del bot');
  html.includes('PEDIDO:ESPERANDO_NOMBRE')
    ? mal('se enseña "[PEDIDO:ESPERANDO_NOMBRE:...]" en el panel: parece un error del bot')
    : bien('las marcas internas no se enseñan');
  html.includes('Para confirmar que el pedido es tuyo')
    ? bien('pero el mensaje sí se lee entero')
    : mal('al quitar la marca se ha comido el mensaje');
  CONVERSACION.some((m) => String(m.content).startsWith('[PEDIDO:ESPERANDO_NOMBRE'))
    ? bien('en el archivo la marca sigue estando (el bot la necesita para seguir el hilo)')
    : mal('se ha borrado del archivo: el bot perdería el hilo de la conversación');

  console.log('\n=== El hueco que dejaban los botones');
  // La burbuja respeta los espacios tal cual (white-space: pre-wrap), así que
  // los saltos de línea del HTML de los botones se pintaban como espacio de
  // verdad y estiraban la burbuja media pantalla. Visto en real.
  /<div class="msg-acciones">[^\n]*<\/div>/.test(html)
    ? bien('los botones van en una sola línea de HTML, sin espacio de más')
    : mal('el HTML de los botones lleva saltos de línea: estiran la burbuja');
  /\.msg-acciones \{[^}]*white-space: normal/.test(html)
    ? bien('y además el CSS los saca del pre-wrap de la burbuja')
    : mal('sin white-space: normal, cualquier espacio del HTML vuelve a estirar la burbuja');

  console.log('\n=== Responder citando');
  enviados.length = 0;
  await postear(`phone=${TEL}&action=reply&message=${encodeURIComponent('Sí, 4,20 € el paquete')}&citando=${WAMID}`);
  const conCita = enviados.find((e) => e.type === 'text');
  conCita?.context?.message_id === WAMID
    ? bien('se le manda a Meta con context.message_id: llega enganchado al original')
    : mal(`no se manda la cita (context: ${JSON.stringify(conCita?.context)})`);

  enviados.length = 0;
  await postear(`phone=${TEL}&action=reply&message=${encodeURIComponent('Un mensaje suelto')}`);
  const sinCita = enviados.find((e) => e.type === 'text');
  sinCita && !sinCita.context
    ? bien('sin citar nada se manda suelto, como siempre')
    : mal('mete una cita donde no la había');

  console.log('\n=== Quitar un mensaje');
  const antes = CONVERSACION.length;
  const objetivo = CONVERSACION[0];
  const huella = require(path.join(RAIZ, 'netlify/functions/conversation-store.js')).huellaDeMensaje(objetivo);

  await postear(`phone=${TEL}&action=borrar-mensaje&indice=0&huella=${huella}`);
  CONVERSACION.length === antes - 1
    ? bien('se quita del panel')
    : mal('no se ha quitado');
  !CONVERSACION.some((m) => m.content === objetivo.content)
    ? bien('y se quita el que era, no otro')
    : mal('sigue estando: se ha borrado el mensaje equivocado');

  console.log('\n=== Y si la conversación cambió mientras mirabas');
  const cuantos = CONVERSACION.length;
  // Huella de un mensaje que ya no está en esa posición: es lo que pasa cuando
  // llega un mensaje nuevo entre que se pinta la página y se pulsa el botón.
  const fuera = await postear(`phone=${TEL}&action=borrar-mensaje&indice=0&huella=huellaquenoes`);
  CONVERSACION.length === cuantos
    ? bien('no borra nada en vez de borrar el que no era')
    : mal('ha borrado un mensaje distinto del que se pulsó');
  String(fuera.headers?.Location || '').includes('borradoCambiado')
    ? bien('y lo explica en vez de quedarse callado')
    : mal('no avisa de que no ha borrado nada');

  console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
