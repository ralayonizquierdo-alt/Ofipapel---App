// EL ESTADO REAL DEL PEDIDO (GeminisWin) — cuentas, plazos y seguridad.
//
//   node scripts/probar-estado-pedido.js
//
// Dos mitades:
//
//   1. Las cuentas: días laborables, la hora de corte de las 13:00 y la
//      caducidad del dato. Son de calendario, se equivocan en silencio y se
//      notan tarde — un cliente al que le prometes el lunes algo que llega el
//      martes no te escribe para corregirte, se enfada.
//
//   2. El recorrido entero por el webhook de verdad, que es donde está lo que
//      no puede fallar NUNCA: que no se consulte el estado de nadie sin haber
//      confirmado antes, contra WooCommerce, que el pedido es suyo.
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const gestion = require(path.join(RAIZ, 'netlify/functions/gestion-pedidos.js'));

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

// Fechas de referencia, en hora de Canarias (que es UTC en invierno).
// 2026-10-19 es LUNES, así que la semana va lunes 19 … viernes 23, sábado 24.
const LUNES = '2026-10-19';
const VIERNES = '2026-10-23';
const SABADO = '2026-10-24';
const DOMINGO = '2026-10-25';

// OJO CON EL CAMBIO DE HORA. En octubre Canarias va en horario de verano
// (UTC+1), así que escribir las horas en UTC las corre sesenta minutos y la
// hora de corte de las 13:00 deja de caer donde uno cree. Aquí se escriben en
// HORA LOCAL de Canarias, que es la que importa: la de la tienda.
const aLas = (dia, hhmm) => new Date(`${dia}T${hhmm}:00+01:00`);   // verano
const aLasInvierno = (dia, hhmm) => new Date(`${dia}T${hhmm}:00Z`); // invierno: Canarias = UTC

console.log('=== Días laborables\n');

comprobar('de lunes a viernes son laborables; el fin de semana no', () => {
  assert.strictEqual(gestion.esLaborable(LUNES), true);
  assert.strictEqual(gestion.esLaborable(VIERNES), true);
  assert.strictEqual(gestion.esLaborable(SABADO), false);
  assert.strictEqual(gestion.esLaborable(DOMINGO), false);
});

comprobar('el siguiente laborable del viernes es el lunes', () => {
  assert.strictEqual(gestion.siguienteLaborable(VIERNES), '2026-10-26');
  assert.strictEqual(gestion.siguienteLaborable(SABADO), '2026-10-26');
  assert.strictEqual(gestion.siguienteLaborable(LUNES), '2026-10-20');
});

comprobar('el laborable anterior al lunes es el viernes', () => {
  assert.strictEqual(gestion.laborableAnterior(LUNES), '2026-10-16');
  assert.strictEqual(gestion.laborableAnterior(SABADO), VIERNES);
  assert.strictEqual(gestion.laborableAnterior('2026-10-21'), '2026-10-20');
});

console.log('\n=== La hora de corte de las 13:00\n');

// "Pedido que llega un día laborable antes de las 13:00 → se factura ese mismo
// día. Después de las 13:00, o en fin de semana → el siguiente día laborable."
comprobar('martes a las 10:00 → se factura ese martes', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLas('2026-10-20', '10:00')), '2026-10-20');
});

comprobar('martes a las 14:00 → se factura el miércoles', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLas('2026-10-20', '14:00')), '2026-10-21');
});

// El caso que te dejaba en evidencia el fin de semana.
comprobar('viernes a las 12:00 → se factura el viernes (entrega el lunes)', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLas(VIERNES, '12:00')), VIERNES);
});

comprobar('viernes a las 14:00 → se factura el LUNES (entrega el martes)', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLas(VIERNES, '14:00')), '2026-10-26');
});

comprobar('sábado y domingo → se facturan el lunes', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLas(SABADO, '11:00')), '2026-10-26');
  assert.strictEqual(gestion.diaDeFacturacion(aLas(DOMINGO, '20:00')), '2026-10-26');
});

// Las 13:00 clavadas son "después": el corte es antes DE las 13:00.
comprobar('a las 13:00 en punto ya es tarde', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLas('2026-10-20', '13:00')), '2026-10-21');
  assert.strictEqual(gestion.diaDeFacturacion(aLas('2026-10-20', '12:59')), '2026-10-20');
});

// EL CAMBIO DE HORA. Esto se cuenta en hora de Canarias, no en UTC, y en
// invierno coinciden pero en verano no. Si alguien "simplifica" esto a UTC, la
// hora de corte se corre una hora media parte del año y nadie se entera hasta
// que un cliente reclama una entrega que se prometió de más.
comprobar('en invierno (Canarias = UTC) el corte sigue en su sitio', () => {
  assert.strictEqual(gestion.diaDeFacturacion(aLasInvierno('2026-01-20', '12:59')), '2026-01-20');
  assert.strictEqual(gestion.diaDeFacturacion(aLasInvierno('2026-01-20', '13:01')), '2026-01-21');
});

comprobar('en verano manda la hora de Canarias, no la UTC', () => {
  // 12:30 UTC en octubre son las 13:30 en Canarias: pasada la hora de corte.
  assert.strictEqual(gestion.diaDeFacturacion(new Date('2026-10-20T12:30:00Z')), '2026-10-21');
  // Y 11:30 UTC son las 12:30: a tiempo.
  assert.strictEqual(gestion.diaDeFacturacion(new Date('2026-10-20T11:30:00Z')), '2026-10-20');
});

console.log('\n=== Caducidad del dato (en días laborables, no en horas)\n');

// El publicador solo corre de lunes a viernes: un dato del viernes por la tarde
// es perfectamente bueno el lunes por la mañana aunque tenga sesenta horas.
comprobar('el viernes por la tarde sirve el lunes por la mañana', () => {
  assert.strictEqual(gestion.caducado(aLas('2026-10-16', '19:00'), aLas(LUNES, '09:00')), false);
});

comprobar('de ayer (laborable) sirve', () => {
  assert.strictEqual(gestion.caducado(aLas('2026-10-20', '14:30'), aLas('2026-10-21', '10:00')), false);
});

// Saltarse una pasada entera sí se detecta.
comprobar('de anteayer ya no sirve', () => {
  assert.strictEqual(gestion.caducado(aLas('2026-10-19', '14:30'), aLas('2026-10-21', '10:00')), true);
});

comprobar('del jueves no sirve el lunes (se saltó el viernes)', () => {
  assert.strictEqual(gestion.caducado(aLas('2026-10-15', '19:00'), aLas(LUNES, '09:00')), true);
});

comprobar('sin fecha, caducado', () => {
  assert.strictEqual(gestion.caducado(null, aLas(LUNES, '09:00')), true);
});

console.log('\n=== Qué se le dice al cliente en cada estado\n');

const frase = (fila, ahora = aLas('2026-10-21', '10:00')) => gestion.fraseDeEstado(fila, ahora, 'es');

comprobar('facturado → el siguiente día laborable, sin fecha concreta', () => {
  const r = frase({ estado: 'facturado', fecha_factura: '2026-10-20' });
  assert.ok(/ya está facturado/i.test(r.texto));
  assert.ok(/siguiente día laborable/i.test(r.texto));
  assert.ok(!r.ofrecerPersona);
  // Nunca una fecha: no tenemos calendario de festivos.
  assert.ok(!/\d{1,2}\/\d{1,2}/.test(r.texto), `no puede dar fechas: ${r.texto}`);
});

comprobar('en reparto, cargado HOY → sale el próximo día laborable', () => {
  const r = frase({ estado: 'en_reparto', fecha_reparto: '2026-10-21' });
  assert.ok(/sale en reparto el próximo día laborable/i.test(r.texto), r.texto);
});

comprobar('en reparto, cargado AYER → está hoy en reparto', () => {
  const r = frase({ estado: 'en_reparto', fecha_reparto: '2026-10-20' });
  assert.ok(/hoy en reparto/i.test(r.texto), r.texto);
});

// Sin fecha de reparto no se anuncia una entrega para hoy que no se sostenga.
comprobar('en reparto sin fecha → lo prudente', () => {
  const r = frase({ estado: 'en_reparto', fecha_reparto: null });
  assert.ok(/próximo día laborable/i.test(r.texto), r.texto);
});

comprobar('entregado → se dice, y queda marcado', () => {
  const r = frase({ estado: 'entregado' });
  assert.ok(/figura como entregado/i.test(r.texto));
  assert.strictEqual(r.entregado, true, 'sin la marca no se puede reaccionar si dice que no lo tiene');
});

comprobar('no entregado → reprogramado y una persona', () => {
  const r = frase({ estado: 'no_entregado' });
  assert.ok(/siguiente reparto/i.test(r.texto));
  assert.strictEqual(r.ofrecerPersona, true);
});

comprobar('incidencia y anulado → una persona', () => {
  assert.strictEqual(frase({ estado: 'incidencia' }).ofrecerPersona, true);
  assert.strictEqual(frase({ estado: 'anulado' }).ofrecerPersona, true);
});

comprobar('recibido a tiempo → se factura hoy', () => {
  const r = frase({ estado: 'recibido', fecha_hora_pedido: aLas('2026-10-21', '09:00').toISOString() },
    aLas('2026-10-21', '11:00'));
  assert.ok(/se facturará hoy/i.test(r.texto), r.texto);
  assert.ok(!r.ofrecerPersona);
});

comprobar('recibido pasado el corte → el próximo día laborable', () => {
  const r = frase({ estado: 'recibido', fecha_hora_pedido: aLas('2026-10-21', '16:00').toISOString() },
    aLas('2026-10-21', '17:00'));
  assert.ok(/próximo día laborable/i.test(r.texto), r.texto);
  assert.ok(!r.ofrecerPersona);
});

// El caso que pediste: entró a tiempo, ya pasaron las 15:00 y sigue sin
// facturar. Ahí no se promete nada.
comprobar('entró a tiempo y a las 17:00 sigue sin facturar → ni plazo ni promesa', () => {
  const r = frase({ estado: 'recibido', fecha_hora_pedido: aLas('2026-10-21', '09:00').toISOString() },
    aLas('2026-10-21', '17:00'));
  assert.strictEqual(r.ofrecerPersona, true);
  assert.ok(!/se facturará/i.test(r.texto), `no puede prometer plazo: ${r.texto}`);
});

comprobar('un pedido de hace tres días sin facturar tampoco promete', () => {
  const r = frase({ estado: 'recibido', fecha_hora_pedido: aLas('2026-10-19', '09:00').toISOString() },
    aLas('2026-10-22', '10:00'));
  assert.strictEqual(r.ofrecerPersona, true);
});

// Un estado que no conocemos no se le enseña al cliente: manda WooCommerce.
comprobar('un estado desconocido se ignora', () => {
  assert.strictEqual(gestion.fraseDeEstado({ estado: 'liquidado' }, new Date(), 'es'), null,
    'liquidado es de GeminisWin (= cobrado) y el bot NO debe entenderlo');
  assert.strictEqual(gestion.fraseDeEstado({ estado: 'vete_a_saber' }, new Date(), 'es'), null);
  assert.strictEqual(gestion.fraseDeEstado(null, new Date(), 'es'), null);
});

comprobar('en inglés también, y escrito a mano', () => {
  const r = gestion.fraseDeEstado({ estado: 'facturado' }, new Date(), 'en');
  assert.ok(/next working day/i.test(r.texto), r.texto);
});

// ---------------------------------------------------------------------------
// El recorrido entero por el webhook.
// ---------------------------------------------------------------------------

const SECRETO = 's';
process.env.WHATSAPP_APP_SECRET = SECRETO;
process.env.SUPABASE_BOT_EMAIL = 'bot@ofipapel.internal';
process.env.SUPABASE_BOT_PASSWORD = 'da-igual-no-se-usa';
process.env.WOOCOMMERCE_CONSUMER_KEY = 'k';
process.env.WOOCOMMERCE_CONSUMER_SECRET = 's';
// Para poder comprobar que el aviso al dueño sale de verdad: sin este número,
// notifyOwnerByWhatsapp se calla y la prueba no vería nada.
const DUENO = '34600999888';
process.env.OWNER_WHATSAPP_NUMBER = DUENO;

let log = [];
let consultasAGestion = [];

const escenario = {
  pedido: { id: 637966, status: 'processing', total: '31.19', date_created: '2026-10-20T09:00:00', date_paid: '2026-10-20T09:00:00',
    billing: { phone: '+34600777222', first_name: 'Ana', last_name: 'Pérez', company: '' } },
  fila: null,
};

const orig = Module.prototype.require;
Module.prototype.require = function (p) {
  if (p === '@netlify/blobs') return { connectLambda: () => {}, getStore: () => ({ set: async () => {}, getWithMetadata: async () => null }) };
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async (t, m) => { log.push({ t: 'respuesta', m, para: t }); return { ok: true }; },
      sendWhatsappTemplate: async () => ({ ok: true }), uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './gestion-pedidos') {
    return {
      ...m,
      estadoDeGestion: async (pedido) => { consultasAGestion.push(String(pedido)); return escenario.fila; },
    };
  }
  if (p === './woocommerce-client') {
    return {
      ...m,
      isConfigured: () => true,
      getOrder: async (id) => (String(id) === String(escenario.pedido.id) ? escenario.pedido : null),
    };
  }
  if (p === './whatsapp-agent-core') {
    return {
      ...m,
      notifyOwner: async () => {},
      getHistory: async () => escenario.historial || [],
      appendToHistory: async (f, u, a) => { log.push({ t: 'guardado', m: a }); },
      appendCustomerMessage: async () => {}, isBotPaused: async () => false, pauseBot: async () => {},
      askClaude: async () => 'respuesta de la IA',
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

const ev = (texto, desde = '34600777222') => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ from: desde, id: `wamid.${Math.random()}`, type: 'text', text: { body: texto } }],
    contacts: [{ profile: { name: 'Cliente' } }],
  } }] }] });
  return { httpMethod: 'POST', headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRETO).update(Buffer.from(body, 'utf8')).digest('hex')}` }, body };
};

const tiene = (t) => log.some((l) => l.t === t);
const texto = (t) => (log.find((l) => l.t === t) || {}).m || '';

async function caso(etiqueta, mensaje, revisar, desde) {
  log = [];
  consultasAGestion = [];
  await wh.handler(ev(mensaje, desde));
  console.log(`=== ${etiqueta}`);
  log.forEach((l) => console.log(`   [${l.t}] ${String(l.m).replace(/\n/g, ' ⏎ ').slice(0, 150)}`));
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

  // LO QUE NO PUEDE FALLAR NUNCA.
  //
  // El teléfono desde el que escribe NO es el del pedido, así que la
  // verificación no ha terminado: se le pide el nombre y NO se consulta el
  // estado de nadie. La tabla de Gestión no lleva nombres a propósito, y por
  // eso la identidad se comprueba siempre contra WooCommerce.
  escenario.fila = { estado: 'entregado', actualizado: new Date().toISOString() };
  await caso('Alguien pregunta por un pedido que no es suyo', '¿qué pasa con el pedido 637966?', () => {
    assert.strictEqual(consultasAGestion.length, 0, 'CONSULTÓ EL ESTADO SIN VERIFICAR DE QUIÉN ES EL PEDIDO');
    assert.ok(/nombre/i.test(texto('respuesta')), 'tenía que pedir el nombre');
  }, '34699000111');

  // EL NÚMERO Y EL NOMBRE EN EL MISMO MENSAJE.
  //
  // Visto en real el 23/10/2026: mandó "PEDIDO 658818 LEMON TREE" y el bot le
  // pidió el nombre que acababa de darle. Tuvo que contestar en mayúsculas —
  // "EL NOMBRE COMERCIAL TE LO PUSE JUSTO AL LADO DEL NÚMERO DE PEDIDO"— y
  // repetirlo en dos mensajes sueltos para que lo cogiera.
  escenario.pedido.billing.company = 'LEMON TREE';
  escenario.fila = { estado: 'facturado', actualizado: new Date().toISOString() };
  await caso('Número y nombre comercial en el mismo mensaje', 'PEDIDO 637966 LEMON TREE', () => {
    assert.ok(!/dime el nombre/i.test(texto('respuesta')), 'le pide un nombre que ya le había dado');
    assert.ok(/ya está facturado/i.test(texto('respuesta')), 'no llegó a dar el estado');
    assert.deepStrictEqual(consultasAGestion, ['637966'], 'no verificó, o verificó mal');
  }, '34699000111');
  escenario.pedido.billing.company = '';

  // Pero un mensaje SIN el nombre sigue pidiéndolo: la verificación no se
  // relaja, solo se intenta un paso antes.
  escenario.fila = { estado: 'facturado', actualizado: new Date().toISOString() };
  await caso('Número suelto desde otro teléfono: sigue pidiendo el nombre', 'el pedido 637966', () => {
    assert.ok(/dime el nombre/i.test(texto('respuesta')), 'dejó de verificar');
    assert.strictEqual(consultasAGestion.length, 0, 'consultó sin verificar');
  }, '34699000111');

  // Con el teléfono del pedido, la verificación está hecha: ahora sí.
  escenario.fila = { estado: 'facturado', fecha_factura: '2026-10-20', actualizado: new Date().toISOString() };
  await caso('El dueño del pedido pregunta: contesta con el estado de Gestión', '¿qué pasa con el pedido 637966?', () => {
    assert.deepStrictEqual(consultasAGestion, ['637966']);
    const r = texto('respuesta');
    assert.ok(/#637966/.test(r), 'falta el nº de pedido (de WooCommerce)');
    assert.ok(/31[.,]19/.test(r), 'falta el importe (de WooCommerce)');
    assert.ok(/ya está facturado/i.test(r), 'falta el estado (de Gestión)');
    // Con el estado real ya no hace falta la coletilla de que el dato puede
    // estar atrasado: esa era la disculpa por no saberlo.
    assert.ok(!/puede tardar en reflejarse/i.test(r), 'sigue disculpándose por no saber el estado');
  });

  // Dato viejo: no se inventa nada, se da lo de la web y se ofrece una persona.
  escenario.fila = { estado: 'facturado', actualizado: '2026-01-01T10:00:00Z' };
  await caso('El dato de Gestión está caducado', '¿qué pasa con el pedido 637966?', () => {
    assert.ok(tiene('botones'), 'con el dato caducado hay que ofrecer una persona');
    assert.ok(!/ya está facturado/i.test(texto('botones')), 'no puede usar un estado caducado');
  });

  // Sin fila, el comportamiento de siempre.
  escenario.fila = null;
  await caso('Ese pedido no está en la tabla', '¿qué pasa con el pedido 637966?', () => {
    assert.ok(tiene('respuesta'), 'tenía que contestar con lo de WooCommerce');
    assert.ok(/#637966/.test(texto('respuesta')));
  });

  // Anulado: mensaje y persona.
  escenario.fila = { estado: 'anulado', actualizado: new Date().toISOString() };
  await caso('Pedido anulado', '¿qué pasa con el pedido 637966?', () => {
    assert.ok(tiene('botones'));
    assert.ok(/anulado/i.test(texto('botones')));
  });

  // Y lo más delicado de todo: dice que no lo ha recibido.
  escenario.fila = { estado: 'entregado', actualizado: new Date().toISOString() };
  escenario.historial = [{ role: 'assistant', content: '[PEDIDO:ENTREGADO]Tu pedido #637966 figura como entregado.', ts: Date.now() }];
  await caso('Figura como entregado y dice que no le ha llegado', 'pues no me ha llegado', () => {
    assert.ok(tiene('botones'), 'esto lo tiene que ver una persona');
    assert.ok(
      log.some((l) => l.t === 'respuesta' && l.para === DUENO),
      'y hay que avisar al dueño: un pedido dado por entregado que no está es un problema'
    );
    // Lo que no vale es repetirle el estado como si nada; tiene que reconocer
    // el problema. (La frase menciona "figura como entregado", pero para
    // decirle justo que si es así y no lo tiene, lo mira alguien.)
    assert.ok(/lo siento/i.test(texto('botones')), 'ni se disculpa');
    assert.ok(/mirarlo una persona/i.test(texto('botones')), 'no lo trata como un problema');
  });
  escenario.historial = [];

  console.log(fallos === 0 ? '✔ Sin fallos' : `✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
