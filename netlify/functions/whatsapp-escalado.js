// "¿QUIERES HABLAR CON UNA PERSONA?" — la pregunta y sus botones.
//
// Vivía dentro del webhook, que era su único usuario. Ahora también la necesita
// la función de segundo plano que contesta a las fotos
// (whatsapp-foto-background.js): cuando no puede respaldar una respuesta, lo
// que toca es ofrecer una persona, exactamente igual que en el webhook.
//
// Tiene módulo propio y no se metió en whatsapp-send.js a propósito: las
// pruebas simulan los envíos para no llamar a Meta, y al estar aquí siguen
// detectando estos botones por la petición de verdad, sin tocar diez
// simuladores para añadir una función.

const { isWithinBusinessHours, STORES } = require('./whatsapp-agent-config');

const GRAPH_API_VERSION = 'v20.0';

// Fuera de horario, la propia pregunta ya deja claro que ahora mismo no hay
// nadie y que la atención será en cuanto abramos — así el cliente no piensa que
// va a hablar con alguien al instante al pulsar "Sí".
function escalateQuestion(idioma = 'es') {
  if (idioma === 'en') {
    return isWithinBusinessHours()
      ? 'Would you like me to put you in touch with someone from the team?'
      : `We're closed at the moment (${STORES[0].hoursEn}), so nobody can help you right away. Would you still like me to put you in touch? Someone will look at your conversation as soon as we're open.`;
  }
  return isWithinBusinessHours()
    ? '¿Quieres que te ponga en contacto con una persona del equipo?'
    : `Ahora mismo estamos fuera del horario comercial (${STORES[0].hours}), así que nadie puede atenderte al instante. ¿Quieres que igualmente te pongamos en contacto? Un agente revisará tu conversación en cuanto retomemos la actividad.`;
}

async function sendEscalateButtons(to, greetingPrefix = '', idioma = 'es') {
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
        body: { text: greetingPrefix + escalateQuestion(idioma) },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'escalate_yes', title: idioma === 'en' ? '✅ Yes' : '✅ Sí' } },
            { type: 'reply', reply: { id: 'escalate_no', title: idioma === 'en' ? '✖️ No' : '✖️ No' } },
          ],
        },
      },
    }),
  });

  if (!resp.ok) {
    console.error('Error enviando botones de escalado:', resp.status, await resp.text());
  }
}

module.exports = { escalateQuestion, sendEscalateButtons };
