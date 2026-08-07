// Webhook de Twilio (WhatsApp Sandbox / número de WhatsApp de Twilio) para el
// agente de respuesta automática de Ofipapel.
//
// A diferencia de Meta, Twilio no necesita tokens de acceso para responder:
// basta con devolver un documento TwiML en la misma respuesta HTTP y Twilio
// se encarga de reenviarlo por WhatsApp.
//
// Configuración en la consola de Twilio (Messaging > Try it out > WhatsApp Sandbox,
// o en el número de WhatsApp de producción):
//   "WHEN A MESSAGE COMES IN" -> POST a esta URL:
//   https://<tu-sitio>.netlify.app/.netlify/functions/twilio-webhook
//
// Variables de entorno necesarias:
//   ANTHROPIC_API_KEY   api key de Claude, para responder cuando no hay una regla de FAQ
//   TWILIO_AUTH_TOKEN   (opcional pero recomendado) Auth Token de la consola de
//     Twilio, para verificar que la petición viene realmente de Twilio (firma
//     X-Twilio-Signature). Sin ella, CUALQUIERA que conozca esta URL puede
//     simular mensajes de cliente y hacer que el bot responda (gastando la
//     cuota de Claude) o que se notifique al propietario con datos falsos —
//     no hay ninguna otra verificación en este webhook.
//   RESEND_API_KEY      (opcional) api key de resend.com, para avisar por email de cada conversación
//   OWNER_EMAIL         (opcional) email donde recibir el aviso de cada conversación
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (opcional) para archivar las
//     conversaciones y verlas en el panel (netlify/functions/conversations.js)

const crypto = require('crypto');
const { matchFaqRule, askClaude, notifyOwner, getHistory, appendToHistory, isRepeatQuestion, agenteInfo } = require('./whatsapp-agent-core');
const { AI_DISCLOSURE } = require('./whatsapp-agent-config');

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// TwiML admite varios <Message> en una sola respuesta — Twilio los envía
// como mensajes de WhatsApp independientes, en orden.
function twiml(replyTexts) {
  const messages = replyTexts.map((t) => `<Message>${escapeXml(t)}</Message>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${messages}</Response>`;
}

// Algoritmo oficial de Twilio: URL completa + pares clave-valor del body (POST
// application/x-www-form-urlencoded) ordenados alfabéticamente y concatenados
// sin separador, firmado con HMAC-SHA1 usando el Auth Token. Ver
// https://www.twilio.com/docs/usage/security#validating-requests
function verifyTwilioSignature(event, rawBody) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn('twilio-webhook: TWILIO_AUTH_TOKEN no configurada — la petición NO se verifica, cualquiera puede simular un mensaje. Configúrala en Netlify.');
    return true;
  }

  const signature = event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature'];
  if (!signature) return false;

  const url = event.rawUrl || `https://${event.headers.host || process.env.URL || ''}${event.path || ''}`;
  const params = new URLSearchParams(rawBody);
  const sortedKeys = [...params.keys()].sort();
  let data = url;
  for (const key of sortedKeys) data += key + params.get(key);

  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body || '';

  if (!verifyTwilioSignature(event, rawBody)) {
    return { statusCode: 403, body: 'Invalid Twilio signature' };
  }

  const params = new URLSearchParams(rawBody);
  const text = params.get('Body') || '';
  const from = params.get('From') || '';

  let reply;
  let isNewConversation = false;
  try {
    const history = await getHistory(from);
    isNewConversation = history.length === 0;
    reply = matchFaqRule(text) || (isRepeatQuestion(text, history) ? agenteInfo() : await askClaude(text, history));
  } catch (err) {
    console.error('Error procesando mensaje de Twilio:', err);
    reply = 'Gracias por tu mensaje. En breve un miembro del equipo te responderá.';
  }
  await appendToHistory(from, text, reply);

  await notifyOwner({ channel: 'Twilio', from, customerMessage: text, botReply: reply });

  // Aviso de transparencia de IA (ver whatsapp-agent-config.js) una sola vez,
  // al primer mensaje de cada conversación nueva — mismo criterio que el
  // canal de Meta en whatsapp-webhook.js.
  const messages = isNewConversation ? [AI_DISCLOSURE, reply] : [reply];

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml(messages),
  };
};
