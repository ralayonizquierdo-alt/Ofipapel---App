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
        // preview_url pinta la tarjeta de vista previa (imagen y título) cuando
        // el mensaje lleva un enlace. Sin esto el enlace se manda igual y
        // WhatsApp lo deja pinchable — los reconoce solo —, pero llega como una
        // línea de texto suelta. Con la tarjeta, un enlace a una ficha de
        // producto llega con su foto y su nombre, que es lo que hace que el
        // cliente lo abra.
        text: { body, preview_url: true },
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

// Los valores que se meten en los huecos de una plantilla no admiten saltos de
// línea, tabuladores ni cuatro espacios seguidos: Meta rechaza el envío entero
// con "param value invalid" si los llevan. Y un hueco vacío también lo rechaza.
// Como estos valores vienen de lo que ha escrito un cliente por WhatsApp (que
// perfectamente puede tener saltos de línea), hay que limpiarlos siempre.
const PLANTILLA_MAX_VARIABLE = 300;

function limpiarVariablePlantilla(valor) {
  const limpio = String(valor ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLANTILLA_MAX_VARIABLE);
  return limpio || '(sin contenido)';
}

// Envía un mensaje de PLANTILLA, que es la única forma de escribirle a alguien
// fuera de la ventana de 24 horas de WhatsApp (pasado ese plazo desde su último
// mensaje, Meta rechaza cualquier texto libre). Se usa para los avisos al dueño,
// que por definición saltan cuando no está escribiéndole al bot.
//
// La plantilla hay que crearla y que Meta la apruebe antes, en WhatsApp Manager
// (ver WHATSAPP_SETUP.md). Aquí solo se rellenan sus huecos, en el mismo orden
// en que están numerados ({{1}}, {{2}}...).
async function sendWhatsappTemplate(to, templateName, variables = [], languageCode = 'es') {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const components = variables.length
    ? [
        {
          type: 'body',
          parameters: variables.map((v) => ({ type: 'text', text: limpiarVariablePlantilla(v) })),
        },
      ]
    : [];

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
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Error enviando plantilla de WhatsApp:', templateName, resp.status, errText);
      return { ok: false, status: resp.status, error: errText };
    }
    return { ok: true };
  } catch (err) {
    console.error('Fallo llamando a la API de WhatsApp (plantilla):', err);
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

// El perfil del negocio: lo que ve un cliente al pulsar en el nombre del
// contacto. Solo se LEE — cambiarlo se hace desde WhatsApp Manager, porque
// subir la foto por API es una carga en tres pasos que no compensa montar para
// algo que se toca una vez al año.
//
// Ojo: aquí solo se puede consultar el perfil PROPIO. La API no da el perfil ni
// la foto de los clientes; eso Meta no lo expone a los negocios.
async function getBusinessProfile() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    return { ok: false, error: 'Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN.' };
  }

  const campos = 'about,address,description,email,profile_picture_url,websites,vertical';
  try {
    const resp = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/whatsapp_business_profile?fields=${campos}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    const datos = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: datos?.error?.message || `Error ${resp.status} de Meta.` };
    }
    return { ok: true, perfil: datos?.data?.[0] || {} };
  } catch (err) {
    console.error('Fallo consultando el perfil de WhatsApp:', err);
    return { ok: false, error: String(err) };
  }
}

// El ESTADO DEL NÚMERO, que es otra cosa que el perfil y vive en otro sitio de
// la API: el nodo del propio número, no en whatsapp_business_profile.
//
// Aquí es donde está la única respuesta fiable a "¿ya me han aprobado el
// nombre?". Preguntárselo a WhatsApp en el móvil no vale: allí sale el nombre
// que tenga guardado en su agenda quien mira, no el que Meta tenga aprobado.
//
// name_status es el campo que importa:
//   APPROVED                  — aprobado, ya se ve el nombre
//   PENDING_REVIEW            — en revisión, hay que esperar
//   DECLINED                  — rechazado, hay que mandar otro
//   EXPIRED / NONE            — caducado o sin solicitar
//   AVAILABLE_WITHOUT_REVIEW  — se puede usar sin revisión
async function getPhoneNumberStatus() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    return { ok: false, error: 'Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN.' };
  }

  const campos = 'verified_name,display_phone_number,name_status,new_name_status,status,code_verification_status,quality_rating';
  try {
    const resp = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=${campos}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    const datos = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: datos?.error?.message || `Error ${resp.status} de Meta.` };
    }
    return { ok: true, numero: datos || {} };
  } catch (err) {
    console.error('Fallo consultando el estado del número de WhatsApp:', err);
    return { ok: false, error: String(err) };
  }
}

module.exports = {
  getBusinessProfile,
  getPhoneNumberStatus,
  sendWhatsappMessage,
  sendWhatsappTemplate,
  limpiarVariablePlantilla,
  uploadWhatsappMedia,
  sendWhatsappMedia,
};
