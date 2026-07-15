// Webhook de WhatsApp Cloud API (Meta) para el agente de respuesta automática de Ofipapel.
// (deploy trigger: escalado a humano con confirmación por botones)
//
// GET  -> verificación del webhook que hace Meta al configurarlo.
// POST -> mensajes entrantes de clientes; responde con reglas rápidas (FAQ) o,
//         si ninguna coincide, con una respuesta generada por Claude.
//
// Escalado a persona: cuando una regla de queja/presupuesto/etc. o una pregunta
// repetida sugieren que hace falta una persona, el bot NO escala directo — manda
// unos botones "¿Quieres que te ponga en contacto con una persona?" (Sí/No) y solo
// si el cliente confirma "Sí" se avisa por email (RESEND_API_KEY/OWNER_EMAIL) y se
// marca la conversación en el panel (netlify/functions/conversations.js).
//
// Variables de entorno necesarias (configúralas en Netlify > Site settings > Environment variables):
//   WHATSAPP_VERIFY_TOKEN   token que tú inventas y usas al configurar el webhook en Meta
//   WHATSAPP_TOKEN          access token de la app de WhatsApp Cloud API (Meta for Developers)
//   WHATSAPP_PHONE_NUMBER_ID  id del número de WhatsApp Business (Meta for Developers)
//   WHATSAPP_APP_SECRET     (opcional pero recomendado) app secret, para verificar la firma de Meta
//   ANTHROPIC_API_KEY       api key de Claude, para responder cuando no hay una regla de FAQ
//   RESEND_API_KEY / OWNER_EMAIL  para que llegue el aviso por email cuando el cliente
//     confirma que quiere hablar con una persona (sin esto, el aviso se omite en silencio)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (opcional) para archivar las
//     conversaciones y verlas en el panel (netlify/functions/conversations.js)

const crypto = require('crypto');
const { matchFaqRule, askClaude, notifyOwner, getHistory, appendToHistory, isRepeatQuestion, AGENTE_INFO } = require('./whatsapp-agent-core');

const GRAPH_API_VERSION = 'v20.0';
const DEDUP_TTL_MS = 5 * 60 * 1000;

// Deduplicación best-effort de mensajes reenviados por Meta (sobrevive solo mientras
// la función esté "caliente"; no requiere base de datos para el caso de uso actual).
const processedMessageIds = new Map();

function alreadyProcessed(messageId) {
  const now = Date.now();
  for (const [id, ts] of processedMessageIds) {
    if (now - ts > DEDUP_TTL_MS) processedMessageIds.delete(id);
  }
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.set(messageId, now);
  return false;
}

function verifySignature(event) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // no configurado: se omite la verificación (ver README de configuración)

  const header = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];
  if (!header) return false;

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body || '', 'utf8');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function sendWhatsappMessage(to, body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const resp = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  if (!resp.ok) {
    console.error('Error enviando mensaje de WhatsApp:', resp.status, await resp.text());
  }
}

const ESCALATE_QUESTION = '¿Quieres que te ponga en contacto con una persona del equipo?';
const ESCALATE_DECLINE_REPLY = 'Entendido, sigo por aquí. Cuéntame otra vez qué necesitas e intento ayudarte.';

async function sendEscalateButtons(to) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const resp = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: ESCALATE_QUESTION },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'escalate_yes', title: '✅ Sí' } },
            { type: 'reply', reply: { id: 'escalate_no', title: '✖️ No' } },
          ],
        },
      },
    }),
  });

  if (!resp.ok) {
    console.error('Error enviando botones de escalado:', resp.status, await resp.text());
  }
}

// Si el cliente confirma o rechaza los botones "¿Quieres hablar con una persona?".
// Solo cuando confirma con "Sí" se avisa por email y se marca en el panel de
// conversaciones (que detecta el aviso buscando AGENTE_INFO en el historial).
async function handleEscalateReply(message) {
  const buttonId = message.interactive.button_reply.id;

  if (buttonId === 'escalate_yes') {
    await sendWhatsappMessage(message.from, AGENTE_INFO);
    await appendToHistory(message.from, '[El cliente confirmó que quiere hablar con una persona]', AGENTE_INFO);
    await notifyOwner({
      channel: 'Meta',
      from: message.from,
      customerMessage: '(confirmó que quiere hablar con una persona del equipo)',
      botReply: AGENTE_INFO,
    });
    return;
  }

  if (buttonId === 'escalate_no') {
    await sendWhatsappMessage(message.from, ESCALATE_DECLINE_REPLY);
    await appendToHistory(message.from, '[El cliente prefirió seguir con el bot]', ESCALATE_DECLINE_REPLY);
  }
}

async function handleIncomingMessage(message) {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    await handleEscalateReply(message);
    return;
  }

  if (message.type !== 'text') {
    await sendWhatsappMessage(
      message.from,
      'Gracias por tu mensaje. Por ahora solo puedo leer texto, pero un miembro del equipo revisará esto en breve.'
    );
    return;
  }

  const text = message.text?.body || '';
  const history = await getHistory(message.from);
  const faqReply = matchFaqRule(text);
  const wantsEscalation = faqReply === AGENTE_INFO || (!faqReply && isRepeatQuestion(text, history));

  if (wantsEscalation) {
    await sendEscalateButtons(message.from);
    await appendToHistory(message.from, text, `[Se ofreció escalar a una persona] ${ESCALATE_QUESTION}`);
    return;
  }

  const reply = faqReply || (await askClaude(text, history));
  await appendToHistory(message.from, text, reply);
  await sendWhatsappMessage(message.from, reply);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge || '' };
    }
    return { statusCode: 403, body: 'Forbidden' };
  }

  if (event.httpMethod === 'POST') {
    if (!verifySignature(event)) {
      return { statusCode: 401, body: 'Invalid signature' };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (err) {
      return { statusCode: 400, body: 'Invalid JSON' };
    }

    try {
      const changes = payload?.entry?.flatMap((entry) => entry.changes || []) || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];
        for (const message of messages) {
          if (alreadyProcessed(message.id)) continue;
          await handleIncomingMessage(message);
        }
      }
    } catch (err) {
      console.error('Error procesando webhook de WhatsApp:', err);
    }

    // Meta espera un 200 rápido; los errores ya se han registrado arriba.
    return { statusCode: 200, body: 'EVENT_RECEIVED' };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
