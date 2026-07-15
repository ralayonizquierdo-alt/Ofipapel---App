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

// Sube un adjunto (imagen o PDF) a los servidores de Meta, para poder referenciarlo
// luego por su id al mandar el mensaje. WhatsApp exige este paso previo: no se puede
// mandar el binario directamente en el mensaje.
async function uploadWhatsappMedia(buffer, mimeType, filename) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const resp = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Error subiendo adjunto a WhatsApp:', resp.status, errText);
      return { ok: false, status: resp.status, error: errText };
    }
    const data = await resp.json();
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('Fallo subiendo adjunto a WhatsApp:', err);
    return { ok: false, error: String(err) };
  }
}

// Manda un mensaje de tipo imagen o documento, referenciando el id devuelto por
// uploadWhatsappMedia. "caption" es opcional (texto que acompaña al archivo).
async function sendWhatsappMedia(to, mediaId, kind, { caption, filename } = {}) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const mediaObject = kind === 'document' ? { id: mediaId, filename } : { id: mediaId };
  if (caption) mediaObject.caption = caption;

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
        type: kind,
        [kind]: mediaObject,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Error enviando adjunto de WhatsApp:', resp.status, errText);
      return { ok: false, status: resp.status, error: errText };
    }
    return { ok: true };
  } catch (err) {
    console.error('Fallo enviando adjunto de WhatsApp:', err);
    return { ok: false, error: String(err) };
  }
}

module.exports = { sendWhatsappMessage, uploadWhatsappMedia, sendWhatsappMedia };
