// Envío de mensajes de WhatsApp (Meta Cloud API), compartido entre el webhook del
// bot (whatsapp-webhook.js) y el panel de conversaciones (conversations.js), para
// poder responder a mano desde el panel usando el mismo número.

const GRAPH_API_VERSION = 'v20.0';

async function sendWhatsappMessage(to, body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  try {
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
      const errText = await resp.text();
      console.error('Error enviando mensaje de WhatsApp:', resp.status, errText);
      return { ok: false, status: resp.status, error: errText };
    }
    return { ok: true };
  } catch (err) {
    console.error('Fallo llamando a la API de WhatsApp:', err);
    return { ok: false, error: String(err) };
  }
}

module.exports = { sendWhatsappMessage };
