// ¿Cuántas peticiones le hace el bot a ofipapel.net por cada mensaje?
//
//   node scripts/probar-peticiones-web.js
//
// Preocupa por dos motivos distintos, y conviene no mezclarlos:
//
//   1. La web es de Roberto y la paga él. Un bot que la machaque se nota en el
//      hosting antes que en ningún sitio, y encima la protección anti-bots del
//      propio hosting acaba bloqueándonos (ver WHATSAPP_SETUP.md, "Cuando
//      ofipapel.net nos bloquea") — con lo que el bot se queda sin precios.
//   2. Si un día aparecen "muchas peticiones de un bot" en los registros de la
//      web, hay que poder decir con un número si somos nosotros o no.
//
// Por eso esta prueba NO cuenta llamadas a funciones nuestras: cuenta
// peticiones HTTP reales que saldrían hacia ofipapel.net, interceptando fetch
// justo donde se hace. Lo que se mide es lo que vería el servidor de la web.
//
// Y se ejecuta el webhook ENTERO, no el cliente de WooCommerce por su cuenta:
// la mitad del ahorro está en no llegar a consultarlo (una pregunta de horario
// no debe tocar la web), y eso solo se ve con el flujo completo.
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

// Cuántas peticiones a la web se consideran aceptables para UN mensaje.
//
// El peor caso medido hoy son 12, y sale de un mensaje concreto: cuando el
// cliente da el MODELO DE IMPRESORA ("tinta para mi Brother DCP-L2530DW") se
// encadenan dos búsquedas, la de la referencia del consumible (DR-2400) y la de
// su precio, y cada una abre su abanico de variantes. Es caro pero es lo que
// hace que esa pregunta se conteste bien, así que el tope se pone por encima:
// esto vigila que no CREZCA, no pretende que baje.
//
// Importa por la forma, no por el total: 12 peticiones en dos segundos desde la
// misma IP es exactamente el patrón que dispara la protección anti-bots del
// hosting (ver WHATSAPP_SETUP.md, "Cuando ofipapel.net nos bloquea").
const MAXIMO_POR_MENSAJE = 14;

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_de_prueba';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_de_prueba';

let peticiones = [];

Module.prototype.require = function (p) {
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async () => ({ ok: true }), sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  // El catálogo y el cliente de WooCommerce van REALES: son justo lo que se
  // está midiendo. Lo único que se anula es Upstash (que no es la web) y la IA.
  if (p === './conversation-store') {
    return {
      ...m, isConfigured: () => true, claimMessage: async () => true,
      loadConversation: async () => [], appendMessages: async () => {},
      appendCustomerMessage: async () => {}, appendBotReply: async () => {},
      getFichaCliente: async () => ({ presentado: true }), actualizarFichaCliente: async () => {},
      marcarPresentado: async () => {}, isBotPaused: async () => false, pauseBot: async () => {},
      getPausaGlobal: async () => null, guardarNombreWhatsapp: async () => {},
      registrarBusquedaSinResultado: async () => {}, leerAliasBusqueda: async () => null,
      registrarPedidoVerificado: async () => {}, getEstadoEntrega: async () => null,
      marcarEntrega: async () => {}, getAvisoPausa: async () => null, marcarAvisoPausa: async () => {},
    };
  }
  if (p === './whatsapp-agent-core') {
    return {
      ...m, notifyOwner: async () => {}, getHistory: async () => [], appendToHistory: async () => {},
      appendCustomerMessage: async () => {}, isBotPaused: async () => false, pauseBot: async () => {},
      askClaude: async () => 'respuesta',
    };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

// Aquí es donde se cuenta. Todo lo que vaya a ofipapel.net queda anotado con su
// ruta; lo demás (la API de Meta, la función de segundo plano) se ignora, que
// no es de lo que va esto.
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('ofipapel.net')) {
    peticiones.push(u.replace(/^https?:\/\/[^/]+/, '').replace(/consumer_(key|secret)=[^&]*/g, 'consumer_$1=***'));
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => [],
    text: async () => '[]',
  };
};

const evento = (texto) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ from: '34600111222', id: 'wamid.' + Math.random(), type: 'text', text: { body: texto } }],
    contacts: [{ profile: { name: 'Cliente' } }],
  } }] }] });
  return { httpMethod: 'POST', headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex') }, body };
};

// Los dos grupos importan por motivos opuestos: en el primero, CUALQUIER
// petición sobra; en el segundo se acepta consultar, pero no sin medida.
const NO_DEBEN_TOCAR_LA_WEB = [
  '¿A qué hora abrís?',
  '¿Dónde estáis?',
  '¿Cuánto tardáis en entregar un pedido?',
  '¿Dónde puedo encontrar la factura?',
  'Muchas gracias, muy amables',
  'Hola',
];

const CONSULTAS_DE_PRODUCTO = [
  '¿Tenéis el 305XL?',
  '¿Cuánto cuesta el tóner TN-248?',
  'Busco un cuaderno A4',
  'Necesito tinta para mi impresora Brother DCP-L2530DW',
  '¿Hay stock de folios A4?',
];

const CONSULTAS_DE_PEDIDO = [
  '¿Cómo va mi pedido #643539?',
  '643539',
];

async function medir(texto) {
  peticiones = [];
  await wh.handler(evento(texto));
  return peticiones.slice();
}

async function grupo(titulo, mensajes, tope) {
  console.log(`\n=== ${titulo}`);
  let fallos = 0;
  let total = 0;
  for (const texto of mensajes) {
    const hechas = await medir(texto);
    total += hechas.length;
    const mal = hechas.length > tope;
    if (mal) fallos++;
    console.log(`  ${mal ? 'MAL ' : 'OK  '} ${String(hechas.length).padStart(2)} peticiones  «${texto}»`);
    for (const p of hechas) console.log(`         ${p.slice(0, 110)}`);
  }
  console.log(`  media: ${(total / mensajes.length).toFixed(1)} peticiones por mensaje`);
  return { fallos, total, n: mensajes.length };
}

(async () => {
  const a = await grupo('Preguntas que NO van de productos (tope: 0)', NO_DEBEN_TOCAR_LA_WEB, 0);
  const b = await grupo(`Consultas de producto (tope: ${MAXIMO_POR_MENSAJE})`, CONSULTAS_DE_PRODUCTO, MAXIMO_POR_MENSAJE);
  const c = await grupo(`Consultas de pedido (tope: ${MAXIMO_POR_MENSAJE})`, CONSULTAS_DE_PEDIDO, MAXIMO_POR_MENSAJE);

  const mensajes = a.n + b.n + c.n;
  const total = a.total + b.total + c.total;
  const media = total / mensajes;

  // Estas cifras son el TECHO: cuentan como si ninguna búsqueda estuviera
  // cacheada. En la vida real, el resultado de cada búsqueda se guarda una hora
  // y lo comparten todos los clientes, así que la segunda persona que pregunta
  // por los folios A4 esa mañana cuesta CERO peticiones.
  console.log('\nA distintos volúmenes de conversación (sin caché, o sea el techo):');
  for (const porDia of [50, 200, 500]) {
    console.log(`  ${String(porDia).padStart(3)} mensajes/día → ${Math.round(porDia * media).toLocaleString('es-ES')} peticiones/día a ofipapel.net`);
  }

  const fallos = a.fallos + b.fallos + c.fallos;
  console.log(fallos === 0
    ? `\n✔ Media de ${media.toFixed(1)} peticiones por mensaje, dentro de lo aceptable`
    : `\n✗ ${fallos} mensajes se pasan del tope`);
  process.exit(fallos === 0 ? 0 : 1);
})();
