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

// Guarda una respuesta escrita a mano desde el panel de conversaciones (no del bot).
async function appendAgentMessage(phone, agentText) {
  await pushMessages(phone, [{ role: 'agent', content: agentText }]);
}

async function listConversationPhones() {
  return (await redisCommand(['SMEMBERS', 'conversations_index'])) || [];
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
  appendAgentMessage,
  listConversationPhones,
  pauseBot,
  isBotPaused,
  resumeBot,
  diagnose,
};
