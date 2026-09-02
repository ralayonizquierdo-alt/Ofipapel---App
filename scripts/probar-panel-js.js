// Comprueba que el JavaScript que el panel manda al navegador PARSEA.
//
//   node scripts/probar-panel-js.js
//
// Por qué existe: los scripts del panel viven dentro de plantillas `...` en
// conversations.js, y la plantilla se come las barras invertidas. Un
// `replace(/\//g, '-')` perfectamente válido en el fuente llegaba al navegador
// como `replace(///g, '-')` — error de sintaxis que tumbaba el bloque ENTERO,
// dejando sin funcionar el pegado de imágenes. En el fuente no se ve; solo se
// ve en lo que se sirve, que es justo lo que mira esto.
//
// No prueba que el script haga lo correcto, solo que se puede ejecutar. Es la
// clase de fallo que no da error en el servidor ni se nota leyendo el código.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;

const RAIZ = path.join(__dirname, '..');

Module.prototype.require = function (p) {
  if (p === './whatsapp-send') {
    return {
      sendWhatsappMessage: async () => ({ ok: true }),
      sendWhatsappTemplate: async () => ({ ok: true }),
      uploadWhatsappMedia: async () => ({}),
      sendWhatsappMedia: async () => ({}),
      getBusinessProfile: async () => ({ ok: true, perfil: {} }),
      getPhoneNumberStatus: async () => ({ ok: true, numero: {} }),
    };
  }
  const m = orig.apply(this, arguments);
  if (p === './conversation-store') {
    return {
      ...m,
      isConfigured: () => true,
      loadConversation: async () => [{ role: 'user', content: 'hola', ts: Date.now() }],
      listConversationPhones: async () => ['34600111222'],
      getFichaCliente: async () => ({}),
      isBotPaused: async () => false,
      getEstadoEntrega: async () => ({}),
      getPanelPassword: async () => null,
      getPausaGlobal: async () => null,
      getNotasCliente: async () => '',
      marcarVista: async () => {},
      listarAliasBusqueda: async () => [],
      listarBusquedasSinResultado: async () => [],
    };
  }
  return m;
};
const conv = require(path.join(RAIZ, 'netlify/functions/conversations.js'));
Module.prototype.require = orig;

const VISTAS = [
  ['conversación', { phone: '34600111222' }],
  ['listado', {}],
  ['perfil', { vista: 'perfil' }],
];

(async () => {
  process.env.DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'prueba';
  const login = await conv.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `action=login&password=${process.env.DASHBOARD_PASSWORD}`,
    queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];

  let fallos = 0;
  for (const [nombre, query] of VISTAS) {
    const res = await conv.handler({ httpMethod: 'GET', queryStringParameters: query, headers: { cookie } });
    const bloques = [...(res.body || '').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

    if (bloques.length === 0) {
      console.log(`  —    ${nombre}: sin scripts`);
      continue;
    }
    bloques.forEach((codigo, i) => {
      try {
        // new Function compila sin ejecutar: es exactamente lo que hace el
        // navegador al leer el <script>.
        new Function(codigo); // eslint-disable-line no-new-func
        console.log(`  OK   ${nombre} · script ${i + 1} (${codigo.length} chars)`);
      } catch (err) {
        fallos++;
        console.log(`  MAL  ${nombre} · script ${i + 1}: ${err.message}`);
      }
    });
  }

  console.log(fallos === 0 ? '\n✔ Todo el JavaScript del panel parsea' : `\n✗ ${fallos} bloques con error de sintaxis`);
  process.exit(fallos === 0 ? 0 : 1);
})();
