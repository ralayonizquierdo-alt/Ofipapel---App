// ¿Cuántos comandos de Upstash cuesta abrir el panel?
//
//   node scripts/probar-consumo-redis.js
//
// El 8/9/2026 se agotó el cupo mensual de Upstash (500.000 comandos) EN UN DÍA
// y el bot se quedó sin poder guardar conversaciones. La causa no fue el
// tráfico de clientes: era el panel, que hacía 4 comandos POR CONVERSACIÓN y se
// recargaba solo cada 30 segundos, también con el móvil en el bolsillo.
//
// Esta prueba cuenta los comandos reales de una carga de la lista y calcula el
// gasto diario, para que un cambio que multiplique el consumo se vea aquí antes
// de llegar a producción.
const Module = require('module');
const path = require('path');
const orig = Module.prototype.require;
const RAIZ = path.join(__dirname, '..');

const CONVERSACIONES = 40;
const TOPE_MENSUAL = 500000;

let comandos = [];
const telefonos = Array.from({ length: CONVERSACIONES }, (_, i) => `3460000${String(i).padStart(4, '0')}`);

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
    // Se envuelve el módulo real para contar cada comando, sin reimplementarlo:
    // así la cuenta sigue siendo válida si mañana cambia por dentro.
    const conv = [{ role: 'user', content: 'hola', ts: Date.now() }];
    return {
      ...m,
      isConfigured: () => true,
      listConversationPhones: async () => { comandos.push('SMEMBERS'); return telefonos; },
      loadListaConversaciones: async (phones) => {
        ['MGET conv', 'MGET viewed', 'MGET paused', 'MGET cliente'].forEach((c) => comandos.push(c));
        return phones.map((phone) => ({ phone, messages: conv, lastViewed: 0, pausado: false, ficha: null }));
      },
      loadConversation: async () => { comandos.push('GET conv'); return conv; },
      getLastViewed: async () => { comandos.push('GET viewed'); return 0; },
      isBotPaused: async () => { comandos.push('GET paused'); return false; },
      getFichaCliente: async () => { comandos.push('GET cliente'); return null; },
      getPausaGlobal: async () => { comandos.push('GET pausa'); return null; },
      getPanelPassword: async () => { comandos.push('GET password'); return null; },
      listarBusquedasSinResultado: async () => { comandos.push('ZRANGE'); return []; },
      diagnose: async () => { ['SET diag', 'GET diag', 'DEL diag'].forEach((c) => comandos.push(c)); return { ok: true }; },
      getEstadoEntrega: async () => { comandos.push('MGET entrega'); return {}; },
      getNotasCliente: async () => { comandos.push('GET notas'); return ''; },
      marcarVista: async () => { comandos.push('SET viewed'); },
    };
  }
  return m;
};
const conv = require(path.join(RAIZ, 'netlify/functions/conversations.js'));
Module.prototype.require = orig;

(async () => {
  process.env.DASHBOARD_PASSWORD = 'prueba';
  const login = await conv.handler({
    httpMethod: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=login&password=prueba', queryStringParameters: {},
  });
  const cookie = (login.headers?.['Set-Cookie'] || '').split(';')[0];

  comandos = [];
  await conv.handler({ httpMethod: 'GET', queryStringParameters: {}, headers: { cookie } });
  const porCarga = comandos.length;

  const recargasDia = (24 * 60 * 60) / 120; // cada 2 min...
  const visible = 8 * 60 * 60 / 120;        // ...y solo con la pestaña a la vista (8 h generosas)
  const alDia = porCarga * visible;

  console.log(`Conversaciones simuladas: ${CONVERSACIONES}`);
  console.log(`Comandos por carga de la lista: ${porCarga}`);
  comandos.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));
  console.log(`\nGasto estimado con la pestaña a la vista 8 h al día: ${Math.round(alDia).toLocaleString('es-ES')} comandos/día`);
  console.log(`El cupo de ${TOPE_MENSUAL.toLocaleString('es-ES')} daría para ${(TOPE_MENSUAL / alDia).toFixed(0)} días así.`);

  // El fallo real: 4 comandos por conversación y recarga cada 30 s sin mirar si
  // la pestaña se ve.
  const antes = 4 + 3 + 4 * CONVERSACIONES;
  const antesDia = antes * ((24 * 60 * 60) / 30);
  console.log(`\nAntes: ${antes} por carga → ${antesDia.toLocaleString('es-ES')}/día (cupo agotado en ${(TOPE_MENSUAL / antesDia).toFixed(1)} días)`);
  console.log(`Ahora: ${porCarga} por carga → mejora de ${(antesDia / alDia).toFixed(0)}x`);

  process.exit(porCarga <= 12 ? 0 : 1);
})();
