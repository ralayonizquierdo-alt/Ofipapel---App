// Resumen PÚBLICO del día del bot de WhatsApp, para su ficha en la esquina de
// agentes del hub (inicio.html) (propietario, 22/11/2026): «hoy he hecho…» sin
// iniciar sesión.
//
// ─── Qué NO expone ──────────────────────────────────────────────────────────
// Solo NÚMEROS y el estado: ni teléfonos, ni nombres, ni textos de mensajes, ni
// fichas de clientes. El hub es público y esto se puede pedir sin contraseña.
//
// ─── Coste en Upstash ───────────────────────────────────────────────────────
// Upstash tiene un cupo mensual de comandos y ya se agotó una vez por un panel
// que recargaba demasiado (8/9/2026, ver loadListaConversaciones). Por eso el
// resumen se calcula como mucho cada 2 minutos y se guarda: el resto de veces
// cuesta UN comando (el GET del resumen guardado), lo pida quien lo pida.
//
// Funciona en el sitio que tiene las variables UPSTASH_* (el del bot,
// spontaneous-lebkuchen-60fa41). En los demás contesta {configurado:false}.

const store = require('./conversation-store');

const CACHE_CLAVE = 'resumen-publico-bot';
const CACHE_SEGUNDOS = 120;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

/** Medianoche de hoy en Canarias, en milisegundos. */
function inicioDelDia() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  // Diferencia de Canarias con UTC ahora mismo (0 en invierno, 1 h en verano).
  const enCanarias = new Date(ahora.toLocaleString('en-US', { timeZone: 'Atlantic/Canary' }));
  const enUtc = new Date(ahora.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Date.parse(`${partes}T00:00:00Z`) - (enCanarias - enUtc);
}

async function calcular() {
  const desde = inicioDelDia();
  const telefonos = await store.listConversationPhones();
  const lista = await store.loadListaConversaciones(telefonos);
  const r = { conversaciones: 0, clientes_nuevos: 0, mensajes_clientes: 0, respuestas_bot: 0, respuestas_equipo: 0, pasados_a_persona: 0 };
  let ultimoMensaje = 0;
  for (const c of lista) {
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const hoy = msgs.filter((m) => Number(m.ts) >= desde);
    if (c.pausado) r.pasados_a_persona++;
    if (!hoy.length) continue;
    r.conversaciones++;
    // Cliente nuevo: su primer mensaje guardado es de hoy.
    if (Number(msgs[0]?.ts) >= desde) r.clientes_nuevos++;
    for (const m of hoy) {
      if (m.role === 'user') r.mensajes_clientes++;
      else if (m.role === 'assistant') r.respuestas_bot++;
      else if (m.role === 'agent') r.respuestas_equipo++;
      ultimoMensaje = Math.max(ultimoMensaje, Number(m.ts) || 0);
    }
  }
  const [pausa, fallo] = await Promise.all([store.getPausaGlobal(), store.getUltimoFallo()]);
  const falloHoy = fallo && Number(fallo.cuando) >= desde;
  return {
    agente: 'Bot de WhatsApp',
    estado: pausa ? 'parado' : falloHoy ? 'con_error' : 'trabajando',
    ultimo_mensaje: ultimoMensaje ? new Date(ultimoMensaje).toISOString() : null,
    hoy: r,
    calculado: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!store.isConfigured()) return { statusCode: 200, headers: CORS, body: JSON.stringify({ configurado: false }) };
  try {
    let resumen = await store.getCachedSearch(CACHE_CLAVE);
    if (!resumen) {
      resumen = await calcular();
      await store.setCachedSearch(CACHE_CLAVE, resumen, CACHE_SEGUNDOS);
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(resumen) };
  } catch (err) {
    console.error('bot-resumen:', err);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No se ha podido calcular el resumen.' }) };
  }
};
