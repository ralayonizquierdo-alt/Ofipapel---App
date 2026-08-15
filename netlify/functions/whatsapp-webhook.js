// Webhook de WhatsApp Cloud API (Meta) para el agente de respuesta automática de Ofipapel.
// (deploy trigger: recoger OWNER_WHATSAPP_NUMBER añadida en Netlify)
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
//   OWNER_WHATSAPP_NUMBER   (opcional) tu número personal, en formato internacional sin
//     "+" (ej. 34600000000), para recibir un WhatsApp de aviso cuando se confirma un
//     escalado — mismo canal, así te suena la notificación de siempre
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (opcional) para archivar las
//     conversaciones y verlas en el panel (netlify/functions/conversations.js)
//   WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET  (opcional) claves de la
//     API REST de WooCommerce (ofipapel.net), para consultar productos/precios/stock
//     reales antes de responder, y para el flujo de "estado de mi pedido" (número de
//     pedido + verificación por teléfono o nombre). Sin ellas, el bot nunca confirma
//     ni descarta productos concretos y "estado de mi pedido" da solo el contacto de
//     siempre (ver woocommerce-client.js)

const crypto = require('crypto');
const {
  matchFaqRule,
  askClaude,
  notifyOwner,
  getHistory,
  appendToHistory,
  appendCustomerMessage,
  isRepeatQuestion,
  isBotPaused,
  pauseBot,
  agenteInfo,
  isAgenteInfoMessage,
} = require('./whatsapp-agent-core');
const {
  SELLOS_QUESTION,
  SELLOS_WEB_INFO,
  SELLOS_TIENDA_INFO,
  isSellosQuestion,
  isWithinBusinessHours,
  STORES,
  GREETING,
  startsWithGreeting,
  isNoSeLaRespuesta,
  NO_SE_LA_RESPUESTA,
  isUnverifiedConfirmation,
  PRODUCTO_NO_VERIFICADO_INFO,
  PEDIDOS_INFO,
  PEDIDO_ESTADO_TRIGGER,
  isPedidoEstadoQuestion,
} = require('./whatsapp-agent-config');
const woocommerce = require('./woocommerce-client');
const { sendWhatsappMessage } = require('./whatsapp-send');

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

// A veces la IA saluda por su cuenta pese a la instrucción de no hacerlo ("no hace
// falta que saludes tú al principio..."). Como el sistema YA antepone "¡Hola! "
// cuando corresponde (variable greeting), si además la IA saluda queda duplicado
// ("¡Hola! ¡Hola! Claro..." — visto en real). Se quita el saludo propio de la IA
// del texto antes de anteponer el nuestro, para que nunca aparezcan los dos.
const AI_GREETING_RE = /^\s*(¡\s*hola\s*!?|hola\s*!?|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|buenas)[\s,.!¡¿?-]*/i;
function stripAiOwnGreeting(text) {
  return text.replace(AI_GREETING_RE, '');
}

// Fuera de horario, la propia pregunta de "¿quieres que te ponga en contacto...?" ya
// deja claro que ahora mismo no hay nadie y que la atención será en cuanto abramos —
// así el cliente no piensa que va a hablar con alguien al instante al pulsar "Sí".
function escalateQuestion() {
  return isWithinBusinessHours()
    ? '¿Quieres que te ponga en contacto con una persona del equipo?'
    : `Ahora mismo estamos fuera del horario comercial (${STORES[0].hours}), así que nadie puede atenderte al instante. ¿Quieres que igualmente te pongamos en contacto? Un agente revisará tu conversación en cuanto retomemos la actividad.`;
}
const ESCALATE_DECLINE_REPLY = 'Entendido, sigo por aquí. Cuéntame otra vez qué necesitas e intento ayudarte.';

async function sendEscalateButtons(to, greetingPrefix = '') {
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
        body: { text: greetingPrefix + escalateQuestion() },
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

// Aviso por WhatsApp al número personal del dueño, solo cuando se confirma un
// escalado (no en cada mensaje, para no saturar). Requiere OWNER_WHATSAPP_NUMBER
// en Netlify; si no está configurada, se omite en silencio. Ojo: si hace más de
// 24h que no le escribes tú al bot, Meta puede rechazar este envío (ventana de
// mensajería) — en ese caso solo falla el aviso, no la conversación con el cliente.
async function notifyOwnerByWhatsapp(customerPhone, lastCustomerMessage) {
  const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;
  if (!ownerNumber) return;

  const panelUrl = `${process.env.URL || ''}/.netlify/functions/conversations?phone=${encodeURIComponent(customerPhone)}`;
  const alert = `🔔 *Ofipapel Bot* — un cliente quiere hablar con una persona\n\n📱 ${customerPhone}\n💬 Último mensaje: "${lastCustomerMessage}"\n\n👉 Ver conversación: ${panelUrl}`;

  await sendWhatsappMessage(ownerNumber, alert);
}

// Si el cliente confirma o rechaza los botones "¿Quieres hablar con una persona?".
// Solo cuando confirma con "Sí" se avisa por email y se marca en el panel de
// conversaciones (que detecta el aviso con isAgenteInfoMessage sobre el historial).
async function handleEscalateReply(message) {
  const buttonId = message.interactive.button_reply.id;

  if (buttonId === 'escalate_yes') {
    const reply = agenteInfo();
    await sendWhatsappMessage(message.from, reply);
    await appendToHistory(message.from, '[El cliente confirmó que quiere hablar con una persona]', reply);
    await pauseBot(message.from, 24);
    await notifyOwner({
      channel: 'Meta',
      from: message.from,
      customerMessage: '(confirmó que quiere hablar con una persona del equipo)',
      botReply: reply,
    });
    const history = await getHistory(message.from);
    const lastUserMessage = [...history].reverse().find((m) => m.role === 'user');
    await notifyOwnerByWhatsapp(message.from, lastUserMessage ? lastUserMessage.content : '(sin mensaje previo)');
    return;
  }

  if (buttonId === 'escalate_no') {
    await sendWhatsappMessage(message.from, ESCALATE_DECLINE_REPLY);
    await appendToHistory(message.from, '[El cliente prefirió seguir con el bot]', ESCALATE_DECLINE_REPLY);
  }
}

// Botones "¿Web o tienda?" para sellos personalizados, en vez de soltar de golpe
// las dos vías de pedido (ver whatsapp-agent-config.js: SELLOS_QUESTION/WEB/TIENDA).
async function sendSellosButtons(to, greetingPrefix = '') {
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
        body: { text: greetingPrefix + SELLOS_QUESTION },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'sellos_web', title: '🌐 Por la web' } },
            { type: 'reply', reply: { id: 'sellos_tienda', title: '🏬 En tienda' } },
          ],
        },
      },
    }),
  });

  if (!resp.ok) {
    console.error('Error enviando botones de sellos:', resp.status, await resp.text());
  }
}

async function handleSellosReply(message) {
  const buttonId = message.interactive.button_reply.id;
  const reply = buttonId === 'sellos_web' ? SELLOS_WEB_INFO : SELLOS_TIENDA_INFO;
  await sendWhatsappMessage(message.from, reply);
  await appendToHistory(message.from, `[El cliente eligió ${buttonId === 'sellos_web' ? 'web' : 'tienda'} para el sello]`, reply);
}

// Antes de ofrecer un agente por "pregunta repetida" (no por petición explícita),
// se le da al cliente una oportunidad de reformular — igual que con el flujo de
// pedidos, el paso se deduce mirando si la última respuesta del bot fue esta.
const ACLARACION_MARCA = '[Se preguntó si no se entendió bien]';
const ACLARACION_REPLY = 'Perdona, creo que no te he entendido bien. ¿Puedes explicarme de otra forma qué necesitas?';

function yaSePidioAclaracion(history) {
  const ultimoBot = [...history].reverse().find((m) => m.role === 'assistant');
  return Boolean(ultimoBot && ultimoBot.content.startsWith(ACLARACION_MARCA));
}

// Flujo de "estado de mi pedido": el paso en el que estamos se deduce del propio
// historial (sin Redis aparte) mirando si la última respuesta del bot llevaba un
// marcador al principio. Si el cliente se va por otro lado, el flujo se abandona
// solo (la última respuesta del bot ya no será la del marcador).
const PEDIDO_MARCA_ESPERANDO_NUMERO = '[PEDIDO:ESPERANDO_NUMERO]';
const PEDIDO_MARCA_ESPERANDO_NOMBRE_RE = /^\[PEDIDO:ESPERANDO_NOMBRE:(\d+)\]/;

function marcaEsperandoNombre(orderId) {
  return `[PEDIDO:ESPERANDO_NOMBRE:${orderId}]`;
}

function detectarPasoPedido(history) {
  const ultimoBot = [...history].reverse().find((m) => m.role === 'assistant');
  if (!ultimoBot) return null;
  if (ultimoBot.content.startsWith(PEDIDO_MARCA_ESPERANDO_NUMERO)) return { paso: 'numero' };
  const m = PEDIDO_MARCA_ESPERANDO_NOMBRE_RE.exec(ultimoBot.content);
  if (m) return { paso: 'nombre', orderId: m[1] };
  return null;
}

// Continúa una búsqueda de pedido ya empezada. Devuelve true si se ha encargado del
// mensaje (no hay que seguir con el flujo normal de FAQ/escalado/IA para este turno).
async function continuarBusquedaPedido(from, text, paso, greeting) {
  if (paso.paso === 'numero') {
    const match = text.match(/\d{3,}/);
    if (!match) return false; // no parece un número de pedido: se abandona el flujo, turno normal

    const orderId = match[0];
    const order = await woocommerce.getOrder(orderId);

    if (!order || woocommerce.isSpamOrder(order)) {
      const prefix = `${greeting}No encuentro ningún pedido con el número ${orderId}. `;
      await sendEscalateButtons(from, prefix);
      await appendToHistory(from, text, `[Se ofreció escalar a una persona] ${prefix}${escalateQuestion()}`);
      return true;
    }

    if (woocommerce.phoneMatches(order, from)) {
      const reply = greeting + woocommerce.formatOrderStatus(order);
      await appendToHistory(from, text, reply);
      await sendWhatsappMessage(from, reply);
      return true;
    }

    // El teléfono del pedido no coincide con el número que escribe (p. ej. compró
    // con el teléfono de la empresa y escribe desde el personal) — segunda comprobación.
    const reply = `${greeting}Para confirmar que el pedido es tuyo, dime el nombre comercial o el nombre y apellidos con los que se hizo.`;
    await appendToHistory(from, text, `${marcaEsperandoNombre(order.id)}${reply}`);
    await sendWhatsappMessage(from, reply);
    return true;
  }

  if (paso.paso === 'nombre') {
    const order = await woocommerce.getOrder(paso.orderId);
    if (order && !woocommerce.isSpamOrder(order) && woocommerce.nombreCoincide(text, order)) {
      const reply = greeting + woocommerce.formatOrderStatus(order);
      await appendToHistory(from, text, reply);
      await sendWhatsappMessage(from, reply);
      return true;
    }

    const prefix = `${greeting}No he podido confirmar que el pedido sea tuyo. `;
    await sendEscalateButtons(from, prefix);
    await appendToHistory(from, text, `[Se ofreció escalar a una persona] ${prefix}${escalateQuestion()}`);
    return true;
  }

  return false;
}

// Primera vez que preguntan por el estado de un pedido concreto. Si WooCommerce no
// está configurado, cae al comportamiento de siempre (solo dar el contacto).
async function iniciarBusquedaPedido(from, text, greeting) {
  if (!woocommerce.isConfigured()) {
    const reply = greeting + PEDIDOS_INFO;
    await appendToHistory(from, text, reply);
    await sendWhatsappMessage(from, reply);
    return;
  }

  const reply = greeting + PEDIDO_ESTADO_TRIGGER;
  await appendToHistory(from, text, `${PEDIDO_MARCA_ESPERANDO_NUMERO}${reply}`);
  await sendWhatsappMessage(from, reply);
}

async function handleIncomingMessage(message) {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    const buttonId = message.interactive.button_reply.id;
    if (buttonId === 'sellos_web' || buttonId === 'sellos_tienda') {
      await handleSellosReply(message);
      return;
    }
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

  // Bot en pausa (escalado confirmado o respuesta manual reciente desde el panel):
  // se guarda el mensaje para que lo vea la persona, pero no se contesta automático.
  if (await isBotPaused(message.from)) {
    await appendCustomerMessage(message.from, text);
    return;
  }

  const history = await getHistory(message.from);
  const faqReply = matchFaqRule(text);
  const isExplicitRequest = isAgenteInfoMessage(faqReply || ''); // "hablar con alguien", queja, presupuesto...
  const isRepeated = !faqReply && isRepeatQuestion(text, history);
  const wantsEscalation = isExplicitRequest || isRepeated;

  // Si el cliente saluda junto con su pregunta (p. ej. "Buenas tardes, ¿hacéis
  // escaneados?"), se antepone el saludo a la respuesta que sea — así no hace falta
  // que ninguna regla individual ni la IA se acuerden de saludar por su cuenta.
  const greeting = startsWithGreeting(text) ? '¡Hola! ' : '';

  // Si la última respuesta del bot fue "dime el número de tu pedido" o "confírmame
  // el nombre", este mensaje es la continuación de esa búsqueda concreta — se
  // gestiona aparte de FAQ/escalado/IA (ver detectarPasoPedido más abajo).
  const pasoPedido = detectarPasoPedido(history);
  if (pasoPedido) {
    const gestionado = await continuarBusquedaPedido(message.from, text, pasoPedido, greeting);
    if (gestionado) return;
  }

  // En la práctica, los clientes casi nunca escriben la frase exacta "estado de mi
  // pedido" — piden "info sobre un pedido" con sus propias palabras y, cuando se
  // les pregunta (por la IA, con su propia redacción, no siempre por el flujo
  // determinista), simplemente escriben el número suelto. Si el mensaje ES solo un
  // número (5 a 8 dígitos, sin nada más), lo más probable con diferencia es que sea
  // un número de pedido — se intenta la búsqueda real directamente, sin depender de
  // haber detectado antes la frase exacta que arranca el flujo.
  if (!pasoPedido && woocommerce.isConfigured() && /^\d{5,8}$/.test(text.trim())) {
    const gestionado = await continuarBusquedaPedido(message.from, text, { paso: 'numero' }, greeting);
    if (gestionado) return;
  }

  if (isExplicitRequest) {
    // El cliente pidió expresamente hablar con alguien (o es una queja/
    // presupuesto) — no hace falta explicar el motivo, se escala directo.
    await sendEscalateButtons(message.from, greeting);
    await appendToHistory(message.from, text, `[Se ofreció escalar a una persona] ${greeting}${escalateQuestion()}`);
    return;
  }

  if (isRepeated) {
    // No se salta directo a ofrecer un agente la primera vez que se detecta una
    // pregunta parecida a una anterior — puede que el bot simplemente no haya
    // entendido bien la forma de preguntar. Se da una oportunidad de reformular
    // primero; solo si INSISTE otra vez después de esa pregunta (ya serían 3
    // intentos seguidos sin resolver) se ofrece la escalada real.
    if (yaSePidioAclaracion(history)) {
      const prefix = `${greeting}Veo que no he conseguido resolver tu duda. `;
      await sendEscalateButtons(message.from, prefix);
      await appendToHistory(message.from, text, `[Se ofreció escalar a una persona] ${prefix}${escalateQuestion()}`);
      return;
    }

    const reply = greeting + ACLARACION_REPLY;
    await appendToHistory(message.from, text, `${ACLARACION_MARCA}${reply}`);
    await sendWhatsappMessage(message.from, reply);
    return;
  }

  if (isSellosQuestion(faqReply || '')) {
    await sendSellosButtons(message.from, greeting);
    await appendToHistory(message.from, text, `[Se preguntó web o tienda para el sello] ${greeting}${SELLOS_QUESTION}`);
    return;
  }

  if (isPedidoEstadoQuestion(faqReply || '')) {
    await iniciarBusquedaPedido(message.from, text, greeting);
    return;
  }

  if (faqReply) {
    const reply = faqReply === GREETING ? faqReply : greeting + faqReply;
    await appendToHistory(message.from, text, reply);
    await sendWhatsappMessage(message.from, reply);
    return;
  }

  // Búsqueda en tiempo real en el catálogo real (WooCommerce), para que la IA pueda
  // contestar con datos ciertos en vez de adivinar. Si no está configurado o no hay
  // coincidencias, sigue el comportamiento anterior (nunca confirma productos).
  let productContext = null;
  if (woocommerce.isConfigured()) {
    // Si el mensaje es muy corto (p. ej. "A4", "en fucsia", "tenaza"), lo más
    // probable es que sea la respuesta a una pregunta de aclaración de la IA sobre
    // tamaño/color/tipo — se combina con el mensaje anterior del cliente para no
    // perder ese contexto en la búsqueda (si se buscara solo "A4", encontraría
    // cualquier cosa en A4).
    const esRespuestaCorta = text.trim().split(/\s+/).filter(Boolean).length <= 3;
    const lastUserMsg = esRespuestaCorta ? [...history].reverse().find((m) => m.role === 'user') : null;
    const searchQuery = lastUserMsg ? `${lastUserMsg.content} ${text}` : text;

    const [productos, categorias] = await Promise.all([
      woocommerce.searchProducts(searchQuery, 6),
      woocommerce.searchCategories(searchQuery),
    ]);

    const bloques = [];
    if (productos.length > 0) {
      bloques.push(
        `PRODUCTOS que coinciden:\n${productos
          .map((p) => `- ${p.nombre}: ${p.precio || 'precio no disponible'}, ${p.disponible ? 'con stock' : 'sin stock'} (${p.url})`)
          .join('\n')}`
      );
    }
    if (categorias.length > 0) {
      bloques.push(
        `CATEGORÍAS que coinciden (útil cuando la pregunta es genérica y hay varios tipos distintos):\n${categorias
          .map((c) => `- ${c.nombre} (${c.cantidadProductos} productos): ${c.url}`)
          .join('\n')}`
      );
    }
    if (bloques.length > 0) productContext = bloques.join('\n\n');
  }

  const aiReply = await askClaude(text, history, productContext);

  // Red de seguridad: si la IA confirma con un "sí, vendemos/tenemos..." SIN que
  // hubiera resultados reales de búsqueda para este turno, no nos fiamos de esa
  // afirmación — puede ser pura invención (se ha visto en pruebas reales). Pero si
  // SÍ hubo productContext real (la búsqueda encontró algo de verdad), la
  // confirmación puede ser legítima — se ha comprobado en real que "pistolas de
  // silicona" existe en el catálogo y la IA contestaba bien, pero esta red de
  // seguridad lo descartaba igualmente por no mirar si había datos de respaldo.
  if (!productContext && isUnverifiedConfirmation(aiReply)) {
    const infoReply = greeting + PRODUCTO_NO_VERIFICADO_INFO;
    await appendToHistory(message.from, text, infoReply);
    await sendWhatsappMessage(message.from, infoReply);
    return;
  }

  // La IA no sabía la respuesta con certeza: en vez de fiarse de que la frase-
  // sentinela sea la ÚNICA respuesta (la IA a veces le añade contexto propio
  // delante, p. ej. "No tengo información sobre ese producto. [sentinela]"), se
  // manda esa parte útil como mensaje aparte (si la hay) y SIEMPRE se sigue con un
  // segundo mensaje con los botones reales de escalado — así el cliente se queda
  // con la info que sí había, y además con la opción real de hablar con alguien,
  // en vez de depender de que la IA repita una frase exacta sin nada más.
  if (isNoSeLaRespuesta(aiReply)) {
    const infoPart = stripAiOwnGreeting(aiReply.split(NO_SE_LA_RESPUESTA)[0].trim()).trim();

    if (infoPart) {
      const infoReply = greeting + infoPart;
      await appendToHistory(message.from, text, infoReply);
      await sendWhatsappMessage(message.from, infoReply);
    }

    // Si ya se mandó la parte informativa (con su saludo, si tocaba), el segundo
    // mensaje va sin repetir saludo ni "no sé la respuesta" — la propia pregunta de
    // escalado ("¿quieres que te ponga en contacto...?") ya funciona como sugerencia
    // aparte sin sonar redundante.
    const prefix = infoPart ? '' : `${greeting}No tengo la respuesta exacta a eso. `;
    await sendEscalateButtons(message.from, prefix);
    await appendToHistory(
      message.from,
      infoPart ? '[continuación automática: se ofreció además hablar con un agente]' : text,
      `${prefix}${escalateQuestion()}`
    );
    return;
  }

  const reply = greeting + stripAiOwnGreeting(aiReply);
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
