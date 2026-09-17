// La lista de clientes que se perdieron mientras el bot estuvo mudo.
//
//   node scripts/probar-perdidos.js
//
// Del 10 al 17 de septiembre de 2026 el bot reventaba al atender los mensajes
// de TEXTO. No los contestaba ni los guardaba, pero sí quedó la ficha de quien
// escribía por PRIMERA vez (se escribe en la primera línea del webhook, antes
// del punto donde reventaba). Esta vista los rescata para poder escribirles.
//
// Ojo con el "de texto", que es lo que más confunde al mirar la lista: las
// fotos, los audios, los botones y los mensajes de las conversaciones en pausa
// se atienden ANTES de ese punto, así que siguieron llegando al panel con
// normalidad. Hubo clientes que escribieron esos días y sí se vieron.
//
// Lo que se comprueba aquí es justo lo que haría que la lista fuera inútil o,
// peor, engañosa:
//   - que no se cuele nadie de fuera del tramo de fechas,
//   - que no se pierda nadie de dentro,
//   - que no salga quien SÍ tiene conversación en el panel (mandarle una
//     disculpa por un mensaje que sí se leyó queda peor que no mandar nada),
//   - que una ficha corrupta no tumbe el listado entero,
//   - que el recorrido de la base se haga con SCAN (KEYS bloquea el servidor)
//     y que los valores se pidan en bloque, no de uno en uno.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://ejemplo.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba';

const DENTRO = Date.UTC(2026, 8, 12, 11, 0); // 12 de septiembre: en mitad del fallo
const ANTES = Date.UTC(2026, 8, 1, 11, 0);
const DESPUES = Date.UTC(2026, 8, 20, 11, 0);

// Lo que habría en la base. Las claves que no empiezan por "cliente:" están a
// propósito: el SCAN debe filtrarlas con MATCH y no traerlas.
const BASE = {
  'cliente:34600000001': { nombreWhatsapp: 'Lucía', primerContacto: DENTRO, ultimoContacto: DENTRO },
  'cliente:34600000002': { nombreWhatsapp: 'Taller Paco', primerContacto: DENTRO + 3600000 },
  'cliente:34600000003': { nombreWhatsapp: 'Antiguo', primerContacto: ANTES, ultimoContacto: DENTRO },
  'cliente:34600000004': { nombreWhatsapp: 'Reciente', primerContacto: DESPUES },
  'cliente:34600000005': 'esto no es json {{{',
  'cliente:34600000006': { primerContacto: DENTRO + 7200000 }, // sin nombre: sigue valiendo, el número es lo que importa
  'conv:34600000001': '[]',
};

const comandos = [];
let estricto = true;

Module.prototype.require = function (p) {
  const m = orig.apply(this, arguments);
  return m;
};

global.fetch = async (url, opts) => {
  const args = JSON.parse(opts.body);
  comandos.push(args[0]);
  const [cmd] = args;

  if (cmd === 'SCAN') {
    const patron = args[3];
    if (patron !== 'cliente:*') throw new Error('el SCAN debe filtrar por cliente:*, no traerse la base entera');
    const claves = Object.keys(BASE).filter((k) => k.startsWith('cliente:'));
    // Se devuelve en dos vueltas a propósito: si el código no siguiera el
    // cursor, se dejaría la mitad de los clientes fuera sin avisar.
    const cursor = args[1];
    const resultado = cursor === '0'
      ? ['7', claves.slice(0, 3)]
      : ['0', claves.slice(3)];
    return { ok: true, json: async () => ({ result: resultado }) };
  }

  // Quién tiene conversación de verdad en el panel. 34600000002 la tiene: el
  // fallo no afectaba a fotos, audios ni botones, así que hubo clientes que sí
  // se vieron aunque su ficha se creara esos días.
  if (cmd === 'SMEMBERS') {
    return { ok: true, json: async () => ({ result: ['34600000002'] }) };
  }

  if (cmd === 'MGET') {
    const valores = args.slice(1).map((k) => {
      const v = BASE[k];
      return v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);
    });
    return { ok: true, json: async () => ({ result: valores }) };
  }

  // Durante la comprobación del listado, cualquier otro comando es un fallo: se
  // quiere saber EXACTAMENTE cómo se recorre la base. Al pintar las páginas ya
  // no, porque el panel hace sus lecturas normales (pausa, ficha, vistas) que
  // no son asunto de esta prueba.
  if (estricto) throw new Error(`comando inesperado al listar: ${cmd}`);
  return { ok: true, json: async () => ({ result: null }) };
};

const store = require(path.join(RAIZ, 'netlify/functions/conversation-store.js'));
Module.prototype.require = orig;

// El panel se carga aparte, con el envío a WhatsApp anulado (aquí no se manda
// nada de verdad) pero con conversation-store REAL, para que la vista lea los
// mismos datos que acaba de comprobar la primera mitad de esta prueba.
function cargarPanel() {
  Module.prototype.require = function (p) {
    if (p === './whatsapp-send') {
      return {
        sendWhatsappMessage: async () => ({ ok: true }), sendWhatsappTemplate: async () => ({ ok: true }),
        uploadWhatsappMedia: async () => ({}), sendWhatsappMedia: async () => ({}),
        getBusinessProfile: async () => ({ ok: true, perfil: {} }), getPhoneNumberStatus: async () => ({ ok: true, numero: {} }),
      };
    }
    const m = orig.apply(this, arguments);
    if (p === './conversation-store') {
      return { ...m, getPanelPassword: async () => null, loadConversation: async () => [], getEstadoEntrega: async () => ({}) };
    }
    return m;
  };
  const panel = require(path.join(RAIZ, 'netlify/functions/conversations.js'));
  Module.prototype.require = orig;
  return panel;
}

(async () => {
  let fallos = 0;
  const mal = (msg) => { fallos++; console.log('  MAL  ' + msg); };
  const bien = (msg) => console.log('  OK   ' + msg);

  const desde = Date.UTC(2026, 8, 10, 9, 20);
  const hasta = Date.UTC(2026, 8, 17, 9, 56);
  const clientes = await store.listarFichasPorPrimerContacto(desde, hasta);
  const numeros = clientes.map((c) => c.phone);

  console.log('\n=== Quién sale en la lista');
  for (const esperado of ['34600000001', '34600000002', '34600000006']) {
    numeros.includes(esperado)
      ? bien(`sale ${esperado}, que escribió por primera vez durante el fallo`)
      : mal(`FALTA ${esperado}: escribió durante el fallo y se queda sin rescatar`);
  }
  numeros.includes('34600000003')
    ? mal('se cuela 34600000003, que ya era cliente de antes')
    : bien('no se cuela el cliente antiguo');
  numeros.includes('34600000004')
    ? mal('se cuela 34600000004, que escribió después del arreglo')
    : bien('no se cuela el que escribió después');
  numeros.includes('34600000005')
    ? mal('se cuela una ficha corrupta')
    : bien('la ficha corrupta se salta sin tumbar el listado');

  console.log('\n=== Cómo se consulta la base');
  comandos.includes('KEYS')
    ? mal('usa KEYS, que bloquea el servidor entero mientras recorre')
    : bien('no usa KEYS');
  comandos.filter((c) => c === 'SCAN').length >= 2
    ? bien('sigue el cursor del SCAN hasta el final (no se deja claves fuera)')
    : mal('no sigue el cursor del SCAN: se dejaría clientes sin listar');
  const gets = comandos.filter((c) => c === 'GET').length;
  gets === 0
    ? bien('pide los valores en bloque con MGET, no uno a uno')
    : mal(`hace ${gets} GET sueltos: con muchos clientes eso es un comando por cliente`);

  console.log('\n=== Qué se enseña de cada uno');
  const lucia = clientes.find((c) => c.phone === '34600000001');
  lucia?.nombre === 'Lucía' ? bien('se conserva el nombre de WhatsApp') : mal('se pierde el nombre');
  const sinNombre = clientes.find((c) => c.phone === '34600000006');
  sinNombre ? bien('un cliente sin nombre sigue saliendo (el número es lo que vale)') : mal('se descarta al que no tiene nombre');
  clientes[0]?.phone === '34600000006'
    ? bien('ordenados del más reciente al más antiguo')
    : mal('no están ordenados por fecha descendente');

  // LA PÁGINA, no solo los datos.
  //
  // La primera versión de esta vista sacaba la lista correctamente y no servía
  // para nada: no tenía botón de enviar plantilla. Y en el hilo del cliente
  // tampoco salía, porque el panel escondía esa barra entera cuando no había
  // ningún mensaje guardado — que es justamente el caso de TODOS estos
  // clientes. La lista estaba bien y el trabajo no se podía hacer.
  console.log('\n=== La página sirve para algo');
  estricto = false;
  process.env.DASHBOARD_PASSWORD = 'prueba';
  process.env.CUSTOMER_TEMPLATE = 'respuesta_consulta';

  const conv = cargarPanel();
  const login = await conv.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=login&password=prueba',
    queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];

  const pagina = await conv.handler({
    httpMethod: 'GET', queryStringParameters: { vista: 'perdidos' }, headers: { cookie },
  });
  const html = pagina.body || '';

  html.includes('Enviar plantilla')
    ? bien('la lista trae el botón de enviar plantilla')
    : mal('la lista NO trae botón de enviar plantilla: no se puede hacer nada con ella');
  // Dos, no tres: 34600000002 se ha filtrado por tener ya conversación.
  (html.match(/name="action" value="plantilla"/g) || []).length === 2
    ? bien('un botón por cliente listado, no uno suelto para todos')
    : mal('no hay un botón por cada cliente de la lista');
  html.includes('name="volver" value="perdidos"')
    ? bien('tras enviar se vuelve a la lista, no a una conversación vacía')
    : mal('tras enviar se saldría de la lista y habría que volver a mano en cada envío');
  html.includes('34600000001')
    ? bien('los números salen en la página')
    : mal('los números no llegan a pintarse');

  // Lo que pidió Roberto al ver la lista: que no aparezca gente a la que sí
  // llegó a ver. Mandarles una plantilla de disculpa por un mensaje que sí se
  // leyó queda peor que no mandar nada.
  html.includes('34600000002')
    ? mal('sale 34600000002, que SÍ tiene conversación en el panel: se le pediría perdón por un mensaje que sí se vio')
    : bien('no sale quien ya tiene conversación en el panel');
  /se ha quitado 1 número que sí tiene|han quitado \d+ números/i.test(html)
    ? bien('la página dice cuántos se han quitado y por qué')
    : mal('quita números en silencio, sin explicar por qué faltan');

  // El hilo de uno de estos clientes: está vacío, y aun así tiene que dejar
  // mandar la plantilla.
  const hilo = await conv.handler({
    httpMethod: 'GET', queryStringParameters: { phone: '34600000001' }, headers: { cookie },
  });
  (hilo.body || '').includes('Enviar plantilla')
    ? bien('el hilo vacío de un cliente perdido también deja mandar la plantilla')
    : mal('en el hilo vacío no hay forma de mandar la plantilla');

  console.log(fallos === 0 ? '\n✔ Sin fallos' : `\n✗ ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
