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
const { paraWhatsapp } = require('./whatsapp-formato');

const GRAPH_API_VERSION = 'v20.0';

// LA PREGUNTA, EN UN SITIO, PARA PODER RECONOCERLA DESPUÉS.
//
// Están sueltas en constantes y no escritas dentro de `escalateQuestion` para
// que `esPreguntaDeEscalado` las use LAS MISMAS: la pregunta y su detector son
// dos mitades de lo mismo y, escritas por separado, se desincronizan (es lo que
// pasó con la nota de corte de Tenerife el 16/11/2026). Si se cambia la
// redacción, el detector cambia con ella.
const PREGUNTA = {
  es: '¿Quieres que te ponga en contacto con una persona del equipo?',
  esCerrado: '¿Quieres que igualmente te pongamos en contacto?',
  en: 'Would you like me to put you in touch with someone from the team?',
  enCerrado: 'Would you still like me to put you in touch?',
};

// Fuera de horario, la propia pregunta ya deja claro que ahora mismo no hay
// nadie y que la atención será en cuanto abramos — así el cliente no piensa que
// va a hablar con alguien al instante al pulsar "Sí".
function escalateQuestion(idioma = 'es') {
  if (idioma === 'en') {
    return isWithinBusinessHours()
      ? PREGUNTA.en
      : `We're closed at the moment (${STORES[0].hoursEn}), so nobody can help you right away. ${PREGUNTA.enCerrado} Someone will look at your conversation as soon as we're open.`;
  }
  return isWithinBusinessHours()
    ? PREGUNTA.es
    : `Ahora mismo estamos fuera del horario comercial (${STORES[0].hours}), así que nadie puede atenderte al instante. ${PREGUNTA.esCerrado} Un agente revisará tu conversación en cuanto retomemos la actividad.`;
}

// ¿Este mensaje del bot ERA la pregunta de escalado?
//
// Hace falta porque el cliente no siempre pulsa el botón: contesta por texto.
// Ver `respuestaALaPregunta`.
function esPreguntaDeEscalado(texto) {
  const t = String(texto || '');
  return Object.values(PREGUNTA).some((q) => t.includes(q));
}

// EL CLIENTE CONTESTA «SI PORFA» EN VEZ DE PULSAR EL BOTÓN (23/11/2026).
//
// Visto en real: a «¿quieres que igualmente te pongamos en contacto?» el
// cliente escribió «Si porfa», y como el aviso al equipo solo salía desde el
// `button_reply`, NO SE AVISÓ A NADIE. Peor: el turno siguió su camino normal
// hasta la IA, que redactó «Perfecto, te paso con un agente en cuanto abramos»
// —texto que no existe en el código— y el bot tampoco se paró, así que siguió
// contestando él solo doce mensajes más. El cliente ofrecía 19 armarios y 14
// mesas y se quedó esperando a alguien que nunca iba a enterarse.
//
// Es el mismo agujero del 20/11 («no entraba al escalado») visto por el otro
// lado: entró, preguntó, y la respuesta se perdió porque llegó en el formato
// que no se escuchaba. Los botones de WhatsApp no obligan a nadie: la mitad de
// la gente escribe.
//
// CONSERVADOR A PROPÓSITO: no basta con que el mensaje CONTENGA un «sí», tiene
// que ser ENTERO una respuesta a la pregunta. Cada palabra del mensaje ha de
// estar en la lista, así que «sí, pero antes dime si tenéis folios A4» no
// cuenta (tiene «folios») y sigue su camino normal. Equivocarse de más aquí es
// escalar conversaciones que nadie pidió, que es trabajo para el equipo.
const PALABRAS_SI = new Set([
  'si', 'sii', 'siii', 'sisi', 'sip', 'yes', 'yeah', 'yep', 'yup', 'sure',
  'ok', 'oka', 'okay', 'vale', 'claro', 'adelante', 'venga', 'dale',
  'perfecto', 'afirmativo', 'correcto', 'exacto',
]);

const PALABRAS_NO = new Set([
  'no', 'nop', 'nope', 'nah', 'negativo', 'dejalo', 'dejelo', 'olvidalo',
]);

// Lo que la gente añade al sí o al no sin cambiar su sentido. Si una palabra no
// está aquí ni en las de sí/no, el mensaje NO es una respuesta a la pregunta.
const RELLENO = new Set([
  'por', 'favor', 'porfa', 'porfi', 'please', 'gracias', 'thanks', 'thank', 'you',
  'plis', 'quiero', 'quisiera', 'querria', 'me', 'gustaria', 'prefiero', 'mejor',
  'eso', 'es', 'esta', 'bien', 'pues', 'bueno', 'y', 'tambien', 'mucho', 'muchas',
  'muy', 'amable', 'de', 'nada', 'hace', 'falta', 'necesario', 'tranquilo',
  'tranquila', 'ya', 'todo', 'la', 'el', 'un', 'una', 'persona',
  'agente', 'equipo', 'con', 'hablar', 'alguien',
]);

const MAXIMO_PALABRAS = 7;

function respuestaALaPregunta(texto) {
  const palabras = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (palabras.length === 0 || palabras.length > MAXIMO_PALABRAS) return null;

  const todasConocidas = palabras.every(
    (p) => PALABRAS_SI.has(p) || PALABRAS_NO.has(p) || RELLENO.has(p)
  );
  if (!todasConocidas) return null;

  // Un «no» manda sobre el resto: «no, gracias» lleva «gracias» (relleno) y
  // «no hace falta» también, pero ninguno es un sí.
  if (palabras.some((p) => PALABRAS_NO.has(p))) return 'no';
  if (palabras.some((p) => PALABRAS_SI.has(p))) return 'si';
  return null;
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
        body: { text: paraWhatsapp(greetingPrefix + escalateQuestion(idioma)) },
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

module.exports = {
  escalateQuestion,
  sendEscalateButtons,
  esPreguntaDeEscalado,
  respuestaALaPregunta,
};
