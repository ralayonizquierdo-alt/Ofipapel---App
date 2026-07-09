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

const { FAQ_RULES, AI_SYSTEM_PROMPT } = require('./whatsapp-agent-config');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

function matchFaqRule(text) {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  for (const rule of FAQ_RULES) {
    const hit = rule.keywords.some((keyword) => {
      const normalizedKeyword = keyword
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      return normalized.includes(normalizedKeyword);
    });
    if (hit) return rule.reply;
  }
  return null;
}

async function askClaude(userText) {
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
        messages: [{ role: 'user', content: userText }],
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

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function twiml(replyText) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(replyText)}</Message></Response>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body || '';
  const params = new URLSearchParams(rawBody);
  const text = params.get('Body') || '';

  let reply;
  try {
    reply = matchFaqRule(text) || (await askClaude(text));
  } catch (err) {
    console.error('Error procesando mensaje de Twilio:', err);
    reply = 'Gracias por tu mensaje. En breve un miembro del equipo te responderá.';
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml(reply),
  };
};
