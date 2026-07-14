// Lógica compartida del agente de WhatsApp: usada tanto por whatsapp-webhook.js
// (Meta Cloud API) como por twilio-webhook.js (Twilio), para no duplicar el
// matching de FAQ ni la llamada a Claude entre los dos canales.

const { FAQ_RULES, AI_SYSTEM_PROMPT } = require('./whatsapp-agent-config');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

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

module.exports = { matchFaqRule, askClaude, notifyOwner };
