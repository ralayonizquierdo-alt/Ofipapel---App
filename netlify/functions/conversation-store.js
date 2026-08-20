// Almacén de conversaciones archivadas del bot de WhatsApp, usando Upstash Redis
// a través de su API REST (sin SDK, sin dependencias npm nuevas — solo fetch).
//
// Si UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN no están configuradas,
// todas las funciones devuelven valores vacíos sin lanzar error, para que el
// resto del bot siga funcionando igual aunque no se haya activado el archivado.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_STORED_MESSAGES = 200; // mensajes por conversación que se conservan archivados

function isConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redisCommand(args) {
  if (!isConfigured()) return null;
  try {
    const resp = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!resp.ok) {
      console.error('Error de Upstash Redis:', resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data.result;
  } catch (err) {
    console.error('Fallo llamando a Upstash Redis:', err);
    return null;
  }
}

async function loadConversation(phone) {
  const raw = await redisCommand(['GET', `conv:${phone}`]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function pushMessages(phone, newMessages) {
  if (!isConfigured()) return;
  const now = Date.now();
  const messages = await loadConversation(phone);
  for (const m of newMessages) messages.push({ ...m, ts: now });
  const trimmed = messages.slice(-MAX_STORED_MESSAGES);
  await redisCommand(['SET', `conv:${phone}`, JSON.stringify(trimmed)]);
  await redisCommand(['SADD', 'conversations_index', phone]);
}

async function appendMessages(phone, userText, botReply) {
  await pushMessages(phone, [
    { role: 'user', content: userText },
    { role: 'assistant', content: botReply },
  ]);
}

// Guarda solo el mensaje del cliente, sin respuesta del bot emparejada — se usa
// cuando el bot está en pausa y es una persona quien va a responder desde el panel.
async function appendCustomerMessage(phone, userText) {
  await pushMessages(phone, [{ role: 'user', content: userText }]);
}

// Guarda SOLO la respuesta del bot, sin mensaje del cliente emparejado. Se usa
// en el reintento en segundo plano: el mensaje del cliente ya se archivó al
// recibirlo (para no perderlo si el reintento falla) y aquí solo falta añadir
// lo que se le acabó contestando.
async function appendBotReply(phone, botText) {
  await pushMessages(phone, [{ role: 'assistant', content: botText }]);
}

// Guarda una respuesta escrita a mano desde el panel de conversaciones (no del bot).
async function appendAgentMessage(phone, agentText) {
  await pushMessages(phone, [{ role: 'agent', content: agentText }]);
}

async function listConversationPhones() {
  return (await redisCommand(['SMEMBERS', 'conversations_index'])) || [];
}

// Borra por completo el historial archivado de un número (usado desde el panel,
// sobre todo para limpiar números de prueba). No se puede deshacer.
async function clearConversation(phone) {
  await redisCommand(['DEL', `conv:${phone}`]);
  await redisCommand(['SREM', 'conversations_index', phone]);
  // Y lo que cuelga de esa conversación, para no dejar restos que reaparezcan
  // si el mismo número vuelve a escribir: cuándo se leyó por última vez en el
  // panel y hasta dónde llegaban los acuses de WhatsApp.
  await redisCommand(['DEL', `viewed:${phone}`]);
  await redisCommand(['DEL', `entregado:${phone}`]);
  await redisCommand(['DEL', `leido:${phone}`]);
}

// Pausa las respuestas automáticas del bot para un número durante N horas (por
// defecto 24, alineado con la ventana de mensajería de WhatsApp), para que no se
// crucen con las respuestas manuales de una persona desde el panel.
async function pauseBot(phone, hours = 24) {
  await redisCommand(['SET', `paused:${phone}`, '1', 'EX', String(Math.round(hours * 3600))]);
}

async function isBotPaused(phone) {
  return (await redisCommand(['GET', `paused:${phone}`])) === '1';
}

async function resumeBot(phone) {
  await redisCommand(['DEL', `paused:${phone}`]);
}

// ── Contraseña del panel ─────────────────────────────────────────────────────
// Guardada aquí para poder cambiarla desde el propio panel, sin entrar en
// Netlify ni desplegar. Se guarda el HASH, nunca la contraseña.
//
// DASHBOARD_PASSWORD sigue existiendo y es la de partida: vale mientras no se
// haya cambiado ninguna vez, y es la vía de recuperación si alguien olvida la
// nueva (se borra la clave de aquí y vuelve a mandar la del entorno).
async function getPanelPassword() {
  const raw = await redisCommand(['GET', 'panel:password']);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setPanelPassword(record) {
  await redisCommand(['SET', 'panel:password', JSON.stringify(record)]);
}

// ── Interruptor general del bot ──────────────────────────────────────────────
// Distinto de pauseBot(phone), que silencia UNA conversación porque una persona
// la ha cogido: esto silencia el bot ENTERO, para todos los clientes a la vez.
// Es la palanca de "algo va mal, para ya" — el bot deja de responder solo, los
// mensajes de los clientes se siguen archivando en el panel, y se contesta a
// mano hasta reanudarlo.
//
// No lleva caducidad a propósito: una pausa de emergencia que se levanta sola
// sin que nadie se entere es peor que no tenerla. Se reanuda a mano.
const CLAVE_PAUSA_GLOBAL = 'bot:pausado';

async function getPausaGlobal() {
  const raw = await redisCommand(['GET', CLAVE_PAUSA_GLOBAL]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Con que exista la clave ya está pausado; si el contenido está corrupto,
    // se pausa igual. Ante la duda, callar es lo seguro.
    return { desde: 0, motivo: '' };
  }
}

async function pausarBotGlobal(motivo = '') {
  const estado = { desde: Date.now(), motivo: String(motivo).slice(0, 200) };
  await redisCommand(['SET', CLAVE_PAUSA_GLOBAL, JSON.stringify(estado)]);
  return estado;
}

async function reanudarBotGlobal() {
  await redisCommand(['DEL', CLAVE_PAUSA_GLOBAL]);
}

// Cuándo se le avisó a este cliente de que el bot está en pausa, guardado como
// el instante en que empezó ESA pausa. Así se le avisa una sola vez por pausa
// (no en cada mensaje que mande, que sería un bombardeo), pero si más adelante
// se vuelve a pausar, se le vuelve a avisar.
async function getAvisoPausa(phone) {
  const raw = await redisCommand(['GET', `avisopausa:${phone}`]);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function marcarAvisoPausa(phone, desde) {
  await redisCommand(['SET', `avisopausa:${phone}`, String(desde), 'EX', String(30 * 24 * 3600)]);
}

// Marca de "última vez que se abrió esta conversación en el panel", para poder
// contar cuántos mensajes del cliente han llegado desde entonces (mensajes sin
// leer) en el listado. Se actualiza cada vez que se abre el hilo de un número.
// ── Acuses de recibo de WhatsApp ─────────────────────────────────────────────
// Meta avisa por el mismo webhook de cuándo se ENTREGÓ y cuándo se LEYÓ cada
// mensaje que mandamos. En vez de guardar el estado de cada mensaje uno a uno
// (habría que ir apuntando el identificador que devuelve Meta al enviar), se
// guarda "hasta qué momento" está entregado y leído: los acuses llegan en orden
// y leer un mensaje implica haber leído los anteriores, así que con una fecha
// por conversación se sabe el estado de todos.
//
// Ojo: si el cliente tiene desactivadas las confirmaciones de lectura en su
// WhatsApp, el acuse de "leído" NO llega nunca — se quedará en "entregado"
// aunque lo haya leído. Eso es cosa suya, no del bot.
async function marcarEntrega(phone, estado, ts) {
  const clave = estado === 'read' ? `leido:${phone}` : `entregado:${phone}`;
  const previo = Number(await redisCommand(['GET', clave])) || 0;
  if (ts > previo) await redisCommand(['SET', clave, String(ts)]);
}

async function getEstadoEntrega(phone) {
  const [entregado, leido] = await Promise.all([
    redisCommand(['GET', `entregado:${phone}`]),
    redisCommand(['GET', `leido:${phone}`]),
  ]);
  return { entregado: Number(entregado) || 0, leido: Number(leido) || 0 };
}

async function markAsViewed(phone) {
  await redisCommand(['SET', `viewed:${phone}`, String(Date.now())]);
}

async function getLastViewed(phone) {
  const raw = await redisCommand(['GET', `viewed:${phone}`]);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Memoria del bot ──────────────────────────────────────────────────────────
// Dos cosas distintas, ambas guardadas aquí porque ya hay almacén compartido:
//
//  1. Caché de búsquedas: la web tarda varios segundos en responder cada
//     búsqueda (medido: 3,5-6 s, a veces más), así que se guarda el resultado un
//     rato. Si varios clientes preguntan por lo mismo el mismo día, solo el
//     primero espera. El plazo es corto a propósito: el precio y el stock
//     cambian, y es preferible repetir la consulta que dar un dato viejo.
//
//  2. Términos que los clientes buscaron y no encontramos, con su número de
//     veces, para poder revisarlos en el panel y enseñarle al bot a qué
//     corresponden (ver aliases más abajo).

async function getCachedSearch(key) {
  const raw = await redisCommand(['GET', `busqueda:${key}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedSearch(key, value, ttlSeconds = 3600) {
  await redisCommand(['SET', `busqueda:${key}`, JSON.stringify(value), 'EX', String(ttlSeconds)]);
}

// Se guarda con contador (ZINCRBY) para poder ordenar por lo más pedido: lo que
// más veces se busca sin encontrar es lo primero que interesa revisar.
async function registrarBusquedaSinResultado(termino) {
  const limpio = (termino || '').trim().slice(0, 120);
  if (!limpio) return;
  await redisCommand(['ZINCRBY', 'busquedas_sin_resultado', '1', limpio]);
}

async function listarBusquedasSinResultado(limite = 50) {
  const raw = await redisCommand(['ZRANGE', 'busquedas_sin_resultado', '0', String(limite - 1), 'REV', 'WITHSCORES']);
  if (!Array.isArray(raw)) return [];
  const salida = [];
  for (let i = 0; i < raw.length; i += 2) {
    salida.push({ termino: raw[i], veces: Number(raw[i + 1]) || 0 });
  }
  return salida;
}

async function olvidarBusquedaSinResultado(termino) {
  await redisCommand(['ZREM', 'busquedas_sin_resultado', termino]);
}

// Aliases aprendidos: "lo que escribe el cliente" -> "como se llama de verdad en
// el catálogo" (folios -> papel fotocopia). Los define una persona desde el
// panel; el bot no los inventa solo, para que un error no se vuelva permanente.
async function getAliasesBusqueda() {
  const raw = await redisCommand(['HGETALL', 'alias_busqueda']);
  if (!raw) return {};
  // Upstash devuelve HGETALL como lista plana [campo, valor, campo, valor...]
  if (Array.isArray(raw)) {
    const obj = {};
    for (let i = 0; i < raw.length; i += 2) obj[raw[i]] = raw[i + 1];
    return obj;
  }
  return typeof raw === 'object' ? raw : {};
}

async function guardarAliasBusqueda(termino, equivale) {
  const t = (termino || '').trim().toLowerCase();
  const e = (equivale || '').trim();
  if (!t || !e) return;
  await redisCommand(['HSET', 'alias_busqueda', t, e]);
  await olvidarBusquedaSinResultado(t);
}

async function borrarAliasBusqueda(termino) {
  await redisCommand(['HDEL', 'alias_busqueda', (termino || '').trim().toLowerCase()]);
}

// ── Ficha del cliente ────────────────────────────────────────────────────────
// Lo que sabemos de quien escribe, para que el bot no trate a un cliente
// habitual como si fuera la primera vez. A propósito solo guarda DATOS DUROS:
// el nombre sale de un pedido ya verificado contra WooCommerce, los pedidos son
// los que él mismo ha consultado y los productos son lo que escribió. Nada de
// resúmenes generados por la IA — un error suyo se quedaría fijado en la ficha y
// contaminaría todas las conversaciones futuras con esa persona. Las notas las
// escribe el equipo a mano desde el panel.
const CLIENTE_MAX_PRODUCTOS = 8;
const CLIENTE_MAX_PEDIDOS = 5;

async function getFichaCliente(phone) {
  const raw = await redisCommand(['GET', `cliente:${phone}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function actualizarFichaCliente(phone, cambios) {
  const actual = (await getFichaCliente(phone)) || { primerContacto: Date.now() };
  const ficha = { ...actual, ...cambios, ultimoContacto: Date.now() };
  await redisCommand(['SET', `cliente:${phone}`, JSON.stringify(ficha)]);
  return ficha;
}

// Se llama solo cuando el pedido ya se ha verificado como suyo (por teléfono o
// por nombre), así que el nombre/empresa vienen de WooCommerce, no del chat.
async function registrarPedidoVerificado(phone, order) {
  const ficha = (await getFichaCliente(phone)) || {};
  const pedidos = Array.isArray(ficha.pedidos) ? ficha.pedidos : [];
  const yaEsta = pedidos.some((p) => String(p.id) === String(order.id));
  const nuevos = yaEsta
    ? pedidos
    : [...pedidos, { id: order.id, fecha: order.date_created || null }].slice(-CLIENTE_MAX_PEDIDOS);

  const nombre = `${order?.billing?.first_name || ''} ${order?.billing?.last_name || ''}`.trim();
  await actualizarFichaCliente(phone, {
    pedidos: nuevos,
    ...(nombre ? { nombre } : {}),
    ...(order?.billing?.company ? { empresa: order.billing.company } : {}),
  });
}

async function registrarProductoPreguntado(phone, termino) {
  const limpio = (termino || '').trim().slice(0, 80);
  if (!limpio) return;
  const ficha = (await getFichaCliente(phone)) || {};
  const previos = Array.isArray(ficha.productos) ? ficha.productos : [];
  if (previos[previos.length - 1] === limpio) return; // no repetir el mismo seguido
  const productos = [...previos.filter((p) => p !== limpio), limpio].slice(-CLIENTE_MAX_PRODUCTOS);
  await actualizarFichaCliente(phone, { productos });
}

// El bot se presenta una sola vez a cada cliente; esta marca es la que evita
// que se repita. Va en la ficha (no en el historial) para que siga valiendo
// aunque se borre la conversación desde el panel.
async function marcarPresentado(phone) {
  await actualizarFichaCliente(phone, { presentado: true });
}

async function guardarNotasCliente(phone, notas) {
  await actualizarFichaCliente(phone, { notas: (notas || '').trim().slice(0, 500) });
}

// Reserva un id de mensaje entrante para procesarlo UNA sola vez. Devuelve true
// si nadie lo había cogido antes (hay que procesarlo) y false si ya estaba
// cogido (es un reenvío de Meta y hay que ignorarlo).
//
// Va aquí, en el almacén compartido, y no en memoria del proceso: Meta reintenta
// el envío si la función tarda en contestar, y ese reintento puede caer en otra
// instancia distinta de la función, que no comparte memoria con la primera — el
// cliente recibía entonces dos respuestas al mismo mensaje (visto en real). El
// "NX" hace que la reserva sea atómica: aunque las dos instancias entren a la
// vez, solo una recibe OK. El "EX" limpia la marca sola pasado un rato.
async function claimMessage(messageId, ttlSeconds = 600) {
  if (!isConfigured()) return true; // sin almacén compartido, decide el respaldo en memoria

  // Se usa un contador (INCR) y no un "SET ... NX": ese devuelve null tanto
  // cuando la reserva ya existía como cuando Redis no responde, y esos dos casos
  // exigen decisiones opuestas. INCR sí los distingue — devuelve 1 la primera
  // vez, 2 o más en los reenvíos, y null solo si hay un fallo real.
  const key = `msg:${messageId}`;
  const veces = await redisCommand(['INCR', key]);

  // Fallo de Redis: se procesa igualmente. Es peor dejar a un cliente sin
  // respuesta que arriesgar un duplicado ocasional.
  if (veces === null) return true;

  if (Number(veces) === 1) {
    await redisCommand(['EXPIRE', key, String(ttlSeconds)]);
    return true;
  }
  return false;
}

// Prueba de escritura + lectura contra Upstash, devolviendo el error real (código HTTP
// y cuerpo de la respuesta) tal cual lo manda Upstash, para poder mostrarlo en el panel
// sin tener que ir a mirar los logs de Netlify ni la consola de Upstash a mano.
async function diagnose() {
  if (!isConfigured()) {
    return { ok: false, stage: 'configuracion', detail: 'Faltan UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN.' };
  }

  const testKey = 'ofipapel:diagnostico';
  const testValue = `ok-${Date.now()}`;

  let resp;
  try {
    resp = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', testKey, testValue]),
    });
  } catch (err) {
    return { ok: false, stage: 'escritura', detail: `No se pudo contactar con Upstash: ${err.message}` };
  }
  const writeText = await resp.text();
  if (!resp.ok) {
    return { ok: false, stage: 'escritura', detail: `HTTP ${resp.status}: ${writeText}` };
  }

  let readResp;
  try {
    readResp = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', testKey]),
    });
  } catch (err) {
    return { ok: false, stage: 'lectura', detail: `No se pudo contactar con Upstash: ${err.message}` };
  }
  const readText = await readResp.text();
  if (!readResp.ok) {
    return { ok: false, stage: 'lectura', detail: `HTTP ${readResp.status}: ${readText}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(readText);
  } catch {
    return { ok: false, stage: 'lectura', detail: `Respuesta inesperada de Upstash: ${readText}` };
  }
  if (parsed.result !== testValue) {
    return { ok: false, stage: 'lectura', detail: `Se guardó "${testValue}" pero se leyó "${parsed.result}".` };
  }

  return { ok: true };
}

module.exports = {
  isConfigured,
  loadConversation,
  appendMessages,
  appendCustomerMessage,
  appendBotReply,
  appendAgentMessage,
  listConversationPhones,
  pauseBot,
  isBotPaused,
  resumeBot,
  getPanelPassword,
  setPanelPassword,
  getPausaGlobal,
  pausarBotGlobal,
  reanudarBotGlobal,
  getAvisoPausa,
  marcarAvisoPausa,
  clearConversation,
  diagnose,
  markAsViewed,
  getLastViewed,
  marcarEntrega,
  getEstadoEntrega,
  claimMessage,
  getCachedSearch,
  setCachedSearch,
  registrarBusquedaSinResultado,
  listarBusquedasSinResultado,
  olvidarBusquedaSinResultado,
  getAliasesBusqueda,
  guardarAliasBusqueda,
  borrarAliasBusqueda,
  getFichaCliente,
  registrarPedidoVerificado,
  registrarProductoPreguntado,
  marcarPresentado,
  guardarNotasCliente,
};
