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

async function appendMessages(phone, userText, botReply) {
  if (!isConfigured()) return;
  const now = Date.now();
  const messages = await loadConversation(phone);
  messages.push({ role: 'user', content: userText, ts: now });
  messages.push({ role: 'assistant', content: botReply, ts: now });
  const trimmed = messages.slice(-MAX_STORED_MESSAGES);
  await redisCommand(['SET', `conv:${phone}`, JSON.stringify(trimmed)]);
  await redisCommand(['SADD', 'conversations_index', phone]);
}

async function listConversationPhones() {
  return (await redisCommand(['SMEMBERS', 'conversations_index'])) || [];
}

module.exports = { isConfigured, loadConversation, appendMessages, listConversationPhones };
