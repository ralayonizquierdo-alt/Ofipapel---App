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
//   OWNER_ALERT_TEMPLATE    (opcional) nombre de la plantilla aprobada en WhatsApp
//     Manager con la que avisarte de un escalado. Sin ella el aviso va en texto libre,
//     que SOLO llega si le has escrito al bot en las últimas 24h (ventana de
//     mensajería de Meta) — ver notifyOwnerByWhatsapp y WHATSAPP_SETUP.md
//   OWNER_ALERT_TEMPLATE_LANG  (opcional) idioma de esa plantilla; por defecto "es"
//   BOT_PAUSADO             (opcional) ponla a "1" para que el bot deje de responder a
//     TODOS los clientes. Es la parada de emergencia de respaldo: la normal es el botón
//     "Parar el bot" del panel de conversaciones, que no requiere desplegar. Ésta se usa
//     cuando el panel no está disponible (ver getPausaGlobalEfectiva)
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
//   WOOCOMMERCE_BYPASS_TOKEN  (opcional) valor secreto que el bot manda en la cabecera
//     X-Ofipapel-Bot al llamar a ofipapel.net, para que la protección anti-bots del
//     hosting lo reconozca y lo deje pasar. Solo hace falta si quien administra la web
//     monta la excepción por cabecera en vez de por ruta — ver WHATSAPP_SETUP.md,
//     "Cuando ofipapel.net nos bloquea". Sin ella, el bot no manda esa cabecera.

const crypto = require('crypto');
const {
  matchFaqRule,
  askClaude,
  notifyOwner,
  getHistory,
  appendToHistory: appendToHistoryBase,
  appendCustomerMessage,
  isRepeatQuestion,
  isBotPaused,
  pauseBot,
  isAgenteInfoMessage,
} = require('./whatsapp-agent-core');
const {
  SELLOS_QUESTION,
  SELLOS_WEB_INFO,
  SELLOS_TIENDA_INFO,
  isSellosQuestion,
  isWithinBusinessHours,
  esProblemaDeCuenta,
  mensajeProblemaDeCuenta,
  STORES,
  GREETING,
  PRESENTACION,
  PRESENTACION_BREVE,
  PRESENTACION_BREVE_EN,
  presentacionPara,
  presentacionEn,
  agenteInfoEn,
  isAgenteInfoEnCualquierIdioma,
  PAUSA_GLOBAL_REPLY,
  ESPERA_REPLY,
  startsWithGreeting,
  isNoSeLaRespuesta,
  NO_SE_LA_RESPUESTA,
  isUnverifiedConfirmation,
  isUnverifiedStockClaim,
  preciosSinRespaldo,
  pideLaFotoOtraVez,
  PRODUCTO_NO_VERIFICADO_INFO,
  pedidosInfo,
  pedidoEstadoTrigger,
  isPedidoEstadoQuestion,
} = require('./whatsapp-agent-config');
const woocommerce = require('./woocommerce-client');
const gestion = require('./gestion-pedidos');
const { sendWhatsappMessage: entregarAlCliente, sendWhatsappTemplate } = require('./whatsapp-send');
const { escalateQuestion, sendEscalateButtons } = require('./whatsapp-escalado');

// EL BOT TIENE QUE ENTERARSE DE QUE NO LE LLEGA AL CLIENTE.
//
// Las 19 llamadas de envío de este fichero ignoraban el resultado: el bot
// recibía el mensaje, preparaba la respuesta, intentaba mandarla, FALLABA, y
// archivaba la respuesta en el panel como si hubiera salido. Desde el panel se
// veía una conversación contestada; el cliente no había recibido nada.
//
// Eso es exactamente la forma del apagón de septiembre: fallar en silencio. Y
// volvió a pasar el 17/10/2026, cuando caducó el token de Meta — el bot estuvo
// horas "contestando" al vacío.
//
// Se envuelve el envío una sola vez, con el mismo nombre, para no tocar los 19
// sitios. Si falla, se anota como fallo del bot y el panel lo grita en rojo
// arriba del todo, con el motivo que haya dado Meta y a quién no le llegó.
async function sendWhatsappMessage(to, body, citando) {
  const resultado = await entregarAlCliente(to, body, citando);
  if (!resultado?.ok) {
    try {
      const motivo = String(resultado?.error || 'sin detalle').slice(0, 300);
      await conversationStore.registrarFalloDelBot(
        `No se pudo ENTREGAR la respuesta a ${to}. WhatsApp dijo: ${motivo}`,
        to
      );
    } catch {
      // Avisar del fallo no puede provocar otro fallo.
    }
  }
  return resultado;
}
const { construirContextoCatalogo, unirContexto } = require('./whatsapp-catalogo');
const { respuestaSinCatalogo } = require('./whatsapp-consumibles');
const { detectarHostilidad, mensajeClienteMolesto } = require('./whatsapp-hostilidad');
const { todasLasNotas, notasQueAplican, notaDeFicha } = require('./whatsapp-notas');
const { guardarAdjuntoDeCliente, MARCA_ADJUNTO, adjuntoDelHistorial } = require('./whatsapp-media');
const {
  leerFoto,
  sePuedeLeer: sePuedeLeerLaFoto,
  paraElPanel: lecturaParaElPanel,
  ultimaFotoDelHistorial,
  preguntaJustoAntesDeLaFoto,
} = require('./whatsapp-vision');
const { responderAUnaFoto } = require('./whatsapp-foto-responder');

// EL HISTORIAL, VISTO POR LA IA.
//
// Lo archivado lleva marcas que son fontanería del panel ("[ADJUNTO:wamid...]",
// que es con lo que se pinta la imagen). Para la IA eso es ruido, y encima ruido
// con pinta de identificador. Se quita, y lo que queda sí se entiende solo:
// "[El cliente envió una foto] — "¿tenéis este?"" con, debajo, lo que se vio en
// ella. Ese apunte es la memoria de la foto cuando la pregunta llega después,
// en un mensaje aparte.
function historialParaLaIA(history = []) {
  return history.map((m) => {
    const adjunto = adjuntoDelHistorial(m.content);
    return adjunto ? { ...m, content: adjunto.texto } : m;
  });
}
const { idiomaDeRespuesta } = require('./whatsapp-idioma');
const { firmaDeReintento } = require('./whatsapp-firma');
const conversationStore = require('./conversation-store');

// Para todo lo que archiva desde FUERA de handleIncomingMessage (los botones,
// la búsqueda de pedido): ahí no hay mensaje entrante del que sacar el wamid,
// así que se archiva sin él. Dentro de handleIncomingMessage hay otra con el
// mismo nombre que sí lo lleva y tapa a ésta.
const appendToHistory = (from, userText, botReply, wamid) =>
  appendToHistoryBase(from, userText, botReply, wamid);

const GRAPH_API_VERSION = 'v20.0';
const DEDUP_TTL_MS = 5 * 60 * 1000;

// Respaldo en memoria de la deduplicación: solo cubre reintentos que caigan en
// ESTA misma instancia de la función. Se mantiene porque es instantáneo y porque
// cubre el caso de que no haya almacén compartido configurado.
const processedMessageIds = new Map();

function yaVistoEnMemoria(messageId) {
  const now = Date.now();
  for (const [id, ts] of processedMessageIds) {
    if (now - ts > DEDUP_TTL_MS) processedMessageIds.delete(id);
  }
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.set(messageId, now);
  return false;
}

// Meta reenvía el mensaje si la función tarda en contestar, y ese reenvío puede
// caer en OTRA instancia de la función, que no comparte memoria con la primera
// — el cliente recibía entonces dos respuestas distintas al mismo mensaje
// (visto en real). Por eso, además del respaldo en memoria, se reserva el id en
// el almacén compartido, que sí es común a todas las instancias.
async function alreadyProcessed(messageId) {
  if (yaVistoEnMemoria(messageId)) return true;
  const esNuevo = await conversationStore.claimMessage(messageId);
  return !esNuevo;
}

function verifySignature(event) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // CIERRA POR DEFECTO. Antes esto devolvía `true`: sin la variable, el
    // webhook aceptaba cualquier petición y solo dejaba un aviso en unos logs
    // que nadie mira. Cualquiera que conociera la URL podía simular mensajes
    // de cliente reales — gastando cuota de Claude, disparando avisos falsos
    // al propietario y metiendo conversaciones inventadas en el panel.
    //
    // Es el mismo patrón que ya mordió dos veces en este repositorio
    // (`marketing-engine-run`, DT-25; y `leer-reserva-airbnb`): un descuido de
    // configuración no debe abrir un endpoint en silencio.
    //
    // El intercambio, explícito: si la variable desaparece, el bot deja de
    // responder a los clientes. Eso se nota en horas y se arregla poniendo la
    // variable. Lo contrario —aceptar mensajes de cualquiera— no se nota nunca.
    console.error('whatsapp-webhook: falta WHATSAPP_APP_SECRET. Se rechazan TODAS las peticiones hasta que se configure: sin ella no hay forma de distinguir a Meta de un impostor.');
    return false;
  }

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

// ¿Ya le hemos soltado esta misma frase hace nada?
//
// Las respuestas de seguridad son fijas, palabra por palabra. Dichas una vez
// son razonables; repetidas, son un bot colgado. El 5/10/2026 un cliente
// recibió "¿Qué estás buscando exactamente?" CUATRO veces seguidas mientras le
// iba diciendo exactamente qué buscaba.
//
// Se mira solo lo reciente: que hace tres semanas se le dijera lo mismo no
// significa que ahora esté en bucle.
const MENSAJES_QUE_CUENTAN_COMO_REPETIR = 6;

function yaSeDijo(history = [], frase) {
  const limpio = String(frase || '').trim();
  if (!limpio) return false;
  return history
    .slice(-MENSAJES_QUE_CUENTAN_COMO_REPETIR)
    .filter((m) => m.role === 'assistant' || m.role === 'agent')
    .some((m) => String(m.content || '').includes(limpio));
}

// escalateQuestion y sendEscalateButtons viven ahora en whatsapp-send.js: los
// comparte la función de segundo plano que contesta a las fotos.
const ESCALATE_DECLINE_REPLY = 'Entendido, sigo por aquí. Cuéntame otra vez qué necesitas e intento ayudarte.';
const ESCALATE_DECLINE_REPLY_EN = "Understood, I'm still here. Tell me again what you need and I'll try to help.";

function escalateDeclineReply(idioma = 'es') {
  return idioma === 'en' ? ESCALATE_DECLINE_REPLY_EN : ESCALATE_DECLINE_REPLY;
}


// Aviso por WhatsApp al número personal del dueño, solo cuando se confirma un
// escalado (no en cada mensaje, para no saturar). Requiere OWNER_WHATSAPP_NUMBER
// en Netlify; si no está configurada, se omite en silencio.
//
// OJO CON LA VENTANA DE 24 HORAS, que es lo que decide cómo se manda esto: Meta
// solo deja escribir texto libre a quien te ha escrito a ti en las últimas 24
// horas. Para WhatsApp, el dueño es un cliente más del número del bot — así que
// si hace más de un día que no le escribe al bot, un aviso en texto libre NO le
// llega, y encima falla en silencio. Y un aviso de escalado salta precisamente
// cuando no está escribiéndole al bot, o sea: casi siempre fuera de la ventana.
//
// La forma correcta de escribir fuera de la ventana es una PLANTILLA aprobada
// por Meta. Por eso, si OWNER_ALERT_TEMPLATE está configurada se usa esa vía,
// que funciona a cualquier hora. El texto libre queda solo como respaldo para
// cuando no hay plantilla configurada todavía, o cuando el envío por plantilla
// falla por lo que sea.
//
// En cualquier caso, el aviso por EMAIL (notifyOwner) va aparte y no depende de
// nada de esto: es el que hay que considerar fiable.
async function notifyOwnerByWhatsapp(customerPhone, lastCustomerMessage) {
  const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;
  if (!ownerNumber) return;

  const plantilla = process.env.OWNER_ALERT_TEMPLATE;
  if (plantilla) {
    const enviado = await sendWhatsappTemplate(
      ownerNumber,
      plantilla,
      [customerPhone, lastCustomerMessage],
      // 'es_ES', no 'es': en WhatsApp Manager el idioma que se eligió es
      // "Spanish (SPA)", y su código de API es es_ES. Son plantillas DISTINTAS
      // para Meta — mandar con el código equivocado falla con "template does
      // not exist", aunque la plantilla esté aprobada y se llame igual.
      process.env.OWNER_ALERT_TEMPLATE_LANG || 'es_ES'
    );
    if (enviado.ok) return;
    console.error('La plantilla de aviso falló; se intenta en texto libre (solo llegará si la ventana de 24h está abierta).');
  }

  const panelUrl = `${process.env.URL || ''}/.netlify/functions/conversations?phone=${encodeURIComponent(customerPhone)}`;
  const alert = `🔔 *Ofipapel Bot* — un cliente quiere hablar con una persona\n\n📱 ${customerPhone}\n💬 Último mensaje: "${lastCustomerMessage}"\n\n👉 Ver conversación: ${panelUrl}`;

  await sendWhatsappMessage(ownerNumber, alert);
}

// Si el cliente confirma o rechaza los botones "¿Quieres hablar con una persona?".
// Solo cuando confirma con "Sí" se avisa por email y se marca en el panel de
// conversaciones (que detecta el aviso con isAgenteInfoMessage sobre el historial).
async function handleEscalateReply(message) {
  const buttonId = message.interactive.button_reply.id;
  // El botón no dice nada del idioma ("Yes"/"Sí" son un id fijo), así que se
  // usa el que se recordó de la conversación. Es una lectura más de la ficha,
  // pero solo al pulsar un botón: no mueve el consumo.
  const ficha = await conversationStore.getFichaCliente(message.from);
  const idioma = ficha?.idioma || 'es';

  if (buttonId === 'escalate_yes') {
    const reply = agenteInfoEn(idioma);
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
    const reply = escalateDeclineReply(idioma);
    await sendWhatsappMessage(message.from, reply);
    await appendToHistory(message.from, '[El cliente prefirió seguir con el bot]', reply);
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
const ACLARACION_REPLY_EN = "Sorry, I don't think I've understood you properly. Could you tell me what you need in another way?";

function aclaracionReply(idioma = 'es') {
  return idioma === 'en' ? ACLARACION_REPLY_EN : ACLARACION_REPLY;
}

// Lo último que dijo el bot fue "explícamelo de otra forma": lo que llegue
// ahora es la reformulación que se le pidió, no una insistencia.
function estaReformulando(history) {
  const ultimoBot = [...history].reverse().find((m) => m.role === 'assistant');
  return Boolean(ultimoBot && ultimoBot.content.startsWith(ACLARACION_MARCA));
}

// Ya se le pidió que reformulara en algún momento cercano. Volver a pedírselo
// sería marearle en círculos: toca ofrecerle una persona.
const MENSAJES_QUE_RECUERDAN_LA_ACLARACION = 8;

function yaSePidioAclaracion(history) {
  return history
    .slice(-MENSAJES_QUE_RECUERDAN_LA_ACLARACION)
    .some((m) => m.role === 'assistant' && m.content.startsWith(ACLARACION_MARCA));
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

// «FIGURA COMO ENTREGADO» Y EL CLIENTE DICE QUE NO LO HA RECIBIDO.
//
// Eso ya no es una duda sobre el estado: es un problema, y de los que no se
// arreglan con otra frase del bot. Puede ser que lo recogiera otra persona de
// la empresa, que el reparto se cerrara sin entregar o que se haya extraviado —
// nada de eso lo puede resolver un bot, y repetirle «figura como entregado» a
// quien acaba de decir que no lo tiene es la forma más rápida de enfadarlo.
//
// Solo cuenta si el mensaje anterior del bot fue justo el de «entregado» (de
// ahí la marca): «no me ha llegado» en mitad de otra conversación es otra cosa.
const NIEGA_LA_ENTREGA_RE =
  /\bno\s+(me\s+)?(lo|la|le)?\s*(ha\s+|han\s+)?(lleg|recib|entreg|traj|vino|venido)/i;

function negacionDeEntrega(history, text) {
  const ultimoBot = [...history].reverse().find((m) => m.role === 'assistant' || m.role === 'agent');
  if (!ultimoBot || !String(ultimoBot.content || '').startsWith(MARCA_PEDIDO_ENTREGADO)) return false;
  return NIEGA_LA_ENTREGA_RE.test(String(text || ''));
}

function detectarPasoPedido(history) {
  const ultimoBot = [...history].reverse().find((m) => m.role === 'assistant');
  if (!ultimoBot) return null;
  if (ultimoBot.content.startsWith(PEDIDO_MARCA_ESPERANDO_NUMERO)) return { paso: 'numero' };
  const m = PEDIDO_MARCA_ESPERANDO_NOMBRE_RE.exec(ultimoBot.content);
  if (m) return { paso: 'nombre', orderId: m[1] };
  return null;
}

// EL ESTADO DEL PEDIDO, CON EL DE GEMINISWIN SI LO TENEMOS.
//
// Se llama desde los DOS caminos de verificación (teléfono y nombre) y solo
// desde ahí: cuando se llega aquí, WooCommerce ya ha confirmado que el pedido
// es de quien escribe. La tabla de Gestión no lleva nombres a propósito, así
// que la identidad nunca se comprueba contra ella.
//
// Devuelve { texto, ofrecerPersona, entregado }. Si Gestión no sabe nada de ese
// pedido, si el dato está caducado o si Supabase no contesta, se cae al estado
// de WooCommerce de siempre — nunca se deja a un cliente sin respuesta.
const MARCA_PEDIDO_ENTREGADO = '[PEDIDO:ENTREGADO]';

async function respuestaDeEstado(order, idioma) {
  const porDefecto = { texto: woocommerce.formatOrderStatus(order, idioma), ofrecerPersona: false };

  let fila = null;
  try {
    fila = await gestion.estadoDeGestion(order.id);
  } catch (err) {
    console.error('No se pudo consultar el estado de Gestión:', err);
  }
  if (!fila) return porDefecto;

  // El dato es viejo: el publicador se ha saltado una pasada entera. Se da lo
  // que diga WooCommerce y se ofrece una persona, porque lo de la web puede ir
  // por detrás y ya no tenemos con qué corregirlo.
  if (gestion.caducado(fila.actualizado)) {
    console.error(`gestion-pedidos: dato caducado del pedido ${order.id} (${fila.actualizado}).`);
    return { ...porDefecto, ofrecerPersona: true };
  }

  const frase = gestion.fraseDeEstado(fila, new Date(), idioma);
  if (!frase) return porDefecto;

  return {
    texto: `${woocommerce.encabezadoDelPedido(order, idioma)} ${frase.texto}`.trim(),
    ofrecerPersona: Boolean(frase.ofrecerPersona),
    entregado: Boolean(frase.entregado),
  };
}

// Manda la respuesta del estado por donde toque: un mensaje normal, o el texto
// con los botones de hablar con una persona cuando el estado lo pide (anulado,
// incidencia, no entregado, retraso o dato caducado).
async function contestarElEstado(from, text, order, greeting, idioma) {
  const { texto, ofrecerPersona, entregado } = await respuestaDeEstado(order, idioma);

  if (ofrecerPersona) {
    const prefijo = `${greeting}${texto} `;
    await sendEscalateButtons(from, prefijo, idioma);
    await appendToHistory(from, text, `${prefijo}${escalateQuestion(idioma)}`);
    return;
  }

  const reply = greeting + texto;
  // La marca solo sirve para reconocer el turno siguiente: si el cliente
  // contesta que no lo ha recibido, eso no es una duda, es un problema.
  await appendToHistory(from, text, `${entregado ? MARCA_PEDIDO_ENTREGADO : ''}${reply}`);
  await sendWhatsappMessage(from, reply);
}

// Continúa una búsqueda de pedido ya empezada. Devuelve true si se ha encargado del
// mensaje (no hay que seguir con el flujo normal de FAQ/escalado/IA para este turno).
// ¿Este mensaje va de UN pedido concreto, con su número dentro?
//
// Las palabras clave no bastan. Comprobado con un cliente real: escribió "pasó
// algo con el pdido #637491?" — con la errata, ninguna palabra clave coincidió,
// el bot nunca llegó a consultar WooCommerce y le contestó que no tenía acceso
// a sus pedidos, teniéndolo. El número, en cambio, estaba ahí desde el primer
// mensaje.
//
// Tres formas de reconocerlo, de más segura a menos:
//   - El mensaje ES solo un número (contestando a "dime el número de pedido").
//   - El número va precedido de # o nº: nadie escribe eso salvo para referirse
//     a un pedido o a una factura.
//   - Aparece la palabra "pedido" (aunque esté mal escrita) junto a un número
//     largo. Se piden 5 dígitos o más para no confundirlo con "quiero hacer un
//     pedido de 500 folios", que también lleva la palabra y un número.
const SOLO_UN_NUMERO_RE = /^\d{5,8}$/;
const NUMERO_CON_ALMOHADILLA_RE = /(?:#|n[ºo°]\.?\s?|num\.?\s?)\s?\d{3,8}\b/i;
const PALABRA_PEDIDO_RE = /\bp[ea]?d[ie]dos?\b/i;
const NUMERO_LARGO_RE = /\b\d{5,8}\b/;

function mencionaUnPedidoConcreto(text) {
  const t = String(text || '').trim();
  if (SOLO_UN_NUMERO_RE.test(t)) return true;
  if (NUMERO_CON_ALMOHADILLA_RE.test(t)) return true;
  return PALABRA_PEDIDO_RE.test(t) && NUMERO_LARGO_RE.test(t);
}

async function continuarBusquedaPedido(from, text, paso, greeting, idioma = 'es') {
  if (paso.paso === 'numero') {
    const match = text.match(/\d{3,}/);
    if (!match) return false; // no parece un número de pedido: se abandona el flujo, turno normal

    const orderId = match[0];
    const order = await woocommerce.getOrder(orderId);

    if (!order || woocommerce.isSpamOrder(order)) {
      const prefix = idioma === 'en'
        ? `${greeting}I can't find any order with the number ${orderId}. `
        : `${greeting}No encuentro ningún pedido con el número ${orderId}. `;
      await sendEscalateButtons(from, prefix, idioma);
      await appendToHistory(from, text, `[Se ofreció escalar a una persona] ${prefix}${escalateQuestion(idioma)}`);
      return true;
    }

    if (woocommerce.phoneMatches(order, from)) {
      // Pedido ya verificado como suyo: su nombre/empresa salen de WooCommerce,
      // así que se pueden guardar en su ficha como dato fiable.
      await conversationStore.registrarPedidoVerificado(from, order);
      await contestarElEstado(from, text, order, greeting, idioma);
      return true;
    }

    // ¿Y SI EL NOMBRE VIENE EN EL MISMO MENSAJE?
    //
    // Mucha gente lo escribe todo de una vez: "PEDIDO 658818 LEMON TREE". Hasta
    // ahora el bot cogía el número, ignoraba el resto y le pedía el nombre que
    // acababa de darle — y a la segunda el cliente contesta en mayúsculas, con
    // razón (visto en real el 23/10/2026: "EL NOMBRE COMERCIAL TE LO PUSE JUSTO
    // AL LADO DEL NÚMERO DE PEDIDO").
    //
    // Es la MISMA comprobación de siempre, aplicada un paso antes y al mismo
    // mensaje: si el nombre comercial o el nombre y apellidos están ahí, el
    // pedido queda verificado y no hay que preguntar nada.
    if (woocommerce.nombreCoincide(text, order)) {
      await conversationStore.registrarPedidoVerificado(from, order);
      await contestarElEstado(from, text, order, greeting, idioma);
      return true;
    }

    // El teléfono del pedido no coincide con el número que escribe (p. ej. compró
    // con el teléfono de la empresa y escribe desde el personal) — segunda comprobación.
    const reply = idioma === 'en'
      ? `${greeting}To confirm the order is yours, tell me the company name or the full name it was placed under.`
      : `${greeting}Para confirmar que el pedido es tuyo, dime el nombre comercial o el nombre y apellidos con los que se hizo.`;
    await appendToHistory(from, text, `${marcaEsperandoNombre(order.id)}${reply}`);
    await sendWhatsappMessage(from, reply);
    return true;
  }

  if (paso.paso === 'nombre') {
    const order = await woocommerce.getOrder(paso.orderId);
    if (order && !woocommerce.isSpamOrder(order) && woocommerce.nombreCoincide(text, order)) {
      await conversationStore.registrarPedidoVerificado(from, order);
      await contestarElEstado(from, text, order, greeting, idioma);
      return true;
    }

    const prefix = idioma === 'en'
      ? `${greeting}I haven't been able to confirm the order is yours. `
      : `${greeting}No he podido confirmar que el pedido sea tuyo. `;
    await sendEscalateButtons(from, prefix, idioma);
    await appendToHistory(from, text, `[Se ofreció escalar a una persona] ${prefix}${escalateQuestion(idioma)}`);
    return true;
  }

  return false;
}

// Primera vez que preguntan por el estado de un pedido concreto. Si WooCommerce no
// está configurado, cae al comportamiento de siempre (solo dar el contacto).
async function iniciarBusquedaPedido(from, text, greeting, idioma = 'es') {
  if (!woocommerce.isConfigured()) {
    const reply = greeting + pedidosInfo(idioma);
    await appendToHistory(from, text, reply);
    await sendWhatsappMessage(from, reply);
    return;
  }

  const reply = greeting + pedidoEstadoTrigger(idioma);
  await appendToHistory(from, text, `${PEDIDO_MARCA_ESPERANDO_NUMERO}${reply}`);
  await sendWhatsappMessage(from, reply);
}

// Lanza el segundo intento en segundo plano y devuelve si se pudo lanzar. La
// llamada NO se espera a que termine: las funciones -background de Netlify
// responden 202 al momento y siguen trabajando por su cuenta, que es justo lo
// que necesitamos para no agotar el tiempo del webhook.
async function pedirSegundoIntento(from, text) {
  const base = process.env.URL;
  const firma = firmaDeReintento(from, text);
  if (!base || !firma) {
    console.error('No se puede delegar el reintento: falta URL del sitio o secreto para firmarlo.');
    return false;
  }

  try {
    const resp = await fetch(`${base}/.netlify/functions/whatsapp-reintento-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, text, firma }),
      signal: AbortSignal.timeout(2000),
    });
    // Netlify contesta 202 (aceptado) a las funciones en segundo plano.
    if (resp.status !== 202 && !resp.ok) {
      console.error('El reintento en segundo plano no aceptó la petición:', resp.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Fallo lanzando el reintento en segundo plano:', err);
    return false;
  }
}

// DEJA LA FOTO EN ESPERA Y AVISA A LA FUNCIÓN QUE LA CONTESTARÁ SI NADIE
// PREGUNTA. Devuelve si se pudo delegar: si no, quien llama contesta en el
// acto, porque lo único que no vale es dejar al cliente sin respuesta.
//
// La llamada NO se espera a que termine: las funciones -background de Netlify
// responden 202 al momento y siguen trabajando por su cuenta, que es justo lo
// que necesitamos para no agotar el tiempo del webhook.
async function dejarLaFotoEsperandoLaPregunta(from, referencia, idioma, presentacion) {
  const base = process.env.URL;
  const firma = firmaDeReintento(from, referencia);
  if (!base || !firma) {
    console.error('No se puede dejar la foto en espera: falta URL del sitio o secreto para firmarla.');
    return false;
  }

  try {
    const resp = await fetch(`${base}/.netlify/functions/whatsapp-foto-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, referencia, idioma, presentacion, firma }),
      signal: AbortSignal.timeout(2000),
    });
    if (resp.status !== 202 && !resp.ok) {
      console.error('La función de fotos en segundo plano no aceptó la petición:', resp.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Fallo dejando la foto en espera:', err);
    return false;
  }
}

// La parada de emergencia puede venir de dos sitios, y se miran los dos:
//
//  1. El interruptor del panel de conversaciones (guardado en Redis). Es el
//     rápido: dos clics desde el móvil, sin entrar en Netlify.
//  2. La variable de entorno BOT_PAUSADO=1 en Netlify. Es la red de seguridad:
//     si Redis estuviera caído, el interruptor del panel no se podría leer y el
//     bot se pondría a contestar solo otra vez — que es exactamente lo que no
//     debe pasar en una parada de emergencia. Requiere volver a desplegar, así
//     que es la lenta, pero no depende de nada más.
async function getPausaGlobalEfectiva() {
  if (process.env.BOT_PAUSADO === '1') return { desde: 1, motivo: 'BOT_PAUSADO=1 en Netlify' };
  return conversationStore.getPausaGlobal();
}

// `event` hace falta para Netlify Blobs (connectLambda), donde se guardan las
// fotos de los clientes. Se pasa explícitamente en vez de dejarlo suelto: sin
// él, la rama de adjuntos reventaba con un ReferenceError DESPUÉS de contestar
// al cliente y ANTES de registrar y avisar — o sea, el mismo agujero que se
// acababa de tapar, pero peor, porque además parecía que funcionaba.
async function handleIncomingMessage(event, message, nombreWhatsapp) {
  // El identificador del mensaje entrante viaja hasta el archivo SIN tocar las
  // veintitantas llamadas de más abajo: se define aquí una appendToHistory que
  // lo lleva puesto y tapa a la importada durante toda esta función. Se guarda
  // para poder responder citando ese mensaje desde el panel, como el
  // "Responder" de WhatsApp.
  //
  // Tocar veintidós llamadas a mano para colar un argumento es justo la clase
  // de cambio que rompió el bot el 10/9, así que se hace en un solo sitio.
  const appendToHistory = (from, userText, botReply) =>
    appendToHistoryBase(from, userText, botReply, message.id);

  // Se guarda antes que nada, y pase lo que pase después: sirve para reconocer
  // la conversación en el panel aunque el bot esté parado y no llegue a
  // contestar. Solo escribe cuando el nombre cambia (ver guardarNombreWhatsapp).
  await conversationStore.guardarNombreWhatsapp(message.from, nombreWhatsapp);

  // Bot parado del todo: no contesta a NADIE hasta que se reanude a mano. Los
  // mensajes se siguen archivando para que aparezcan en el panel y se puedan
  // contestar desde ahí — pararlo no es perder mensajes.
  const pausaGlobal = await getPausaGlobalEfectiva();
  if (pausaGlobal) {
    const texto = message.type === 'text' ? message.text?.body || '' : `[${message.type}]`;
    await appendCustomerMessage(message.from, texto);

    // Un único aviso por cliente y por pausa: si manda cinco mensajes seguidos
    // no recibe cinco veces lo mismo, pero si dentro de un mes se vuelve a
    // parar el bot, sí se le vuelve a avisar (ver marcarAvisoPausa).
    if ((await conversationStore.getAvisoPausa(message.from)) !== pausaGlobal.desde) {
      await sendWhatsappMessage(message.from, PAUSA_GLOBAL_REPLY);
      await conversationStore.marcarAvisoPausa(message.from, pausaGlobal.desde);
    }
    return;
  }

  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    const buttonId = message.interactive.button_reply.id;
    if (buttonId === 'sellos_web' || buttonId === 'sellos_tienda') {
      await handleSellosReply(message);
      return;
    }
    await handleEscalateReply(message);
    return;
  }

  // FOTOS, AUDIOS Y DEMÁS: el bot no los lee, así que van derechos a una persona.
  //
  // Antes solo contestaba "un miembro del equipo revisará esto en breve" y hacía
  // return: NO guardaba el mensaje ni avisaba a nadie. O sea que la conversación
  // no aparecía en el panel, al dueño no le llegaba nada, y el bot acababa de
  // prometer una revisión que no iba a ocurrir nunca.
  //
  // Es de los casos más frecuentes que hay — "¿tenéis este?" con la foto del
  // cartucho —, así que se trata como lo que es: algo que solo puede atender una
  // persona. Se registra, se avisa y se para el bot, igual que en un escalado.
  // UNA REACCIÓN NO ES UNA PREGUNTA. No se contesta.
  //
  // Cuando alguien le da a un emoji sobre un mensaje, Meta manda un mensaje de
  // tipo `reaction`. Caía en la rama de abajo, que está pensada para fotos y
  // audios, y el cliente recibía un "Gracias por tu mensaje. No puedo leer un
  // mensaje de tipo reaction por aquí" y los botones de hablar con una persona.
  // Visto en real el 30/9/2026: un cliente puso un 👍 para dar las gracias y
  // acabó escalado a una persona, fuera de horario.
  //
  // Se archiva para que en el panel se vea que reaccionó (dice algo: un pulgar
  // arriba cierra una conversación), pero no se contesta, no se pregunta y no
  // se escala. Como en WhatsApp de toda la vida.
  if (message.type === 'reaction') {
    const emoji = message.reaction?.emoji || '';
    await conversationStore.appendCustomerMessage(
      message.from,
      `[El cliente reaccionó${emoji ? ` con ${emoji}` : ''}]`,
      message.id
    );
    return;
  }

  // UN AVISO DE WHATSAPP TAMPOCO ES UNA PREGUNTA.
  //
  // Los mensajes de tipo `system` no los escribe el cliente: los manda Meta
  // cuando pasa algo con su cuenta, y el caso normal es que haya CAMBIADO DE
  // NÚMERO. Caían en la rama de fotos y audios, así que al cliente le llegaba
  // un "Gracias por tu mensaje. No puedo leer un mensaje de tipo system por
  // aquí. ¿Quieres que te ponga en contacto con una persona?" — a un aviso
  // automático. Visto en real el 17/10/2026.
  //
  // No se contesta, pero SÍ se anota, y en cristiano: que alguien se cambie de
  // número es justo lo que hay que saber al mirar esa conversación, porque a
  // partir de ahí escribe desde otro sitio.
  if (message.type === 'system') {
    const nuevo = message.system?.wa_id || message.system?.new_wa_id || '';
    const dice = (message.system?.body || '').trim();
    const esCambioDeNumero = message.system?.type === 'user_changed_number' || /number/i.test(message.system?.type || '');
    const texto = esCambioDeNumero
      ? `[WhatsApp avisa: este cliente ha cambiado de número${nuevo ? `. El nuevo es ${nuevo}` : ''}]`
      : `[Aviso de WhatsApp${dice ? `: ${dice}` : ''}]`;
    await conversationStore.appendCustomerMessage(message.from, texto, message.id);
    return;
  }

  // UN STICKER ES UN GESTO, NO UNA PREGUNTA.
  //
  // Es exactamente el mismo caso que la reacción de aquí arriba, pero entrando
  // por otra puerta: un sticker de pulgar arriba cierra una conversación igual
  // que el 👍 pegado a un mensaje. Y hasta hoy se llevaba "no puedo leer un
  // sticker por aquí, ¿quieres que te ponga en contacto con una persona?" — que
  // es el mismo disparate que se arregló el 30/9/2026 con las reacciones:
  // escalar a alguien, a lo mejor de madrugada, a quien solo estaba dando las
  // gracias.
  //
  // Tampoco se lee: un sticker es un emoji grande, nadie pregunta por un
  // producto con uno, y mirarlo sería pagar por nada.
  //
  // Sí se descarga y se archiva, porque en el panel dice algo: un pulgar arriba
  // cierra una conversación y una cara de enfado la abre.
  if (message.type === 'sticker') {
    const sticker = message.sticker?.id
      ? await guardarAdjuntoDeCliente(event, message.from, message.sticker.id)
      : null;
    const marcaSticker = sticker?.mediaId ? `${MARCA_ADJUNTO}${sticker.mediaId}]` : '';
    await conversationStore.appendCustomerMessage(
      message.from,
      `${marcaSticker}[El cliente envió un sticker]`,
      message.id
    );
    return;
  }

  // EL BOT EN PAUSA NO HABLA, MANDE EL CLIENTE LO QUE MANDE.
  //
  // Esta comprobación estaba más abajo, después de la rama de fotos y audios,
  // así que solo protegía a los mensajes de TEXTO. Con el bot parado porque una
  // persona estaba atendiendo la conversación, una foto (o una reacción) hacía
  // que el bot se metiera por medio a preguntar si quería hablar con alguien —
  // justo mientras ya estaba hablando con alguien. Visto en real el 30/9/2026.
  const enPausa = await isBotPaused(message.from);

  if (message.type !== 'text') {
    const QUE_ES = { image: 'una foto', audio: 'un audio', video: 'un vídeo', document: 'un documento', sticker: 'un sticker', location: 'una ubicación' };
    const queEs = QUE_ES[message.type] || `un mensaje de tipo ${message.type}`;
    const pieDeFoto = (message.image?.caption || message.video?.caption || message.document?.caption || '').trim();

    // Se trae la foto para que se VEA en el panel. Meta no da una URL pública:
    // da un identificador con el que se pide una URL temporal que caduca en
    // minutos, así que guardar el enlace no serviría de nada — hay que copiar el
    // fichero. Va a Netlify Blobs, no a Upstash (ver whatsapp-media.js).
    //
    // Si falla no pasa nada grave: el mensaje se registra igual y el aviso sale
    // igual, solo que sin la foto. Nunca se deja al cliente sin respuesta por
    // culpa de una descarga.
    // Los stickers no llegan aquí: se atienden más arriba, como una reacción.
    const mediaId = message[message.type]?.id;
    let adjunto = null;
    if (mediaId && (message.type === 'image' || message.type === 'document')) {
      adjunto = await guardarAdjuntoDeCliente(event, message.from, mediaId);
    }

    // Se guarda con el pie de foto si lo trae: muchas veces ahí está la pregunta
    // ("¿tenéis este?"), y es lo que da sentido a la imagen.
    // La marca solo va al historial, que es donde el panel la lee para pintar la
    // imagen. En el aviso al dueño sobra: se lee en un email o en WhatsApp, y
    // ahí "[ADJUNTO:1]" no significa nada.
    const legible = `[El cliente envió ${queEs}]${pieDeFoto ? ` — "${pieDeFoto}"` : ''}`;
    const marca = adjunto?.mediaId ? `${MARCA_ADJUNTO}${adjunto.mediaId}]` : '';
    let registro = `${marca}${legible}`;

    // Se PREGUNTA si quiere una persona, no se da por hecho.
    //
    // Antes decía "le paso tu conversación a una persona del equipo" — y eso es
    // afirmar algo que el cliente no ha pedido. Mandar una foto no significa
    // querer hablar con alguien: puede estar simplemente enseñando lo que busca.
    // Con los botones decide él, y el aviso al equipo sale cuando dice que sí
    // (ver handleEscalateReply), no antes.
    //
    // Sin pronombre ("no LA puedo leer") a propósito: con "un audio" salía "un
    // audio no la puedo leer". Así la frase vale para cualquier tipo.
    // El cliente tiene que saber que habla con un bot, TAMBIÉN si su primer
    // mensaje es una foto.
    //
    // Esta rama va antes de donde se calcula el saludo (línea ~667), así que
    // quien empezaba mandando una foto no recibía la presentación nunca: leía
    // "no puedo leer una foto" sin saber quién se lo decía. Se presenta aquí con
    // la misma lógica y se marca igual, para que no se le presente dos veces si
    // luego escribe.
    // Con el bot en pausa se archiva la foto (que es lo que hay que ver en el
    // panel) y se calla. Quien está atendiendo ya la tiene delante.
    if (enPausa) {
      await conversationStore.appendCustomerMessage(message.from, registro, message.id);
      return;
    }

    const fichaFoto = await conversationStore.getFichaCliente(message.from);
    const presentarse = !fichaFoto?.presentado;
    if (presentarse) await conversationStore.marcarPresentado(message.from);

    // La versión breve, no la larga: la larga invita a contar qué necesitas, y
    // este cliente acaba de hacerlo mandando la foto.
    // El idioma recordado de la ficha: una foto no trae texto del que deducirlo,
    // así que se usa el de la conversación. Y esta rama va antes de donde se
    // calcula `idioma` más abajo, así que se lee aquí de su propia ficha.
    const idiomaFoto = fichaFoto?.idioma === 'en' ? 'en' : 'es';
    const presentacion = presentarse
      ? `${idiomaFoto === 'en' ? PRESENTACION_BREVE_EN : PRESENTACION_BREVE}\n\n`
      : '';

    // LA FOTO SE MIRA.
    //
    // Hasta el 19/10/2026 esto acababa aquí: "no puedo leer una foto por aquí" y
    // los botones de hablar con una persona. Pero "¿tenéis este?" con la foto de
    // la caja del cartucho es de las formas más comunes de preguntar que hay, y
    // de madrugada esa respuesta es un cliente esperando hasta las nueve.
    //
    // Se lee en una llamada aparte, cuyo único trabajo es describirla, y lo que
    // sale son PALABRAS que entran por el mismo camino que un mensaje de texto
    // (ver contestarAUnaFoto y whatsapp-vision.js). Así la lectura nunca se le
    // da al cliente como un hecho: sirve para buscar, y manda el catálogo.
    //
    // Si no se puede leer, o si lo que sale no pasa las redes de seguridad, se
    // sigue por el camino de siempre. Nada de esto quita una respuesta: solo
    // añade una mejor cuando la hay.
    let lectura = null;
    if (message.type === 'image' && adjunto?.buffer && sePuedeLeerLaFoto(adjunto.tipo, adjunto.bytes)) {
      lectura = await leerFoto({ buffer: adjunto.buffer, tipo: adjunto.tipo, pieDeFoto });
    }

    // Lo leído queda en el panel, debajo de la foto, pase lo que pase después.
    // Es para el equipo: si el bot contesta algo raro, con esto se ve de un
    // vistazo si fue porque leyó mal la foto o porque buscó mal.
    if (lectura) registro = `${registro}\n${lecturaParaElPanel(lectura)}`;

    if (lectura?.buscar) {
      // LA FOTO ESPERA A SU PREGUNTA.
      //
      // Decisión del propietario (19/10/2026): "prefiero que espere y conteste
      // con todo el contexto antes que dar dos respuestas rápidas... la
      // pregunta manda sobre la foto, la foto es para ampliar datos o
      // contexto". Y tiene razón: por la imagen sola no se sabe qué quiere
      // saber —si la tenemos, cuánto vale, si hay otro color—, y contestar al
      // llegar significaba además soltarle dos mensajes, uno por cada mensaje
      // suyo.
      //
      // NO se espera cuando la pregunta ya está dicha, y puede estar dicha de
      // dos maneras:
      //
      //   - En el pie de foto, que es lo más directo.
      //   - En un mensaje de hace un momento, porque el cliente también
      //     pregunta primero y manda la foto después ("busco una caja como
      //     esta" y acto seguido la imagen). Entonces esa frase es la pregunta
      //     de esta foto, igual que si la hubiera puesto de pie.
      //
      // Sin ninguna de las dos, la foto leída se deja en espera y se avisa a la
      // función de segundo plano. Si el cliente pregunta en los próximos
      // segundos, se la lleva su mensaje (ver más abajo, en la rama de texto);
      // si no pregunta, se la lleva esa función y contesta con la foto sola.
      const notasFoto = todasLasNotas(await conversationStore.listarNotasNegocio());
      const historialFoto = historialParaLaIA(await getHistory(message.from));
      const pregunta = pieDeFoto || preguntaJustoAntesDeLaFoto(historialFoto);

      if (!pregunta) {
        await conversationStore.guardarFotoPendiente(message.from, lectura);
        const esperando = await dejarLaFotoEsperandoLaPregunta(
          message.from,
          message.id,
          idiomaFoto,
          presentacion
        );
        if (esperando) {
          // Solo se archiva la foto. La respuesta la archivará quien conteste.
          await conversationStore.appendCustomerMessage(message.from, registro, message.id);
          return;
        }
        // No se pudo delegar: nadie despertaría a contestar, así que se vuelve
        // a coger la foto y se contesta aquí mismo. Más vale una respuesta a
        // medias que ninguna.
        await conversationStore.tomarFotosPendientes(message.from);
      }

      const enviado = await responderAUnaFoto({
        from: message.from,
        lecturas: [lectura],
        pregunta,
        history: historialFoto,
        fichaCliente: fichaFoto,
        notas: notasFoto,
        idioma: idiomaFoto,
        presentacion,
      });
      await appendToHistory(message.from, registro, enviado);
      return;
    }

    const QUE_ES_EN = { image: 'a photo', audio: 'a voice note', video: 'a video', document: 'a document', sticker: 'a sticker', location: 'a location' };
    // Cuando la foto SÍ se ha leído pero no se ha podido contestar (no está en
    // el catálogo, la web no contestó, o la respuesta no pasó las redes de
    // seguridad), decir "no puedo leer una foto" sería mentir: se ha leído y no
    // se ha sabido resolver, que no es lo mismo y además es lo que el cliente
    // nota — acaba de ver que hablábamos de su cartucho.
    const prefijo = lectura
      ? idiomaFoto === 'en'
        ? `${presentacion}Thanks — I've seen the photo, but I can't confirm from here whether we have it. `
        : `${presentacion}Gracias, he visto la foto, pero no te puedo confirmar desde aquí si lo tenemos. `
      : idiomaFoto === 'en'
        ? `${presentacion}Thanks for your message. I can't read ${QUE_ES_EN[message.type] || 'that'} here. `
        : `${presentacion}Gracias por tu mensaje. No puedo leer ${queEs} por aquí. `;
    await sendEscalateButtons(message.from, prefijo, idiomaFoto);

    // El registro se guarda SIEMPRE, diga lo que diga después: es lo que hace
    // que la foto aparezca en el panel aunque el cliente no toque ningún botón.
    await appendToHistory(message.from, registro, `${prefijo}${escalateQuestion(idiomaFoto)}`);
    return;
  }

  const text = message.text?.body || '';

  // Bot en pausa (escalado confirmado o respuesta manual reciente desde el panel):
  // se guarda el mensaje para que lo vea la persona, pero no se contesta automático.
  // Se preguntó arriba, antes de la rama de fotos, para que la pausa valga
  // también para lo que no es texto.
  if (enPausa) {
    await appendCustomerMessage(message.from, text, message.id);
    return;
  }

  // CLIENTE ENFADADO: antes que cualquier otra cosa.
  //
  // Va aquí arriba a propósito, delante de las FAQ, del catálogo y de la IA.
  // Un "sois unos ladrones, quiero el 305XL" es primero un cliente furioso y
  // después una consulta de producto: contestarle con el precio del cartucho,
  // por correcto que sea el precio, es no haberle escuchado.
  //
  // Tampoco se le enseñan los botones de "¿quieres hablar con una persona?"
  // como en el escalado normal. Quien acaba de llamarnos inútiles ya ha
  // contestado a esa pregunta; ponerle un botón más que pulsar es otro aro por
  // el que pasar. Se escala directo.
  //
  // Y no se le antepone la presentación del bot ("¡Hola! 👋 Soy el asistente
  // virtual..."): saludar alegremente a alguien que está insultando es la
  // forma más rápida de encenderlo más.
  // EN QUÉ IDIOMA SE LE CONTESTA.
  //
  // Se RECUERDA en la ficha, no se decide mensaje a mensaje. Visto en real
  // (10/9/2026): un cliente preguntó en inglés, luego mandó "643539" y luego
  // "yes" — ninguno de esos dos dice nada del idioma, y mirando solo el mensaje
  // actual volvía al español a mitad de conversación. Que es lo que pasó: se le
  // dio el estado del pedido en español.
  //
  // Se decide aquí arriba, ANTES que nada, porque hasta el mensaje de cliente
  // molesto (que corta el turno y no llega a ver el resto del flujo) tiene que
  // salir en su idioma.
  const fichaCliente = await conversationStore.getFichaCliente(message.from);
  const idioma = idiomaDeRespuesta(text, fichaCliente?.idioma);
  if (idioma !== fichaCliente?.idioma) {
    await conversationStore.actualizarFichaCliente(message.from, { idioma });
  }

  const hostilidad = detectarHostilidad(text);
  if (hostilidad) {
    const reply = mensajeClienteMolesto(idioma);
    await sendWhatsappMessage(message.from, reply);
    await appendToHistory(message.from, text, `[Cliente molesto — ${hostilidad.familia}] ${reply}`);
    // Se para el bot igual que en un escalado confirmado: a partir de aquí
    // contesta una persona, y el bot hablando por encima solo estorbaría.
    await pauseBot(message.from, 24);
    await notifyOwner({
      channel: 'Meta',
      from: message.from,
      customerMessage: `⚠️ CLIENTE MOLESTO (${hostilidad.familia}, por "${hostilidad.frase}"): ${text}`,
      botReply: reply,
    });
    await notifyOwnerByWhatsapp(message.from, `⚠️ Cliente molesto (${hostilidad.familia}): ${text}`);
    return;
  }

  const debePresentarse = !fichaCliente?.presentado;
  if (debePresentarse) await conversationStore.marcarPresentado(message.from);

  const history = historialParaLaIA(await getHistory(message.from));

  // LAS REGLAS FIJAS SOLO VALEN EN ESPAÑOL.
  //
  // Son 48 respuestas escritas a mano en español. Traducirlas todas sería mucho
  // trabajo y se desincronizarían con el tiempo; pero dejarlas puestas significa
  // contestarle en español a quien escribe en inglés, que es justo lo que se vio
  // en real (10/9/2026).
  //
  // La salida buena ya existía: TODA esa información está también en el prompt
  // de la IA, y la IA sí contesta en el idioma del cliente. Así que en inglés se
  // dejan pasar y contesta ella. Es el mismo razonamiento que con las reglas de
  // contexto y con los mensajes de dos temas.
  //
  // La ÚNICA excepción es el escalado: poner en contacto con una persona importa
  // más que el idioma, y además ya está traducido (agenteInfoEn). Si se dejara
  // pasar, un "I want to talk to someone" acabaría en la IA en vez de en una
  // persona.
  const faqEnEspanol = matchFaqRule(text);
  const esEscalado = isAgenteInfoMessage(faqEnEspanol || '');
  const faqDeSiempre = idioma === 'en' ? (esEscalado ? agenteInfoEn(idioma) : null) : faqEnEspanol;

  // LO QUE SE LE HA ENSEÑADO GANA A LA RESPUESTA FIJA.
  //
  // Las respuestas fijas se escribieron antes de saber lo que dice la nota, así
  // que si alguien enseña que las cajas registradoras de siempre ya no son
  // legales y el mensaje toca ese tema, contestar con el texto de siempre es
  // contestar con lo que ya sabemos que está mal. Se deja pasar a la IA, que sí
  // lleva la nota en el prompt.
  //
  // El escalado es la excepción, como en todo lo demás de aquí: poner al
  // cliente con una persona importa más que cualquier dato.
  // Cuenta también lo que el equipo haya apuntado en la ficha de ESTE cliente:
  // esa nota ya viaja en el prompt, pero de nada sirve si una respuesta fija
  // contesta antes de que la IA llegue a leerla (ver notaDeFicha).
  const notas = todasLasNotas(await conversationStore.listarNotasNegocio());
  const deLaFicha = notaDeFicha(fichaCliente);
  const hayNotaParaEsto = notasQueAplican(text, deLaFicha ? [...notas, deLaFicha] : notas).length > 0;
  const faqReply = hayNotaParaEsto && !esEscalado ? null : faqDeSiempre;

  const isExplicitRequest = isAgenteInfoEnCualquierIdioma(faqReply || ''); // "hablar con alguien", queja, presupuesto...
  const isRepeated = !faqReply && isRepeatQuestion(text, history);
  const wantsEscalation = isExplicitRequest || isRepeated;

  // El bot se presenta UNA sola vez a cada cliente, en su primer mensaje. Va como
  // prefijo (no como mensaje suelto) para que no reciba dos mensajes seguidos, y
  // aprovechando que ese prefijo ya se antepone a cualquier respuesta — así vale
  // igual si el primer mensaje es un saludo, una pregunta o un número de pedido.
  //
  // Hay dos versiones (ver presentacionPara): la larga invita a preguntar, y solo
  // tiene sentido con un "hola" a secas; si el primer mensaje ya trae la pregunta,
  // se usa la corta, porque decirle "cuéntame qué necesitas" a quien acaba de
  // contarlo queda raro y alarga el mensaje para nada.
  // Si el cliente saluda junto con su pregunta (p. ej. "Buenas tardes, ¿hacéis
  // escaneados?"), se antepone el saludo a la respuesta que sea — así no hace falta
  // que ninguna regla individual ni la IA se acuerden de saludar por su cuenta.
  const greeting = debePresentarse
    ? `${presentacionEn(idioma, text)}\n\n`
    : startsWithGreeting(text)
      ? (idioma === 'en' ? 'Hi! ' : '¡Hola! ')
      : '';

  // Si la última respuesta del bot fue "dime el número de tu pedido" o "confírmame
  // el nombre", este mensaje es la continuación de esa búsqueda concreta — se
  // gestiona aparte de FAQ/escalado/IA (ver detectarPasoPedido más abajo).
  // El bot acaba de decirle que su pedido figura como entregado y él contesta
  // que no lo ha recibido. Eso lo atiende una persona, y va ANTES que cualquier
  // otra cosa: no hay respuesta automática que valga aquí.
  if (negacionDeEntrega(history, text)) {
    const prefijo = idioma === 'en'
      ? `${greeting}I'm sorry — if it is recorded as delivered and you don't have it, someone needs to look into it. `
      : `${greeting}Lo siento. Si figura como entregado y no lo tienes, esto tiene que mirarlo una persona. `;
    await sendEscalateButtons(message.from, prefijo, idioma);
    await appendToHistory(message.from, text, `[Dice que no ha recibido un pedido dado por entregado] ${prefijo}${escalateQuestion(idioma)}`);
    await notifyOwnerByWhatsapp(message.from, `📦 Dice que NO ha recibido un pedido que figura como entregado: ${text}`);
    return;
  }

  const pasoPedido = detectarPasoPedido(history);
  if (pasoPedido) {
    const gestionado = await continuarBusquedaPedido(message.from, text, pasoPedido, greeting, idioma);
    if (gestionado) return;
  }

  // En la práctica, los clientes casi nunca escriben la frase exacta "estado de mi
  // pedido" — piden "info sobre un pedido" con sus propias palabras y, cuando se
  // les pregunta (por la IA, con su propia redacción, no siempre por el flujo
  // determinista), simplemente escriben el número suelto. Si el mensaje ES solo un
  // número (5 a 8 dígitos, sin nada más), lo más probable con diferencia es que sea
  // un número de pedido — se intenta la búsqueda real directamente, sin depender de
  // haber detectado antes la frase exacta que arranca el flujo.
  // ...salvo que el mensaje vaya de otra cosa que lleva su propia respuesta.
  // Comprobado con un cliente real: "¿es posible pedir la factura? Se trata del
  // pedido #637636" lleva un número de pedido, sí, pero lo que pide es la
  // factura — y el atajo se lo comía y le contestaba el estado del pedido, que
  // no era lo que había preguntado. Si una regla fija ya sabe qué contestar,
  // manda ella; el atajo solo entra cuando no hay nada mejor, o cuando la regla
  // que ha coincidido es justo la de "estado de mi pedido".
  const faqMandaSobreElPedido = Boolean(faqReply) && !isPedidoEstadoQuestion(faqReply);
  if (!pasoPedido && !faqMandaSobreElPedido && woocommerce.isConfigured() && mencionaUnPedidoConcreto(text)) {
    const gestionado = await continuarBusquedaPedido(message.from, text, { paso: 'numero' }, greeting, idioma);
    if (gestionado) return;
  }

  // PROBLEMA DE CUENTA: a una persona, directo y sin preguntar.
  //
  // Ni botones ni atajos. Quien no puede entrar en su cuenta ya ha intentado
  // resolverlo solo y ha fallado: ofrecerle "mándanos el pedido por email" es
  // darle MÁS trabajo, y preguntarle "¿quieres hablar con una persona?" es un
  // aro más cuando la respuesta es obviamente sí.
  //
  // Se le dice la causa probable (casi siempre pidió como invitado y no hay
  // cuenta que recuperar) porque es información útil, pero como dato, no como
  // tarea. Y se avisa al equipo igual que con un cliente molesto.
  if (esProblemaDeCuenta(text)) {
    const reply = greeting + mensajeProblemaDeCuenta(idioma);
    await sendWhatsappMessage(message.from, reply);
    await appendToHistory(message.from, text, `[Problema de cuenta — pasado a una persona] ${reply}`);
    await pauseBot(message.from, 24);
    await notifyOwner({
      channel: 'Meta',
      from: message.from,
      customerMessage: `🔑 PROBLEMA DE CUENTA (no puede entrar / no le llega el correo): ${text}`,
      botReply: reply,
    });
    await notifyOwnerByWhatsapp(message.from, `🔑 Problema de cuenta: ${text}`);
    return;
  }

  if (isExplicitRequest) {
    // El cliente pidió expresamente hablar con alguien (o es una queja/
    // presupuesto) — no hace falta explicar el motivo, se escala directo.
    await sendEscalateButtons(message.from, greeting, idioma);
    await appendToHistory(message.from, text, `[Se ofreció escalar a una persona] ${greeting}${escalateQuestion(idioma)}`);
    return;
  }

  // ESTA ES LA PREGUNTA DE LA FOTO QUE ACABA DE MANDAR.
  //
  // La foto se quedó esperando sin contestar justo para esto (ver la rama de
  // fotos). Si hay alguna en espera, este mensaje es lo que faltaba: se la
  // lleva —quitándola de en medio para que la función de segundo plano no
  // conteste también— y se responde con las dos cosas juntas, que es lo que el
  // cliente pidió desde el principio.
  //
  // Va DESPUÉS del escalado, de los problemas de cuenta y de la búsqueda de
  // pedidos: si después de la foto lo que escribe es "quiero hablar con una
  // persona", eso manda sobre cualquier foto. Y va ANTES de las respuestas
  // fijas y de la IA normal, porque la pregunta de una foto no la puede
  // contestar una FAQ que no ha visto la imagen.
  const fotosEnEspera = await conversationStore.tomarFotosPendientes(message.from);
  if (fotosEnEspera.length) {
    const enviado = await responderAUnaFoto({
      from: message.from,
      lecturas: fotosEnEspera,
      pregunta: text,
      history,
      fichaCliente,
      notas,
      idioma,
      presentacion: greeting,
    });
    await appendToHistory(message.from, text, enviado);
    return;
  }

  // Si el bot acaba de pedirle que lo explique de otra forma y el cliente lo ha
  // hecho, NO se le trata como que insiste. Comprobado en real: pidió tinta para
  // una Epson, el bot dijo "creo que no te he entendido", él lo reformuló tal y
  // como se le pedía... y el bot le ofreció un agente. Reformular se parece
  // forzosamente a la pregunta original, así que por similitud siempre salía
  // "insiste" y la reformulación nunca llegaba a intentarse. Ahora sigue el
  // camino normal: se busca y se contesta. Si tampoco así se resuelve, la
  // escalada por "no sé la respuesta" ya está más abajo y sigue funcionando.
  if (isRepeated && !estaReformulando(history)) {
    if (yaSePidioAclaracion(history)) {
      // Segunda insistencia después de haber reformulado ya una vez: pedirle
      // otra vez que lo explique de otra forma sería marearle. Se le ofrece
      // una persona.
      const prefix = idioma === 'en'
        ? `${greeting}I can see I haven't managed to answer your question. `
        : `${greeting}Veo que no he conseguido resolver tu duda. `;
      await sendEscalateButtons(message.from, prefix, idioma);
      await appendToHistory(message.from, text, `[Se ofreció escalar a una persona] ${prefix}${escalateQuestion(idioma)}`);
      return;
    }

    // Tampoco se salta directo a ofrecer un agente la primera vez: puede que el
    // bot simplemente no haya entendido la forma de preguntar. Se le da una
    // oportunidad de reformular.
    const reply = greeting + aclaracionReply(idioma);
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
    await iniciarBusquedaPedido(message.from, text, greeting, idioma);
    return;
  }

  if (faqReply) {
    // Con un saludo a secas, la presentación SUSTITUYE al saludo de siempre (los
    // dos juntos serían dos bienvenidas seguidas diciendo casi lo mismo).
    const reply =
      faqReply === GREETING
        ? debePresentarse
          ? PRESENTACION // un saludo a secas: aquí sí toca la larga, que invita a preguntar
          : faqReply
        : greeting + faqReply;
    await appendToHistory(message.from, text, reply);
    await sendWhatsappMessage(message.from, reply);
    return;
  }

  // Búsqueda en tiempo real en el catálogo real (WooCommerce), para que la IA pueda
  // contestar con datos ciertos en vez de adivinar. Si no está configurado o no hay
  // coincidencias, sigue el comportamiento anterior (nunca confirma productos).
  const {
    productContext,
    contextoConsumibles,
    impresoras,
    fallo: falloCatalogo,
    consultado,
  } = await construirContextoCatalogo({ from: message.from, text, history });

  // La web no contestó (lenta, caída, o su protección anti-bots nos bloqueó) y
  // nos quedamos sin datos. Aquí NO se puede reintentar: el webhook tiene ~10
  // segundos antes de que Meta dé la respuesta por perdida y reenvíe el mensaje,
  // y una búsqueda lenta ya se ha comido 6. Así que se le dice al cliente que
  // espere un momento y se delega en la función de segundo plano, que no tiene
  // ese límite y puede insistir con calma.
  //
  // Solo cuando no hay NINGÚN dato: si la búsqueda trajo algo aunque alguna
  // consulta fallara, se contesta con lo que hay, que es mejor que hacer
  // esperar.
  if (falloCatalogo && !productContext) {
    const delegado = await pedirSegundoIntento(message.from, text);
    if (delegado) {
      await conversationStore.appendCustomerMessage(message.from, text, message.id);
      await sendWhatsappMessage(message.from, greeting + ESPERA_REPLY);
      return;
    }
    // Si no se pudo delegar, se sigue adelante y se contesta sin catálogo: más
    // vale una respuesta imperfecta que dejar al cliente sin nada.
  }

  const aiReply = await askClaude(
    text,
    history,
    unirContexto(contextoConsumibles, productContext),
    fichaCliente,
    notas
  );

  // SI LA IA INTENTA CONFIRMAR UN PRODUCTO, ERA UNA CONSULTA DE PRODUCTO.
  //
  // Antes de buscar hay un filtro que se salta el catálogo cuando el mensaje no
  // parece ir de un artículo, para no gastar segundos en un "¿a qué hora
  // abrís?". El filtro es una lista de formas de preguntar ("¿tenéis...?",
  // "busco...", "necesito...") y, como toda lista de palabras, tiene agujeros.
  //
  // Se vio en real el 5/10/2026, y salió caro: un cliente escribió "Queria
  // saber si tenes boligrafos o plumas estilograficas". "Tenes" no estaba en la
  // lista, así que NO se miró el catálogo; la IA contestó de memoria, la red de
  // seguridad de abajo le quitó la respuesta por no tener datos, y le soltó
  // "¿Qué estás buscando exactamente?" a quien acababa de decirlo. Lo repitió
  // con "Pluma estilografica" (sin verbo, tampoco entraba) y con dos mensajes
  // más: cuatro veces la misma frase. En el catálogo hay nueve plumas
  // estilográficas.
  //
  // En vez de seguir añadiendo palabras a la lista, se usa la mejor señal que
  // hay, y encima gratis: que la IA haya intentado confirmar un producto. Si lo
  // intentó, era eso. Entonces se busca de verdad y se le vuelve a preguntar
  // con los datos delante.
  //
  // Cabe de sobra en el tiempo de Meta: si se llega aquí sin haber consultado,
  // este turno no ha gastado los ~3,4 s de la búsqueda, así que queda margen
  // para hacerla ahora y repreguntar.
  let respuesta = aiReply;
  let datosDeCatalogo = productContext;
  let impresorasVistas = impresoras;

  // UN PRECIO QUE NO SALE DE NINGÚN SITIO es la tercera señal, y la más clara
  // de todas: si la IA se arranca con una cifra que no está en lo que le hemos
  // dado, es que está rellenando huecos. Y un precio inventado no es un fallo
  // de estilo — el cliente se entera en la tienda, con el paquete en la mano.
  // Visto en real el 16/10/2026: "12,95€ + IGIC" por unos folios de 3,94€.
  const seInventaUnPrecio = (texto, datos) =>
    preciosSinRespaldo(texto, unirContexto(contextoConsumibles, datos), fichaCliente, notas, text).length > 0;

  if (
    !datosDeCatalogo &&
    !consultado &&
    (isUnverifiedConfirmation(respuesta) || isUnverifiedStockClaim(respuesta) || seInventaUnPrecio(respuesta, productContext))
  ) {
    const segunda = await construirContextoCatalogo({ from: message.from, text, history, forzar: true });
    if (segunda.fallo && !segunda.productContext) {
      // La web no contestó. Igual que arriba: se delega en segundo plano en vez
      // de hacer esperar al cliente dentro del webhook.
      const delegado = await pedirSegundoIntento(message.from, text);
      if (delegado) {
        await conversationStore.appendCustomerMessage(message.from, text, message.id);
        await sendWhatsappMessage(message.from, greeting + ESPERA_REPLY);
        return;
      }
    }
    if (segunda.productContext) {
      datosDeCatalogo = segunda.productContext;
      impresorasVistas = segunda.impresoras;
      respuesta = await askClaude(
        text,
        history,
        unirContexto(segunda.contextoConsumibles, segunda.productContext),
        fichaCliente,
        notas
      );
    }
  }

  // LA FOTO SÍ LLEGÓ: NO SE LE PIDE OTRA VEZ.
  //
  // En WhatsApp la imagen y la pregunta vienen como DOS mensajes: primero la
  // foto y un segundo después "¿y este papel?". El primero se contesta por la
  // rama de fotos; el segundo entra por aquí, por el camino del texto, SIN
  // ninguna imagen en la mano. Y como el prompt ahora dice que sí ve fotos, la
  // IA ató cabos al revés y contestó "No veo una foto adjunta en ese mensaje.
  // ¿Puedes enviarla de nuevo?" — a un cliente al que se le acababa de dar el
  // precio y el enlace de lo que salía en su foto. Visto en real el 19/10/2026,
  // el mismo día de estrenarlo.
  //
  // La foto no se ha perdido: está apuntada en el historial con lo que se vio en
  // ella. Así que se rescata y se contesta como lo que es — esa foto, con esta
  // frase — por el mismo camino que la rama de fotos, con sus mismas redes de
  // seguridad. Si de verdad no hubiera ninguna foto detrás, la respuesta sería
  // correcta y se deja pasar.
  if (pideLaFotoOtraVez(respuesta)) {
    const fotoPrevia = ultimaFotoDelHistorial(history);
    if (fotoPrevia) {
      const enviado = await responderAUnaFoto({
        from: message.from,
        lecturas: [fotoPrevia],
        pregunta: text,
        history,
        fichaCliente,
        notas,
        idioma,
        presentacion: greeting,
      });
      await appendToHistory(message.from, text, enviado);
      return;
    }
  }

  // Red de seguridad: si la IA confirma con un "sí, vendemos/tenemos..." SIN que
  // hubiera resultados reales de búsqueda para este turno, no nos fiamos de esa
  // afirmación — puede ser pura invención (se ha visto en pruebas reales). Pero si
  // SÍ hubo productContext real (la búsqueda encontró algo de verdad), la
  // confirmación puede ser legítima — se ha comprobado en real que "pistolas de
  // silicona" existe en el catálogo y la IA contestaba bien, pero esta red de
  // seguridad lo descartaba igualmente por no mirar si había datos de respaldo.
  // Sin datos de catálogo tampoco vale afirmar que algo está en stock: saber
  // qué cartucho lleva una impresora no es saber si nos queda.
  if (
    !datosDeCatalogo &&
    (isUnverifiedConfirmation(respuesta) || isUnverifiedStockClaim(respuesta) || seInventaUnPrecio(respuesta, datosDeCatalogo))
  ) {
    // Si sabemos de qué impresora habla, la respuesta segura conserva la
    // referencia en vez de empezar de cero preguntando qué busca.
    const segura = respuestaSinCatalogo(impresorasVistas) || PRODUCTO_NO_VERIFICADO_INFO;

    // Y SI YA SE LO DIJIMOS, NO SE LO REPETIMOS.
    //
    // "¿Qué estás buscando exactamente?" es una pregunta razonable UNA vez. A la
    // segunda, el cliente ya la contestó y se la estás volviendo a hacer: desde
    // su lado, el bot se ha quedado colgado. El 5/10/2026 salió cuatro veces
    // seguidas, palabra por palabra, y hubo que pedirle perdón al cliente.
    //
    // Si vuelve a tocar, es que por esta vía no se sale: se le ofrece una
    // persona, que es lo que de verdad le resuelve.
    if (yaSeDijo(history, segura)) {
      await sendEscalateButtons(message.from, `${greeting}Disculpa, no estoy dando con lo que buscas. `, idioma);
      await appendToHistory(
        message.from,
        text,
        `${greeting}Disculpa, no estoy dando con lo que buscas. ${escalateQuestion(idioma)}`
      );
      return;
    }

    const infoReply = greeting + segura;
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
  if (isNoSeLaRespuesta(respuesta)) {
    const infoPart = stripAiOwnGreeting(respuesta.split(NO_SE_LA_RESPUESTA)[0].trim()).trim();

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
    await sendEscalateButtons(message.from, prefix, idioma);
    await appendToHistory(
      message.from,
      infoPart ? '[continuación automática: se ofreció además hablar con un agente]' : text,
      `${prefix}${escalateQuestion(idioma)}`
    );
    return;
  }

  const reply = greeting + stripAiOwnGreeting(respuesta);
  await appendToHistory(message.from, text, reply);
  await sendWhatsappMessage(message.from, reply);
}

// Acuses de recibo de los mensajes que MANDAMOS: entregado y leído. Meta los
// manda por el mismo webhook que los mensajes entrantes, en un array aparte.
//
// De los cuatro estados que existen solo interesan dos. "sent" no aporta nada
// (si estamos aquí es que se envió) y "failed" ya se detecta al enviar, con la
// respuesta de la API.
async function registrarAcusesDeRecibo(statuses) {
  for (const estado of statuses) {
    if (estado.status !== 'delivered' && estado.status !== 'read') continue;
    const telefono = estado.recipient_id;
    if (!telefono) continue;

    // Meta manda la fecha en segundos; el resto del sistema trabaja en
    // milisegundos. Si no viniera, se usa la hora de llegada, que para esto es
    // igual de buena.
    const segundos = Number(estado.timestamp);
    const cuando = Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : Date.now();

    try {
      await conversationStore.marcarEntrega(telefono, estado.status, cuando);
    } catch (err) {
      console.error('No se pudo guardar el acuse de recibo:', err);
    }
  }
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
        // Por este mismo webhook llegan DOS cosas distintas: los mensajes que
        // escribe el cliente y los acuses de recibo de los que mandamos
        // nosotros. Los acuses ya venían llegando; hasta ahora se tiraban.
        await registrarAcusesDeRecibo(change.value?.statuses || []);

        // Meta manda, junto a los mensajes, quién los escribe: su número y el
        // nombre que esa persona tiene puesto en su WhatsApp. Es lo más parecido
        // a una identificación que se puede tener — la API no da la foto de
        // perfil de los clientes — y hasta ahora se tiraba.
        const nombres = new Map(
          (change.value?.contacts || [])
            .filter((contacto) => contacto?.wa_id && contacto?.profile?.name)
            .map((contacto) => [contacto.wa_id, contacto.profile.name])
        );

        const messages = change.value?.messages || [];
        for (const message of messages) {
          if (await alreadyProcessed(message.id)) continue;
          await handleIncomingMessage(event, message, nombres.get(message.from));
        }
      }
    } catch (err) {
      console.error('Error procesando webhook de WhatsApp:', err);

      // Y ADEMÁS se deja constancia donde se mire todos los días.
      //
      // Aquí solo caen errores inesperados: los fallos normales (Meta lento,
      // WooCommerce caído, Upstash sin responder) los captura cada módulo por
      // su cuenta y no llegan. Lo que llega aquí es, casi siempre, un error de
      // programación — y ésos dejan al cliente sin respuesta.
      //
      // Se sigue devolviendo 200 a Meta a propósito: un 500 haría que
      // reintentara el mismo mensaje una y otra vez, y si el fallo es del
      // código el reintento va a fallar igual. Pero devolver 200 y callarse es
      // lo que costó una semana de bot muerto sin que nadie se enterara
      // (10-17/9/2026), así que se anota para que el panel lo enseñe en rojo.
      try {
        await conversationStore.registrarFalloDelBot(err?.message || String(err));
      } catch (err2) {
        console.error('Encima falló al registrar el fallo:', err2);
      }
    }

    // Meta espera un 200 rápido; los errores ya se han registrado arriba.
    return { statusCode: 200, body: 'EVENT_RECEIVED' };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
