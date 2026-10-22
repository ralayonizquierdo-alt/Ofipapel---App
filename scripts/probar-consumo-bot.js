// ¿Cuántos comandos de Upstash cuesta atender UN mensaje de cliente?
//
//   node scripts/probar-consumo-bot.js
//
// Complemento de scripts/probar-consumo-redis.js, que mide el PANEL. Este mide
// el BOT, que es el gasto que nadie controla: depende de cuántos clientes
// escriban, no de si alguien deja una pestaña abierta.
//
// Importa porque el plan de Upstash tiene un tope (500.000 comandos al mes en
// el gratuito) y porque, en el de pago, cada comando se factura. Un cambio que
// añada dos lecturas por mensaje no se nota en una conversación de prueba y sí
// en la factura de fin de mes. Aquí sí se ve.
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

const TOPE_MENSUAL = 500000;
const MAXIMO_POR_MENSAJE = 12; // margen sobre los 7 actuales

const SECRETO = 'secreto-de-prueba';
process.env.WHATSAPP_APP_SECRET = SECRETO;

let comandos = [];

Module.prototype.require = function (p) {
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async () => ({ ok: true }), sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    // Se envuelve el módulo real: así la cuenta sigue valiendo aunque cambie
    // por dentro, y una función nueva que toque Redis aparece sola aquí.
    const tocanRedis = [
      'loadConversation', 'pushMessages', 'appendMessages', 'appendCustomerMessage',
      'appendBotReply', 'appendAgentMessage', 'listConversationPhones', 'pauseBot',
      'isBotPaused', 'getFichaCliente', 'actualizarFichaCliente', 'guardarNombreWhatsapp',
      'marcarPresentado', 'claimMessage', 'getPausaGlobal', 'marcarEntrega', 'getAvisoPausa',
      'marcarAvisoPausa', 'leerAliasBusqueda', 'getEstadoEntrega',
      // La foto que espera a su pregunta: el guardado solo ocurre con fotos,
      // pero la recogida se intenta en CADA mensaje de texto, así que cuenta.
      'guardarFotoPendiente', 'tomarFotosPendientes',
    ];
    const envuelto = { ...m, isConfigured: () => true };
    for (const f of tocanRedis) {
      envuelto[f] = async () => {
        comandos.push(f);
        if (f === 'claimMessage') return true;              // mensaje nuevo, no repetido
        if (f === 'loadConversation') return [];
        if (f === 'getFichaCliente') return { presentado: true };
        if (f === 'isBotPaused') return false;
        if (f === 'tomarFotosPendientes') return [];
        return null;
      };
    }
    return envuelto;
  }
  // La IA y el catálogo no tocan Upstash; se anulan para no llamar por red.
  if (p === './whatsapp-agent-core') return { ...m, askClaude: async () => 'respuesta' };
  if (p === './whatsapp-catalogo') {
    return { ...m, construirContextoCatalogo: async () => ({ productContext: null, contextoConsumibles: null, impresoras: [], fallo: false }) };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

// Nada de esto toca Upstash, pero sí decide por qué camino va el mensaje: una
// foto que no se puede bajar ni leer se queda en "te paso con una persona" y
// no mediría el gasto del camino nuevo, que es el que interesa.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
process.env.WHATSAPP_TOKEN = 'token';
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('api.anthropic.com')) {
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'SE VE: cartucho de tinta\nTEXTO: HP 305XL\nBUSCAR: si' }] }) };
  }
  if (u.includes('graph.facebook.com/v20.0/')) {
    return { ok: true, json: async () => ({ url: 'https://lookaside.meta/x', mime_type: 'image/jpeg', file_size: PNG.length }) };
  }
  if (u.includes('lookaside')) {
    return { ok: true, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) };
  }
  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

// `texto` puede ser la frase del cliente o, para lo que no es texto (una foto),
// el mensaje de Meta ya montado.
const evento = (texto) => {
  const mensaje = typeof texto === 'string' ? { type: 'text', text: { body: texto } } : texto;
  const body = JSON.stringify({
    entry: [{ changes: [{ value: {
      messages: [{ from: '34600555111', id: 'wamid.' + Math.random(), ...mensaje }],
      contacts: [{ profile: { name: 'Cliente' } }],
    } }] }],
  });
  return {
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex') },
    body,
  };
};

const CASOS = [
  ['pregunta de FAQ (horario)', '¿A qué hora abrís?'],
  ['consulta de producto', '¿Tenéis el 305XL?'],
  ['saludo suelto', 'Hola'],
  ['problema de cuenta (escala)', 'No recuerdo mi contraseña'],
  ['cliente molesto (escala)', 'Esto es una estafa'],
  // Una foto dejó de ser un callejón sin salida el 19/10/2026: ahora se lee y
  // se contesta, así que pasa por el mismo camino que una consulta de producto
  // (historial, ficha, notas) y ya no es el mensaje más baratito de atender.
  ['foto de un producto', { type: 'image', image: { id: '1', caption: '¿Tenéis este?' } }],
];

(async () => {
  let peor = 0;
  let total = 0;
  for (const [etiqueta, texto] of CASOS) {
    comandos = [];
    await wh.handler(evento(texto));
    peor = Math.max(peor, comandos.length);
    total += comandos.length;
    console.log(`${String(comandos.length).padStart(3)} comandos  ${etiqueta}`);
  }

  const media = total / CASOS.length;
  console.log(`\nMedia: ${media.toFixed(1)} comandos por mensaje  ·  peor caso: ${peor}`);
  console.log('\nA distintos volúmenes:');
  for (const msgs of [50, 200, 500]) {
    const mes = media * msgs * 30;
    const pct = ((mes / TOPE_MENSUAL) * 100).toFixed(0);
    console.log(`  ${String(msgs).padStart(3)} mensajes/día → ${Math.round(mes).toLocaleString('es-ES').padStart(7)} comandos/mes (${pct}% del cupo gratuito)`);
  }

  const dentro = peor <= MAXIMO_POR_MENSAJE;
  console.log(dentro ? '\n✔ Dentro de lo aceptable' : `\n✗ Un mensaje cuesta ${peor} comandos (máximo ${MAXIMO_POR_MENSAJE}) — revisa qué se ha añadido.`);
  process.exit(dentro ? 0 : 1);
})();
