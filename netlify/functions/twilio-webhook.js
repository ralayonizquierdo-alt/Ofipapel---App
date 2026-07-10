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

const { matchFaqRule, askClaude } = require('./whatsapp-agent-core');

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
