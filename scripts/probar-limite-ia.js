// EL LÍMITE A LA IA: QUE NO COJA EL MANDO DONDE NO HACE FALTA.
//
//   node scripts/probar-limite-ia.js
//
// «¿Tenemos atajados ya la manera de que la IA deje de contestar cuando no se
// la necesita?» (propietario, 16/11/2026). La respuesta, medida con
// `sondeo-bot.js --quien-contesta`, era que no: la IA escribía 106 de 220
// respuestas. Y lo que decidió por dónde empezar fue la segunda medición:
//
//   IA honesta    53 respuestas →  0 avisos
//   IA mentirosa  53 respuestas → 32 avisos (60 %)
//   las reglas    57 respuestas →  4 avisos EN LOS DOS MODOS
//
// O sea: una respuesta de la IA vale lo que valga el modelo ese día; una de
// una regla es la misma hoy y dentro de un año. Por eso se le quita el mando
// en los sitios donde no aporta nada, empezando por dos (decisión del
// propietario, 17/11/2026, «las dos, en ese orden»).
//
// Esta batería comprueba los dos, y el sondeo NO puede hacerlo: pregunta cada
// mensaje por separado, sin historial, y una pregunta de seguimiento sin hilo
// no es una pregunta de seguimiento.
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const SECRETO = 's';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WOOCOMMERCE_CONSUMER_KEY = 'k';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 's';
process.env.OWNER_WHATSAPP_NUMBER = '34600999888';

let fallos = 0;
let log = [];
let vecesQueHablóLaIA = 0;

const escenario = { productos: [], historial: [] };

const orig = Module.prototype.require;
Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') {
    return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  }
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (t, m) => { log.push({ t: 'respuesta', m }); return { ok: true }; },
      sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}),
      sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './woocommerce-client') {
    return {
      ...m,
      isConfigured: () => true,
      buscarEnCatalogo: async () => ({ productos: escenario.productos, fallo: false }),
      searchCategories: async () => [],
    };
  }
  if (p === './whatsapp-agent-core') {
    return {
      ...m,
      notifyOwner: async () => { log.push({ t: 'aviso-al-dueño' }); },
      getHistory: async () => escenario.historial || [],
      appendToHistory: async (f, u, a) => { log.push({ t: 'guardado', m: a }); },
      appendCustomerMessage: async () => {},
      isBotPaused: async () => false,
      pauseBot: async () => { log.push({ t: 'bot-en-pausa' }); },
      // Si esto se llama, la IA ha cogido el mando. Es lo que se mide.
      askClaude: async () => { vecesQueHablóLaIA += 1; return 'lo que sea que diga la IA'; },
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
    if (b.type === 'interactive') log.push({ t: 'botones', m: b.interactive?.body?.text });
  } catch { /* no es JSON */ }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
};

const ev = (texto) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ from: '34600777222', id: `wamid.${Math.random()}`, type: 'text', text: { body: texto } }],
    contacts: [{ profile: { name: 'Cliente' } }],
  } }] }] });
  return {
    httpMethod: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}` },
    body,
  };
};

const dicho = () => log.filter((l) => l.t === 'respuesta' || l.t === 'botones').map((l) => l.m).join(' ⏎ ');

async function caso(etiqueta, texto, revisar) {
  log = [];
  vecesQueHablóLaIA = 0;
  await wh.handler(ev(texto));
  console.log(`\n=== ${etiqueta}`);
  console.log(`    «${texto}»`);
  console.log(`    ${(dicho() || '(nada)').slice(0, 170)}`);
  console.log(`    la IA habló: ${vecesQueHablóLaIA} ${vecesQueHablóLaIA ? 'vez/veces' : '(ninguna)'}`);
  try { revisar(); console.log('    ✔'); }
  catch (err) { fallos += 1; console.log(`    ✗ ${err.message.split('\n')[0]}`); }
}

(async () => {
  console.log('\n──────── 1. UNA INCIDENCIA VA A UNA PERSONA, NO A LA IA\n');
  console.log('El bot no tiene NI UN DATO sobre garantías, plazos de devolución');
  console.log('ni quién paga el porte. Cada vez que contestaba, la IA se estaba');
  console.log('inventando una condición de venta.');

  for (const texto of [
    'el papel que me mandasteis viene roto',
    'me habéis enviado el toner equivocado',
    'quiero devolver una silla',
    'Hice un pedido ayer y no me ha llegado nada',
    'la plastificadora que compré no funciona',
  ]) {
    await caso('incidencia', texto, () => {
      assert.strictEqual(vecesQueHablóLaIA, 0, 'la IA cogió el mando en una incidencia');
      assert.ok(/una persona del equipo/i.test(dicho()), 'no pasó con una persona');
      assert.ok(log.some((l) => l.t === 'aviso-al-dueño'), 'no avisó al equipo');
      assert.ok(log.some((l) => l.t === 'bot-en-pausa'), 'no se apartó para que conteste la persona');
    });
  }

  console.log('\n──────── …y lo que NO es una incidencia sigue su camino\n');
  // Si esto se pasara de listo, cada pregunta normal acabaría en una persona y
  // el equipo se comería el bot entero. Es el coste que el propietario aceptó
  // y hay que mantenerlo acotado.
  escenario.productos = [];
  for (const texto of [
    '¿a qué hora abrís los sábados?',
    '¿hacéis fotocopias en color?',
  ]) {
    await caso('no es incidencia', texto, () => {
      assert.ok(!/una persona del equipo/i.test(dicho()), 'mandó a una persona una pregunta normal');
    });
  }

  // ──────── LO QUE QUEDA POR HACER: LA PREGUNTA DE SEGUIMIENTO.
  //
  // Era el segundo recorte acordado (propietario, 17/11/2026) y NO está hecho,
  // a propósito. Al intentarlo salió el muro: `cuantoCuadra` mide qué
  // porcentaje de las palabras DEL CLIENTE aparecen en el nombre del producto,
  // así que al heredar del hilo la frase entera —que es lo que hace falta para
  // saber de qué habla «Si existen, ¿cuánto cuestan?»— el parecido BAJA en vez
  // de subir: dos palabras que casan entre nueve es un 22 %, y hace falta 60 %.
  //
  // O sea que la medida de parecido está hecha para un mensaje suelto y hay que
  // rehacerla para que juzgue solo con las palabras de producto. Eso no es un
  // ajuste, y forzarlo aquí dejaría pasar cosas que no tienen nada que ver —el
  // fallo que se intentaba arreglar—. Cuando se haga, las comprobaciones van
  // aquí: con el hilo delante contesta el catálogo con su precio, y si lo que
  // devuelve la web no cuadra NO se contesta.

  escenario.historial = [];
  console.log(fallos === 0 ? '\n✔ Sin fallos\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
