// «ACEPTADO» NO ES «ENTREGADO» (26/11/2026).
//
//   node scripts/probar-aviso-no-entregado.js
//
// «Cuando un cliente me solicita hablar con un agente me sigue sin llegar el
// mensaje de WhatsApp a mí con la alerta» (propietario).
//
// Lo comprobado antes de tocar el código, que es lo que descartó la
// explicación fácil:
//
//   · `OWNER_ALERT_TEMPLATE` SÍ está puesta (`aviso_escalado`), así que la
//     teoría de «falta la plantilla» era falsa.
//   · `ultimo_fallo` está VACÍO: desde el arreglo del 20/11 no se ha apuntado
//     ni un fallo de aviso.
//   · Al número del dueño le constan entregas hasta el 16/11 y ninguna
//     después: el número es bueno y los avisos llegaban.
//
// Las tres cosas juntas solo encajan de una manera: la API de Meta devuelve
// **200 cuando ACEPTA** el mensaje, no cuando lo entrega. Con ese 200,
// `notifyOwnerByWhatsapp` daba el aviso por bueno y se volvía sin probar el
// texto libre ni apuntar nada; el fallo de entrega llegaba después por el
// webhook, en el array `statuses`… y el código lo tiraba a propósito:
//
//     // "failed" ya se detecta al enviar, con la respuesta de la API.
//     if (estado.status !== 'delivered' && estado.status !== 'read') continue;
//
// Ese comentario era mentira, y es la tercera vez que aparece el mismo patrón
// en esta casa: TENER RESULTADOS NO ES TENER EL RESULTADO.
//
// Esta batería no comprueba que la frase encaje: manda por el webhook el
// `status: failed` tal y como lo manda Meta y exige el EFECTO — que quede
// apuntado para el panel y que al dueño se le reintente por otro camino.
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const SECRETO = 's';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.OWNER_WHATSAPP_NUMBER = '34600999888';

let fallos = 0;
let apuntados = [];
let enviados = [];

const orig = Module.prototype.require;
Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') {
    return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  }
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (to, m) => { enviados.push({ to, m }); return { ok: true }; },
      sendWhatsappTemplate: async (to) => { enviados.push({ to, plantilla: true }); return { ok: true }; },
      uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    return {
      ...m, isConfigured: () => true, claimMessage: async () => true,
      registrarFalloDelBot: async (texto, tel) => { apuntados.push({ texto, tel }); },
      marcarEntrega: async () => {},
      getFichaCliente: async () => ({ presentado: true }), getPausaGlobal: async () => null,
      tomarTurno: async () => null, soltarTurno: async () => {},
    };
  }
  return m;
};
const wh = require(path.join(RAIZ, 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });

// Un acuse de Meta tal y como llega: sin `messages`, solo `statuses`.
const evento = (estados) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: estados } }] }] });
  return {
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}` },
    body,
  };
};

const fallido = (destinatario, code, title) => ({
  id: 'wamid.X', status: 'failed', timestamp: String(Math.floor(Date.now() / 1000)),
  recipient_id: destinatario,
  errors: [{ code, title, error_data: { details: 'detalle que da Meta' } }],
});

async function turno(estados) {
  apuntados = [];
  enviados = [];
  await wh.handler(evento(estados));
}

const ok = (cond, etiqueta, extra) => {
  console.log(`  ${cond ? '✔' : '✗'}  ${etiqueta}${cond || !extra ? '' : `  — ${extra}`}`);
  if (!cond) fallos += 1;
};

(async () => {
  console.log('\n=== El aviso al dueño que Meta aceptó y no entregó\n');

  // EL CASO REAL: la plantilla del aviso, descartada con el 131049.
  await turno([fallido('34600999888', 131049, 'This message was not delivered to maintain healthy ecosystem engagement.')]);

  ok(apuntados.length === 1, 'queda apuntado para que salga en rojo en el panel',
    `se apuntaron ${apuntados.length}`);
  const texto = apuntados[0]?.texto || '';
  ok(/131049/.test(texto), 'con el código que da Meta, no un «error desconocido»', texto);
  ok(/DUE/i.test(texto), 'y diciendo que el que se quedó sin el aviso eres tú', texto);
  ok(/UTILITY/.test(texto), 'y qué hacer con el 131049 (rehacer la plantilla como UTILITY)', texto);

  ok(enviados.length === 1, 'y se reintenta por otro camino', `se mandaron ${enviados.length}`);
  ok(enviados[0]?.to === '34600999888', 'al número del dueño');
  ok(enviados[0] && !enviados[0].plantilla,
    'en TEXTO LIBRE, no otra vez la plantilla que acaba de fallar');
  ok(/pide hablar con una persona/i.test(enviados[0]?.m || ''),
    'y el mensaje dice lo que hace falta saber', enviados[0]?.m);

  // ———————————————————————————————————————————————————————————————
  console.log('\n--- un mensaje a un CLIENTE que no se entrega\n');
  await turno([fallido('34611222333', 470, 'Message failed to send because more than 24 hours have passed')]);
  ok(apuntados.length === 1, 'también se apunta', `se apuntaron ${apuntados.length}`);
  ok(apuntados[0]?.tel === '34611222333', 'con el teléfono del cliente, para encontrarlo en el panel');
  ok(enviados.length === 0, 'pero NO se le reescribe al cliente: eso es cosa de una persona',
    JSON.stringify(enviados));

  // ———————————————————————————————————————————————————————————————
  // LA OTRA MITAD: lo normal no puede generar ruido. El panel en rojo solo
  // sirve si el rojo significa algo.
  console.log('\n=== Y lo que NO puede apuntar nada\n');
  await turno([{ id: 'wamid.Y', status: 'delivered', timestamp: '1700000000', recipient_id: '34611222333' }]);
  ok(apuntados.length === 0, 'un «entregado» no apunta ningún fallo', JSON.stringify(apuntados));
  ok(enviados.length === 0, 'ni manda nada');

  await turno([{ id: 'wamid.Z', status: 'read', timestamp: '1700000000', recipient_id: '34611222333' }]);
  ok(apuntados.length === 0, 'un «leído» tampoco');

  await turno([{ id: 'wamid.W', status: 'sent', timestamp: '1700000000', recipient_id: '34611222333' }]);
  ok(apuntados.length === 0, 'y un «enviado» tampoco (que es justo el que engañaba)');

  // Un fallo sin detalles no puede tumbar el webhook: Meta no siempre manda
  // `errors`, y aquí lo que no puede pasar es quedarse sin registrar nada.
  await turno([{ id: 'wamid.V', status: 'failed', timestamp: '1700000000', recipient_id: '34611222333' }]);
  ok(apuntados.length === 1, 'un fallo sin motivo se apunta igual', JSON.stringify(apuntados));

  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
