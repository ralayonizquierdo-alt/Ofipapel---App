// EL BOT QUE QUEDÓ EN RECIBIR MERCANCÍA.
//
//   node scripts/probar-compromisos.js
//
// LA CONVERSACIÓN REAL (29/10/2026):
//
//   cliente: "Buenos días Rober!!"
//   bot:     "¡Hola! Soy el asistente virtual de Ofipapel..."
//   cliente: "Film negro te mando?"
//   bot:     "Claro, mándamelo y vemos qué es 👍"
//   cliente: "El transparente te lo mando la próxima semana"
//   bot:     "Vale, sin problema. Cuando lo tengas, me lo pasas y te digo si lo vendemos 👍"
//
// No era un cliente preguntando: era alguien OFRECIENDO mercancía. El bot la
// aceptó en nombre de Ofipapel, quedó citado para recibir un material que nadie
// espera y prometió una decisión —"te digo si lo vendemos"— que no puede tomar
// ni trasladar a nadie.
//
// POR QUÉ NO BASTA CON PEDÍRSELO AL PROMPT (y por eso esto es una red, no una
// frase más): todas las reglas del prompt dan por hecho que quien escribe es un
// cliente que PREGUNTA. Cuando quien escribe OFRECE, no hay ninguna regla que
// le aplique y la IA hace lo que hace por defecto — ser simpática y decir que
// sí. La regla se ha añadido igualmente, pero la red es la que no depende de
// que la IA la lea.
//
// LA MITAD QUE MÁS IMPORTA de esta prueba es la segunda: que la red NO se lleve
// por delante el trabajo normal del bot. Pedir una foto o el número de pedido
// es lo que hace todos los días, y una red que escale esas conversaciones a una
// persona sería peor que el fallo que arregla.
const assert = require('assert');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const {
  prometeUnCompromiso,
  compromisoInfo,
  buildAiSystemPrompt,
} = require(path.join(RAIZ, 'netlify/functions/whatsapp-agent-config.js'));

let fallos = 0;
const comprobar = (etiqueta, fn) => {
  try {
    fn();
    console.log(`OK   ${etiqueta}`);
  } catch (err) {
    fallos += 1;
    console.log(`MAL  ${etiqueta}\n     ${err.message.split('\n')[0]}`);
  }
};

const salta = (texto) => assert.strictEqual(prometeUnCompromiso(texto), true, `NO saltó: "${texto}"`);
const pasa = (texto) => assert.strictEqual(prometeUnCompromiso(texto), false, `saltó de más: "${texto}"`);

console.log('=== Las dos frases reales del 29/10/2026\n');

comprobar('"Claro, mándamelo y vemos qué es 👍"', () => {
  salta('Claro, mándamelo y vemos qué es 👍');
});

comprobar('"Cuando lo tengas, me lo pasas y te digo si lo vendemos 👍"', () => {
  salta('Vale, sin problema. Cuando lo tengas, me lo pasas y te digo si lo vendemos 👍');
});

console.log('\n=== Las mismas promesas, dichas de otra forma\n');

comprobar('prometer una decisión comercial', () => {
  salta('Te confirmo si nos interesa en cuanto lo vea.');
  salta('Te aviso si lo vendemos.');
  salta('Te digo si nos sirve, sin problema.');
  salta('Te comentaré si encaja con lo que llevamos.');
});

comprobar('quedar en valorarlo', () => {
  salta('Mándanos la información y valoramos si nos interesa.');
  salta('Lo estudiamos y te decimos si nos interesa.');
  salta('Pásate cuando quieras y vemos qué es.');
  salta('Estudiamos tu propuesta con calma.');
});

comprobar('citarse para recibir género', () => {
  salta('Mándame una muestra y lo miramos.');
  salta('Enséñame tu tarifa, por favor.');
  salta('Envíame el catálogo de precios cuando puedas.');
});

console.log('\n=== Y AQUÍ LO QUE NO PUEDE SALTAR: el trabajo de todos los días\n');

comprobar('pedir una foto NO es un compromiso', () => {
  pasa('Mándame una foto del cartucho y te digo cuál es.');
  pasa('Si me mandas una foto de la impresora, te confirmo la referencia.');
  pasa('Envíame una foto de la etiqueta y lo miramos.');
});

comprobar('pedir el número de pedido NO es un compromiso', () => {
  pasa('Pásame el número de pedido y te digo en qué estado está.');
  pasa('Mándame el número que viene en el email de confirmación.');
  pasa('¿Me pasas el número de pedido? Así te confirmo si ya ha salido.');
  pasa('Cuando lo tengas, me lo pasas y te digo en qué estado está.');
});

comprobar('el presupuesto de material escolar NO es un compromiso', () => {
  // "material" se dejó fuera de la red justo por esto.
  pasa('Mándame la lista del material y te preparamos el presupuesto.');
  pasa('Envíame la lista del colegio y te decimos el precio.');
});

comprobar('confirmar un producto que SÍ tenemos NO es un compromiso', () => {
  pasa('Sí, lo vendemos: son 4,66€ + IGIC.');
  pasa('Te confirmo que lo tenemos en la tienda de La Laguna.');
  pasa('Vemos que tienes un pedido en curso.');
});

comprobar('lo normal del día a día tampoco', () => {
  pasa('¿Qué estás buscando exactamente?');
  pasa('Te digo si lo tenemos en cuanto me digas la referencia.');
  pasa('');
  pasa(null);
});

console.log('\n=== Qué se contesta en su lugar\n');

comprobar('no disimula: deja claro que no lo lleva el bot', () => {
  const es = compromisoInfo('es');
  assert.ok(/no lo llevo yo/i.test(es), es);
  assert.ok(!prometeUnCompromiso(es), 'la propia respuesta no puede disparar la red');
  // Y no repite «una persona del equipo», que es lo que dice ya la pregunta
  // del escalado que va pegada detrás.
  assert.ok(!/persona del equipo/i.test(es), `queda repetitivo: "${es}"`);
  const en = compromisoInfo('en');
  assert.ok(/handle/i.test(en), en);
  assert.strictEqual(compromisoInfo(), es, 'sin idioma, español');
});

comprobar('el prompt también se lo dice a la IA', () => {
  // La red es lo que no depende de que la IA lea nada; la regla es para que
  // sepa qué hacer en vez de improvisar.
  const prompt = buildAiSystemPrompt();
  assert.ok(/no eres quien decide/i.test(prompt), 'falta la regla en el prompt');
  assert.ok(/proveedores/i.test(prompt), 'la regla no nombra a quien ofrece');
});

// ---------------------------------------------------------------------------
// El recorrido entero por el webhook: que al cliente NO le llegue la promesa.
//
// Detectar la frase no sirve de nada si luego se manda igual. Aquí se le hace
// decir a la IA exactamente lo que dijo el 29/10 y se mira qué sale por el otro
// lado.
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const Module = require('module');

const SECRETO = 's';
process.env.WHATSAPP_APP_SECRET = SECRETO;

let log = [];
const escenario = { respuestaDeLaIA: '' };

const orig = Module.prototype.require;
Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (t, m) => { log.push({ t: 'respuesta', m }); return { ok: true }; },
      sendWhatsappTemplate: async () => ({ ok: true }), uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './whatsapp-agent-core') {
    return {
      ...m,
      notifyOwner: async () => {},
      getHistory: async () => [],
      appendToHistory: async (f, u, a) => { log.push({ t: 'guardado', m: a }); },
      appendCustomerMessage: async () => {}, isBotPaused: async () => false, pauseBot: async () => {},
      askClaude: async () => escenario.respuestaDeLaIA,
    };
  }
  if (p === './conversation-store') {
    return {
      ...m, isConfigured: () => true, claimMessage: async () => true,
      getFichaCliente: async () => ({ presentado: true }), getPausaGlobal: async () => null,
      marcarPresentado: async () => {}, listarNotasNegocio: async () => [],
      registrarPedidoVerificado: async () => {}, tomarFotosPendientes: async () => [],
      appendCustomerMessage: async () => {},
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
  return { httpMethod: 'POST', headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}` }, body };
};

const loDicho = () => log.filter((l) => l.t === 'respuesta' || l.t === 'botones').map((l) => String(l.m)).join(' | ');

async function caso(etiqueta, mensajeDelCliente, respuestaDeLaIA, revisar) {
  log = [];
  escenario.respuestaDeLaIA = respuestaDeLaIA;
  await wh.handler(ev(mensajeDelCliente));
  console.log(`=== ${etiqueta}`);
  log.forEach((l) => console.log(`   [${l.t}] ${String(l.m).replace(/\n/g, ' ⏎ ').slice(0, 140)}`));
  try {
    revisar();
    console.log('    ✔\n');
  } catch (err) {
    fallos += 1;
    console.log(`    ✗ ${err.message.split('\n')[0]}\n`);
  }
}

(async () => {
  console.log('\n=== El recorrido entero\n');

  await caso(
    'El comercial ofrece film negro',
    'Film negro te mando?',
    'Claro, mándamelo y vemos qué es 👍',
    () => {
      assert.ok(!/m[áa]ndamelo/i.test(loDicho()), 'LE LLEGÓ LA PROMESA AL CLIENTE');
      assert.ok(log.some((l) => l.t === 'botones'), 'tenía que ofrecerle una persona');
      assert.ok(/persona del equipo/i.test(loDicho()), loDicho());
    }
  );

  await caso(
    'Y la segunda frase, la de la semana que viene',
    'El transparente te lo mando la próxima semana',
    'Vale, sin problema. Cuando lo tengas, me lo pasas y te digo si lo vendemos 👍',
    () => {
      assert.ok(!/lo vendemos/i.test(loDicho()), 'LE PROMETIÓ UNA DECISIÓN COMERCIAL');
      assert.ok(log.some((l) => l.t === 'botones'), 'tenía que ofrecerle una persona');
    }
  );

  // Y la otra mitad: una conversación normal no se escala a una persona.
  await caso(
    'Un cliente normal preguntando por su pedido',
    '¿Cómo va mi pedido?',
    'Pásame el número de pedido y te digo en qué estado está.',
    () => {
      assert.ok(/n[úu]mero de pedido/i.test(loDicho()), 'se perdió la respuesta buena');
      assert.ok(!log.some((l) => l.t === 'botones'), 'ESCALÓ A UNA PERSONA SIN MOTIVO');
    }
  );

  console.log(fallos === 0 ? '✔ Sin fallos' : `✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
