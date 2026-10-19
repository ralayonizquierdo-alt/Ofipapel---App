// LEER LA FOTO DEL CLIENTE: qué pasa con cada clase de foto.
//
//   node scripts/probar-vision.js
//
// Dos mitades, y las dos han hecho falta:
//
//   1. Interpretar lo que devuelve la lectura. El formato se le pide al modelo
//      pero no se le puede exigir, así que hay que aguantar que venga torcido
//      sin dar por buena una lectura que no se entiende.
//   2. El recorrido entero por el webhook de verdad, con Meta, el almacén, el
//      catálogo y la IA simulados. Es donde está el riesgo: una foto no trae
//      palabras del cliente con las que comprobar nada, así que si la respuesta
//      saliera de la lectura y no del catálogo, un error de lectura se le
//      serviría al cliente como un hecho. Lo que se comprueba aquí es que eso
//      NO pasa: sin datos de catálogo no sale respuesta, sale una persona.
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const vision = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-vision.js'));
const {
  interpretarLectura, textoParaBuscar, comoSeLeDiceALaIA, sePuedeLeer, MARCA_FOTO,
  paraElPanel, lecturaDelHistorial, ultimaFotoDelHistorial,
} = vision;
const { pideLaFotoOtraVez } = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-agent-config.js'));

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

console.log('=== Interpretar la lectura\n');

comprobar('lectura bien formada', () => {
  const r = interpretarLectura('SE VE: cartucho de tinta negro\nTEXTO: HP, 305XL, Black\nBUSCAR: si');
  assert.strictEqual(r.seVe, 'cartucho de tinta negro');
  assert.strictEqual(r.textoLeido, 'HP, 305XL, Black');
  assert.strictEqual(r.buscar, true);
});

comprobar('sin texto legible en la foto', () => {
  const r = interpretarLectura('SE VE: archivador de palanca azul\nTEXTO: nada\nBUSCAR: sí');
  assert.strictEqual(r.textoLeido, '', 'un "nada" no es texto leído');
});

// Una foto de una persona, de un sitio o de una factura no es una consulta de
// producto. Si se tratara como tal, el bot se pondría a buscar "documento" en
// el catálogo y contestaría cualquier cosa.
comprobar('foto que no es de un producto', () => {
  const r = interpretarLectura('SE VE: una factura en papel\nTEXTO: Ofipapel S.L., 621370\nBUSCAR: no');
  assert.strictEqual(r.buscar, false);
});

comprobar('sin la etiqueta SE VE se usa la primera línea con contenido', () => {
  const r = interpretarLectura('Tóner Brother TN-2420\nTEXTO: TN-2420');
  assert.strictEqual(r.seVe, 'Tóner Brother TN-2420');
  assert.strictEqual(r.textoLeido, 'TN-2420');
});

// ANTE LA DUDA, SE BUSCA. Equivocarse hacia "buscar" cuesta una consulta que no
// encuentra nada, y de ahí se sale solo; equivocarse hacia "no" deja sin
// contestar una consulta de producto que sí lo era.
comprobar('sin línea BUSCAR se busca igual', () => {
  assert.strictEqual(interpretarLectura('SE VE: grapadora metálica').buscar, true);
});

comprobar('una lectura que no se entiende se descarta', () => {
  assert.strictEqual(interpretarLectura(''), null);
  assert.strictEqual(interpretarLectura('   '), null);
});

console.log('\n=== Con qué palabras se busca\n');

// La referencia PRIMERO: es lo que la foto aporta y el cliente no suele
// escribir, y es con diferencia el mejor término de búsqueda.
comprobar('la referencia leída va delante de la descripción', () => {
  const q = textoParaBuscar({ seVe: 'cartucho de tinta negro', textoLeido: 'HP 305XL' }, '¿Tenéis este?');
  assert.ok(q.indexOf('HP 305XL') < q.indexOf('cartucho'), `la referencia no va primero: ${q}`);
  assert.ok(q.includes('¿Tenéis este?'), 'el pie de foto se tira, y a veces trae el dato que falta');
});

comprobar('sin referencia se busca por la descripción', () => {
  assert.strictEqual(textoParaBuscar({ seVe: 'mochila escolar', textoLeido: '' }), 'mochila escolar');
});

console.log('\n=== Cómo se le cuenta la foto a la IA\n');

comprobar('lleva la marca, la lectura y el pie de foto', () => {
  const t = comoSeLeDiceALaIA({ seVe: 'caja registradora', textoLeido: 'SAM4S' }, 'esta es la mía');
  assert.ok(t.startsWith(MARCA_FOTO), 'sin la marca, el prompt no sabe que es una lectura');
  assert.ok(t.includes('puede estar mal'), 'la IA tiene que saber que la lectura es falible');
  assert.ok(t.includes('SAM4S') && t.includes('esta es la mía'));
});

comprobar('a un cliente inglés se le contesta en inglés', () => {
  const t = comoSeLeDiceALaIA({ seVe: 'notebook', textoLeido: '' }, '', 'en');
  assert.ok(/ingl[eé]s/i.test(t), 'el texto lo escribimos en español: hay que decirle el idioma');
});

// El prompt de la IA tiene que hablar de la MISMA marca que pone quien lee la
// foto. Con dos copias escritas a mano, eso dura hasta que alguien toque una.
comprobar('el prompt de la IA explica esa misma marca', () => {
  const { buildAiSystemPrompt } = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-agent-config.js'));
  const prompt = buildAiSystemPrompt(null, null, [], 'hola');
  assert.ok(prompt.includes(MARCA_FOTO), 'el prompt no menciona la marca de las fotos');
  assert.ok(/no puedes ver/i.test(prompt) || /NO puedes/.test(prompt), 'sigue haciendo falta decir qué NO ve (audio, vídeo, PDF)');
});

console.log('\n=== La memoria de la foto\n');

// EN WHATSAPP LA FOTO Y LA PREGUNTA SON DOS MENSAJES.
//
// Primero la imagen, y un segundo después "¿y este papel?". Para el webhook son
// dos turnos, y en el segundo ya no hay ninguna foto en la mano: solo lo que
// quedó apuntado del primero. Por eso lo que se escribe en el panel y lo que se
// lee de vuelta tienen que ser la misma cosa — si una mitad cambia y la otra
// no, la memoria se pierde en silencio y el bot vuelve a pedir la foto.
comprobar('lo escrito en el panel se puede volver a leer', () => {
  const original = { seVe: 'paquete de folios A4', textoLeido: 'MATTIO, 80gr' };
  const vuelta = lecturaDelHistorial(`[El cliente envió una foto]\n${paraElPanel(original)}`);
  assert.strictEqual(vuelta.seVe, original.seVe);
  assert.strictEqual(vuelta.textoLeido, original.textoLeido);
});

comprobar('también cuando no se leyó ningún texto', () => {
  const vuelta = lecturaDelHistorial(paraElPanel({ seVe: 'mochila escolar', textoLeido: '' }));
  assert.strictEqual(vuelta.seVe, 'mochila escolar');
  assert.strictEqual(vuelta.textoLeido, '');
});

comprobar('un mensaje normal no tiene foto detrás', () => {
  assert.strictEqual(lecturaDelHistorial('¿A qué hora abrís?'), null);
  assert.strictEqual(ultimaFotoDelHistorial([{ role: 'user', content: 'hola' }]), null);
});

comprobar('se coge la foto más reciente, no la primera', () => {
  const historial = [
    { role: 'user', content: paraElPanel({ seVe: 'grapadora', textoLeido: '' }) },
    { role: 'assistant', content: 'te cuento' },
    { role: 'user', content: paraElPanel({ seVe: 'cartucho de tinta', textoLeido: 'HP 305XL' }) },
    { role: 'assistant', content: 'te cuento' },
    { role: 'user', content: 'Y este papel?' },
  ];
  assert.strictEqual(ultimaFotoDelHistorial(historial).textoLeido, 'HP 305XL');
});

// Una foto de hace media conversación no tiene nada que ver con lo que se
// pregunta ahora.
comprobar('una foto vieja ya no cuenta', () => {
  const historial = [
    { role: 'user', content: paraElPanel({ seVe: 'cartucho', textoLeido: 'HP 305XL' }) },
    ...Array.from({ length: 5 }, () => ({ role: 'user', content: 'otra cosa' })),
  ];
  assert.strictEqual(ultimaFotoDelHistorial(historial), null);
});

console.log('\n=== "No me llega la foto" cuando sí llegó\n');

// Las frases son las de la conversación real del 19/10/2026, copiadas tal cual.
for (const frase of [
  'No veo una foto adjunta en ese mensaje. ¿Puedes enviarla de nuevo? Así te confirmo si lo tenemos.',
  '¡Hola! no me llega la foto. ¿Puedes intentar enviarla de nuevo? Una vez la vea, te digo si tenemos la caja que buscas.',
  'No me ha llegado la imagen, ¿me la mandas otra vez?',
  'La foto no me llega, inténtalo de nuevo.',
]) {
  comprobar(`se reconoce: "${frase.slice(0, 42)}…"`, () => {
    assert.ok(pideLaFotoOtraVez(frase));
  });
}

// Y que no se lleve por delante una respuesta normal: si el bot dice algo de
// una foto sin pedirla, no hay nada que corregir.
for (const frase of [
  'Sí, mándamela: la miro y te busco lo que se vea en ella.',
  'Por la foto parece un HP 305XL. ¿Te lo confirmo?',
  'No tenemos ese modelo, pero sí uno equivalente.',
  'Te mando una foto del producto en cuanto la tenga.',
]) {
  comprobar(`no se confunde con: "${frase.slice(0, 42)}…"`, () => {
    assert.ok(!pideLaFotoOtraVez(frase));
  });
}

console.log('\n=== Qué NO se intenta leer\n');

comprobar('un PDF no se lee: es otro problema', () => {
  assert.strictEqual(sePuedeLeer('application/pdf', 1000), false);
});

comprobar('una imagen enorme no se lee', () => {
  // En base64 crece un tercio y la API la rechazaría: mejor el camino de
  // siempre que un error en vez de una respuesta.
  assert.strictEqual(sePuedeLeer('image/jpeg', 5 * 1024 * 1024), false);
  assert.strictEqual(sePuedeLeer('image/jpeg', 300 * 1024), true);
});

// ---------------------------------------------------------------------------
// El recorrido entero, por el webhook de verdad.
// ---------------------------------------------------------------------------

const SECRETO = 's';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.WHATSAPP_TOKEN = 'token';
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// Lo que devuelve la lectura de la foto, la respuesta de la IA y lo que trae el
// catálogo: se cambian desde cada caso.
const escenario = {
  lectura: 'SE VE: cartucho de tinta negro\nTEXTO: HP 305XL\nBUSCAR: si',
  respuestaIA: 'El HP 305XL negro lo tenemos a 24,95 €. ¿Te lo preparo?',
  catalogo: { productContext: 'Resultado de búsqueda EN TIEMPO REAL: HP 305XL negro — 24,95 €', fallo: false },
  pausado: false,
  historial: [],
};
let log = [];
let buscadoCon = null;
let lecturasPedidas = 0;

const orig = Module.prototype.require;
Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') {
    return {
      connectLambda: (e) => {
        if (!e) throw new Error('connectLambda recibió undefined');
      },
      getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }),
    };
  }
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (t, m) => {
        log.push({ t: 'respuesta', m });
        return { ok: true };
      },
      sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}),
      sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './whatsapp-catalogo') {
    return {
      ...m,
      construirContextoCatalogo: async ({ text }) => {
        buscadoCon = text;
        return {
          productContext: escenario.catalogo.productContext,
          contextoConsumibles: null,
          impresoras: [],
          fallo: escenario.catalogo.fallo,
          consultado: true,
        };
      },
    };
  }
  if (p === './whatsapp-agent-core') {
    return {
      ...m,
      notifyOwner: async () => {},
      notifyOwnerByWhatsapp: async () => {},
      getHistory: async () => escenario.historial || [],
      appendToHistory: async (f, u) => {
        log.push({ t: 'guardado en el panel', m: u });
      },
      appendCustomerMessage: async (f, u) => {
        log.push({ t: 'guardado sin contestar', m: u });
      },
      isBotPaused: async () => escenario.pausado,
      pauseBot: async () => {},
      askClaude: async (texto) => {
        log.push({ t: 'se le pregunta a la IA', m: texto });
        return typeof escenario.respuestaIA === 'function' ? escenario.respuestaIA(texto) : escenario.respuestaIA;
      },
    };
  }
  if (p === './conversation-store') {
    return {
      ...m,
      isConfigured: () => true,
      claimMessage: async () => true,
      getFichaCliente: async () => ({ presentado: true }),
      getPausaGlobal: async () => null,
      marcarPresentado: async () => {},
      listarNotasNegocio: async () => [],
      appendCustomerMessage: async (f, u) => {
        log.push({ t: 'guardado sin contestar', m: u });
      },
    };
  }
  return m;
};
const wh = require(path.join(__dirname, '..', 'netlify/functions/whatsapp-webhook.js'));
Module.prototype.require = orig;

global.fetch = async (url, opts) => {
  const u = String(url);
  try {
    const b = JSON.parse(opts?.body || '{}');
    if (b.type === 'interactive') log.push({ t: 'botones', m: b.interactive?.body?.text });
  } catch { /* no es JSON, da igual */ }
  if (u.includes('api.anthropic.com')) {
    lecturasPedidas += 1;
    if (escenario.lectura === null) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: escenario.lectura }] }) };
  }
  if (u.includes('graph.facebook.com/v20.0/')) {
    return {
      ok: true,
      json: async () => ({ url: 'https://lookaside.meta/x', mime_type: 'image/jpeg', file_size: PNG.length }),
    };
  }
  if (u.includes('lookaside')) {
    return { ok: true, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) };
  }
  return { ok: true, json: async () => ({}), text: async () => '{}' };
};

const ev = (msg) => {
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from: '34600777222', id: `wamid.${Math.random()}`, ...msg }],
              contacts: [{ profile: { name: 'Cliente' } }],
            },
          },
        ],
      },
    ],
  });
  return {
    httpMethod: 'POST',
    headers: {
      'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}`,
    },
    body,
  };
};

const foto = (caption) => ({ type: 'image', image: { id: String(Math.random()), ...(caption ? { caption } : {}) } });
const tiene = (t) => log.some((l) => l.t === t);
const texto = (t) => (log.find((l) => l.t === t) || {}).m || '';

const texto_ = (t) => ({ type: 'text', text: { body: t } });

async function caso(etiqueta, msg, revisar) {
  log = [];
  buscadoCon = null;
  lecturasPedidas = 0;
  await wh.handler(ev(msg));
  console.log(`=== ${etiqueta}`);
  log.forEach((l) => console.log(`   [${l.t}] ${String(l.m).replace(/\n/g, ' ⏎ ').slice(0, 160)}`));
  try {
    revisar();
    console.log('    ✔');
  } catch (err) {
    fallos += 1;
    console.log(`    ✗ ${err.message.split('\n')[0]}`);
  }
  console.log();
}

(async () => {
  console.log('\n=== El recorrido entero\n');

  // EL CASO QUE JUSTIFICA TODO ESTO: la foto de la caja del cartucho con un
  // "¿tenéis este?". Hasta el 19/10/2026 se contestaba "no puedo leer una foto
  // por aquí" y se le ofrecía una persona; de madrugada, eso es un cliente
  // esperando hasta las nueve.
  await caso('Foto de un cartucho, con pregunta', foto('¿Tenéis este?'), () => {
    assert.ok(tiene('respuesta'), 'no se le contestó a la foto');
    assert.ok(!tiene('botones'), 'se le ofreció una persona habiendo respuesta');
    assert.ok(/305XL/.test(buscadoCon || ''), `se buscó sin la referencia de la foto: ${buscadoCon}`);
    assert.ok(texto('se le pregunta a la IA').startsWith(MARCA_FOTO), 'la IA no sabe que viene de una foto');
    // En el panel tiene que quedar QUÉ leyó: es lo que explica una respuesta
    // rara sin tener que adivinar si falló la lectura o la búsqueda.
    assert.ok(/ve en la foto/.test(texto('guardado en el panel')), 'el panel no dice qué vio el bot en la foto');
  });

  // UNA FOTO QUE NO ES DE UN PRODUCTO no se busca en el catálogo. Si se
  // buscara, el bot se pondría a hablar de lo primero que encontrara.
  escenario.lectura = 'SE VE: una factura en papel\nTEXTO: 621370\nBUSCAR: no';
  await caso('Foto de una factura (no es un producto)', foto(), () => {
    assert.ok(tiene('botones'), 'una foto que no es de un producto tiene que ir a una persona');
    assert.strictEqual(buscadoCon, null, 'no se debe buscar en el catálogo lo que no es un artículo');
    assert.ok(/he visto la foto/i.test(texto('botones')), 'decir "no puedo leer una foto" sería mentir: sí se leyó');
  });

  // SIN DATOS DE CATÁLOGO NO SE CONFIRMA NADA, y con una foto menos que nunca:
  // el cliente no ha escrito nada con lo que comprobar la lectura. Es la red de
  // seguridad del precio inventado (12,95 € por unos folios de 3,94 €, visto en
  // real el 16/10/2026), aplicada igual que con el texto.
  escenario.lectura = 'SE VE: paquete de folios A4\nTEXTO: nada\nBUSCAR: si';
  escenario.catalogo = { productContext: null, fallo: false };
  escenario.respuestaIA = 'Sí, lo tenemos: son 12,95 € + IGIC.';
  await caso('La IA se inventa un precio y no hay catálogo', foto(), () => {
    assert.ok(!tiene('respuesta'), 'se le mandó un precio que no sale de ningún sitio');
    assert.ok(tiene('botones'), 'sin nada de lo que fiarse, toca una persona');
  });

  // LA WEB NO CONTESTÓ. Aquí no se puede reintentar (el webhook tiene ~10 s),
  // y contestar a una foto sin catálogo es justo lo que no se puede hacer.
  escenario.catalogo = { productContext: null, fallo: true };
  escenario.respuestaIA = 'Claro, el 305XL lo tenemos.';
  await caso('La web no contesta', foto('¿este lo tienes?'), () => {
    assert.ok(!tiene('respuesta'), 'se contestó sin haber podido mirar el catálogo');
    assert.ok(tiene('botones'));
  });

  // LA LECTURA FALLA (sin clave, Meta lento, respuesta ininteligible): se
  // vuelve al comportamiento de siempre, palabra por palabra. Esto no puede
  // romperse nunca: es la red de abajo de todo.
  escenario.lectura = null;
  escenario.catalogo = { productContext: 'algo', fallo: false };
  await caso('No se pudo leer la foto', foto(), () => {
    assert.ok(tiene('botones'), 'sin lectura hay que ofrecer una persona, como siempre');
    assert.ok(/no puedo leer una foto/i.test(texto('botones')), 'aquí sí toca decir que no se puede leer');
    assert.ok(tiene('guardado en el panel'), 'la foto tiene que llegar al panel igual');
  });

  // CON EL BOT EN PAUSA NO SE GASTA NI UNA LECTURA. Está atendiendo una
  // persona, que ya tiene la foto delante: leerla sería pagar por nada.
  escenario.lectura = 'SE VE: cartucho\nTEXTO: HP 305XL\nBUSCAR: si';
  escenario.pausado = true;
  await caso('Foto con el bot en pausa', foto('mira esto'), () => {
    assert.strictEqual(lecturasPedidas, 0, 'se leyó la foto con el bot en pausa: dinero tirado');
    assert.ok(!tiene('respuesta') && !tiene('botones'), 'el bot habla por encima de quien atiende');
    assert.ok(tiene('guardado sin contestar'), 'la foto no llega al panel');
  });
  escenario.pausado = false;

  // UN AUDIO NO SE LEE. Solo las fotos: un audio, un vídeo o un PDF siguen
  // yendo a una persona, y no se gasta una llamada en intentarlo.
  await caso('Un audio', { type: 'audio', audio: { id: '9' } }, () => {
    assert.strictEqual(lecturasPedidas, 0, 'se intentó leer un audio como si fuera una foto');
    assert.ok(tiene('botones'));
    assert.ok(/no puedo leer un audio/i.test(texto('botones')));
  });

  // UN STICKER TAMPOCO, y este sí es una imagen (un webp), así que había que
  // dejarlo fuera a mano. Un sticker es un emoji grande: nadie pregunta por un
  // producto con un sticker, y leerlo sería pagar por nada. Además es un gesto,
  // no una pregunta: se archiva y el bot se calla, como con una reacción.
  await caso('Un sticker', { type: 'sticker', sticker: { id: '10' } }, () => {
    assert.strictEqual(lecturasPedidas, 0, 'se gastó una lectura en un sticker');
    assert.ok(!tiene('botones') && !tiene('respuesta'), 'un sticker no se contesta');
    assert.ok(tiene('guardado sin contestar'), 'el sticker tiene que verse en el panel');
  });

  // LA FOTO Y LA PREGUNTA SON DOS MENSAJES, Y LA SEGUNDA NO PUEDE DECIR QUE LA
  // PRIMERA NO LLEGÓ.
  //
  // Caso real del 19/10/2026, el mismo día de estrenarlo: el cliente mandó la
  // captura del papel MATTIO y el bot contestó perfecto — precio, descuentos y
  // enlace. Un segundo después llegó su "Y este papel?" por el camino del
  // texto, sin ninguna imagen encima, y el bot le soltó "No veo una foto
  // adjunta en ese mensaje. ¿Puedes enviarla de nuevo?".
  const elPanelDiceLaFoto = {
    role: 'user',
    content: `[El cliente envió una foto]\n${paraElPanel({ seVe: 'paquete de folios A4', textoLeido: 'MATTIO, 80gr' })}`,
  };
  escenario.historial = [elPanelDiceLaFoto, { role: 'assistant', content: 'Ese es el papel que buscas.' }];
  escenario.catalogo = { productContext: 'Resultado EN TIEMPO REAL: PAPEL Fotocopia A-4 80gr MATTIO — 3,94 €', fallo: false };
  escenario.respuestaIA = (t) =>
    t.startsWith(MARCA_FOTO)
      ? 'Ese es el MATTIO A4 de 80gr, a 3,94 € + IGIC el paquete de 500 hojas.'
      : 'No veo una foto adjunta en ese mensaje. ¿Puedes enviarla de nuevo? Así te confirmo si lo tenemos.';
  await caso('Pregunta por la foto que mandó hace un segundo', texto_('Y este papel?'), () => {
    const contestado = texto('respuesta');
    assert.ok(contestado, 'se quedó sin respuesta');
    assert.ok(!pideLaFotoOtraVez(contestado), `le volvió a pedir la foto: "${contestado}"`);
    assert.ok(/MATTIO/.test(contestado), 'no contestó por la foto que ya tenía apuntada');
    assert.ok(/MATTIO/.test(buscadoCon || ''), `no buscó con lo que vio en la foto: ${buscadoCon}`);
  });

  // Si no se puede respaldar nada, una persona. Pero NUNCA volver a pedir la
  // foto que ya tenemos.
  escenario.catalogo = { productContext: null, fallo: false };
  escenario.respuestaIA = (t) =>
    t.startsWith(MARCA_FOTO)
      ? 'Sí, ese papel lo tenemos a 12,95 €.'
      : '¡Hola! no me llega la foto. ¿Puedes intentar enviarla de nuevo?';
  await caso('No hay con qué respaldarlo: una persona, no otra foto', texto_('Y este papel?'), () => {
    assert.ok(!tiene('respuesta'), 'mandó un precio sin respaldo');
    assert.ok(tiene('botones'), 'tenía que ofrecer una persona');
    assert.ok(!pideLaFotoOtraVez(texto('botones')), 'le volvió a pedir la foto');
  });

  // Y AL REVÉS: si de verdad no ha llegado ninguna foto, decirlo es correcto.
  // La red no puede tragarse también los casos en los que la IA tiene razón.
  escenario.historial = [];
  escenario.catalogo = { productContext: null, fallo: false };
  escenario.respuestaIA = 'No me llega ninguna foto, ¿puedes enviarla de nuevo?';
  await caso('Habla de una foto que nunca mandó', texto_('¿has visto la foto que te mandé?'), () => {
    assert.ok(tiene('respuesta'), 'se quedó sin contestar');
    assert.strictEqual(
      log.filter((l) => l.t === 'se le pregunta a la IA').length,
      1,
      'intentó rescatar una foto que no existe'
    );
  });
  escenario.historial = [];

  console.log(fallos === 0 ? '✔ Sin fallos' : `✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
