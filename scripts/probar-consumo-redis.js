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
      getEstadoEntrega: async () => { comandos.push('GET entrega'); return {}; },
      markAsViewed: async () => { comandos.push('SET viewed'); },
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
  const detalleLista = comandos.slice();

  // La CONVERSACIÓN abierta también se refresca sola (cada 30 s), así que su
  // coste cuenta igual. Va aparte porque el intervalo es distinto y porque es
  // la vista que se deja abierta mientras se atiende a alguien.
  comandos = [];
  await conv.handler({ httpMethod: 'GET', queryStringParameters: { phone: telefonos[0] }, headers: { cookie } });
  const porHilo = comandos.length;

  // El peor caso realista de un día de trabajo: 8 h con el panel a la vista.
  // La lista refresca cada 2 min; la conversación, cada 30 s. Se suman como si
  // se tuvieran las dos abiertas todo ese rato, que es pasarse a propósito.
  const HORAS = 8;
  const listaDia = porCarga * ((HORAS * 3600) / 120);
  const hiloDia = porHilo * ((HORAS * 3600) / 30);
  const alDia = listaDia + hiloDia;

  console.log(`Conversaciones simuladas: ${CONVERSACIONES}`);
  console.log(`\nComandos por carga de la LISTA: ${porCarga}`);
  detalleLista.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));
  console.log(`\nComandos por carga de una CONVERSACIÓN: ${porHilo}`);
  comandos.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));

  console.log(`\nPeor caso, ${HORAS} h al día con las dos vistas abiertas:`);
  console.log(`   lista        (cada 2 min): ${Math.round(listaDia).toLocaleString('es-ES')} comandos/día`);
  console.log(`   conversación (cada 30 s) : ${Math.round(hiloDia).toLocaleString('es-ES')} comandos/día`);
  console.log(`   TOTAL                    : ${Math.round(alDia).toLocaleString('es-ES')} comandos/día`);
  console.log(`\nEl cupo de ${TOPE_MENSUAL.toLocaleString('es-ES')} daría para ${(TOPE_MENSUAL / alDia).toFixed(0)} días así.`);

  // El fallo real: 4 comandos por conversación y recarga cada 30 s sin mirar si
  // la pestaña se ve.
  const antes = 4 + 3 + 4 * CONVERSACIONES;
  const antesDia = antes * ((24 * 60 * 60) / 30);
  console.log(`\nAntes: ${antes} comandos por carga, recargando siempre → ${antesDia.toLocaleString('es-ES')}/día`);
  console.log(`       (cupo agotado en ${(TOPE_MENSUAL / antesDia).toFixed(1)} días)`);
  console.log(`Ahora: ${porCarga} en la lista y ${porHilo} en la conversación → mejora de ${(antesDia / alDia).toFixed(0)}x`);

  // El umbral vigila las DOS vistas. La de la conversación importa especialmente
  // porque refresca cada 30 s: lo que ahí cueste, se multiplica por 960 al día.
  const dentro = porCarga <= 12 && porHilo <= 10;
  if (!dentro) console.log('\n✗ Una carga cuesta más de lo aceptable — revisa qué se ha añadido.');
  process.exit(dentro ? 0 : 1);
})();
