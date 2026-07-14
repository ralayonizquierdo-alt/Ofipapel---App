// Lógica compartida del agente de WhatsApp: usada tanto por whatsapp-webhook.js
// (Meta Cloud API) como por twilio-webhook.js (Twilio), para no duplicar el
// matching de FAQ ni la llamada a Claude entre los dos canales.

const { FAQ_RULES, AI_SYSTEM_PROMPT } = require('./whatsapp-agent-config');
const conversationStore = require('./conversation-store');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Memoria de conversación por número, para dar contexto a Claude entre mensajes.
// Si UPSTASH_REDIS_REST_URL/TOKEN están configuradas, se usa el almacén archivado
// (conversation-store.js), que sobrevive a cold starts y alimenta el panel web.
// Si no, cae de vuelta a un mapa en memoria (best-effort, se pierde en cold starts).
const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 min de inactividad = conversación nueva
const MAX_HISTORY_MESSAGES = 10; // últimos mensajes (usuario + bot) que se le pasan a Claude
const conversations = new Map(); // from -> { messages: [{role, content}], updatedAt } (fallback)

async function getHistory(from) {
  if (conversationStore.isConfigured()) {
    const messages = await conversationStore.loadConversation(from);
    return messages.slice(-MAX_HISTORY_MESSAGES).map(({ role, content }) => ({ role, content }));
  }

  const conv = conversations.get(from);
  if (!conv) return [];
  if (Date.now() - conv.updatedAt > CONVERSATION_TTL_MS) {
    conversations.delete(from);
    return [];
  }
  return conv.messages;
}

async function appendToHistory(from, userText, botReply) {
  if (conversationStore.isConfigured()) {
    await conversationStore.appendMessages(from, userText, botReply);
    return;
  }

  const now = Date.now();
  for (const [key, conv] of conversations) {
    if (now - conv.updatedAt > CONVERSATION_TTL_MS) conversations.delete(key);
  }
  const conv = conversations.get(from) || { messages: [], updatedAt: now };
  conv.messages.push({ role: 'user', content: userText }, { role: 'assistant', content: botReply });
  conv.messages = conv.messages.slice(-MAX_HISTORY_MESSAGES);
  conv.updatedAt = now;
  conversations.set(from, conv);
}

function matchFaqRule(text) {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita acentos para comparar con más tolerancia

  for (const rule of FAQ_RULES) {
    const hit = rule.keywords.some((keyword) => {
      const normalizedKeyword = keyword
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      return normalized.includes(normalizedKeyword);
    });
    if (hit) return typeof rule.reply === 'function' ? rule.reply(normalized) : rule.reply;
  }
  return null;
}

async function askClaude(userText, history = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'Gracias por tu mensaje. En breve un miembro del equipo te responderá.';
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: AI_SYSTEM_PROMPT,
        messages: [...history, { role: 'user', content: userText }],
      }),
    });

    if (!resp.ok) {
      console.error('Error de Claude API:', resp.status, await resp.text());
      return 'Gracias por tu mensaje. En breve un miembro del equipo te responderá.';
    }

    const data = await resp.json();
    const text = data?.content?.find((block) => block.type === 'text')?.text?.trim();
    return text || 'Gracias por tu mensaje. En breve un miembro del equipo te responderá.';
  } catch (err) {
    console.error('Fallo llamando a Claude:', err);
    return 'Gracias por tu mensaje. En breve un miembro del equipo te responderá.';
  }
}

// Avisa por email de cada conversación (pregunta del cliente + respuesta del bot),
// ya que el número de prueba/producción de WhatsApp no tiene una app donde ver los
// chats. Usa Resend (resend.com) con su remitente de pruebas, que no requiere
// verificar un dominio propio para empezar a enviar.
async function notifyOwner({ channel, from, customerMessage, botReply }) {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!apiKey || !ownerEmail) return; // notificaciones no configuradas, se omite en silencio

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ofipapel Bot <onboarding@resend.dev>',
        to: [ownerEmail],
        subject: `WhatsApp (${channel}) — ${from}`,
        text: `Cliente (${from}) escribió:\n${customerMessage}\n\nEl bot respondió:\n${botReply}`,
      }),
    });

    if (!resp.ok) {
      console.error('Error enviando notificación por email:', resp.status, await resp.text());
    }
  } catch (err) {
    console.error('Fallo llamando a Resend:', err);
  }
}

module.exports = { matchFaqRule, askClaude, notifyOwner, getHistory, appendToHistory };
