// Datos del negocio y reglas de respuesta rápida para el agente de WhatsApp de Ofipapel.
// Edita este archivo (sin tocar whatsapp-webhook.js) para actualizar horarios,
// direcciones, teléfonos o añadir nuevas preguntas frecuentes.

const BUSINESS_NAME = 'Ofipapel';

const STORES = [
  {
    name: 'Los Cristianos (sede principal)',
    address: 'C/ Bulevar Chajofe, n.º 4, 38650 Los Cristianos, Santa Cruz de Tenerife, España',
    hours: 'Lunes a viernes 9:00 a 14:00 y 16:00 a 19:00, sábados 9:00 a 13:00',
    phone: '922 753 520',
    mapsUrl: 'https://maps.app.goo.gl/Sx5yVAos3Ltjyuiv8',
    keywords: ['sede principal', 'tienda principal', 'central', 'bulevar chajofe'],
  },
  {
    name: 'Aliz 1 (Los Cristianos)',
    address: 'Av. de Suecia, n.º 7, 38650 Los Cristianos, Santa Cruz de Tenerife, España',
    hours: 'Lunes a viernes 9:00 a 14:00 y 16:30 a 19:30, sábados 9:00 a 13:00',
    phone: '922 792 001',
    mapsUrl: 'https://maps.google.com/?q=Av+de+Suecia+7+Los+Cristianos+Tenerife',
    keywords: ['aliz 1', 'aliz1', 'av. de suecia', 'avenida de suecia'],
  },
  {
    name: 'Aliz 2 (Playa de las Américas)',
    address: 'Res. Las Viñas, C/ Noelia Afonso Cabrera, 38660 Playa de las Américas, Santa Cruz de Tenerife, España',
    hours: 'Lunes a viernes 9:00 a 14:00 y 16:30 a 19:30, sábados 9:00 a 13:00',
    phone: '922 791 029',
    mapsUrl: 'https://maps.google.com/?q=Calle+Noelia+Afonso+Cabrera+Playa+de+las+Americas+Tenerife',
    keywords: ['aliz 2', 'aliz2', 'playa de las americas', 'noelia afonso'],
  },
];

function storesSummary() {
  return STORES.map(
    (s) => `• ${s.name}: ${s.address} · Horario: ${s.hours} · Tel: ${s.phone}`
  ).join('\n');
}

// Si el cliente menciona una tienda concreta (Aliz 1, Aliz 2, o la sede principal
// explícitamente), se le contesta solo sobre esa. Si no menciona ninguna, por
// defecto se da la sede principal (STORES[0]) — las llamadas y visitas van casi
// siempre ahí, así que no hace falta soltar la lista completa de las 3 tiendas
// cada vez que preguntan por horario, dirección o teléfono.
function findStoreInText(normalizedText) {
  return STORES.find((s) => s.keywords.some((k) => normalizedText.includes(k)));
}

const GREETING = `¡Hola! 👋 Soy el asistente virtual de ${BUSINESS_NAME}. ¿En qué puedo ayudarte? Puedes preguntarme por horarios, ubicación, teléfono o lo que necesites.\n\nWe also speak English 🇬🇧`;

// Presentación que se manda UNA SOLA VEZ a cada cliente, en su primer mensaje
// (ver ficha del cliente en conversation-store.js). Avisar de que el bot es
// nuevo hace que un fallo se perdone mejor, pero decirlo y quedarse ahí resta
// confianza: por eso va acompañado del compromiso de pasar con una persona.
// El bot se presenta una sola vez a cada cliente, y hay DOS versiones porque no
// es lo mismo abrir con un "hola" a secas que abrir preguntando.
//
// La larga invita a preguntar, que es lo que hace falta cuando el cliente aún no
// ha dicho qué quiere. La corta se usa cuando el primer mensaje YA trae una
// pregunta: ahí la presentación va pegada delante de la respuesta, y soltarle
// "cuéntame qué necesitas" a quien acaba de contarlo queda incoherente y alarga
// el mensaje sin aportar nada. Visto en real con un cliente que preguntó si
// seguían necesitando personal para reparto: recibió la invitación a preguntar
// justo antes de la respuesta a su pregunta.
const PRESENTACION = `¡Hola! 👋 Soy el nuevo asistente virtual de ${BUSINESS_NAME}. Todavía estoy aprendiendo, así que puede que no acierte con todo — si no sé algo, te paso con una persona del equipo.\n\nCuéntame qué necesitas: horarios, tiendas, productos, el estado de tu pedido...\n\nWe also speak English 🇬🇧`;

// El "We also speak English" se mantiene también en la corta: la mayoría de la
// gente abre con su pregunta, así que si solo fuera en la larga casi nadie lo
// llegaría a ver.
const PRESENTACION_BREVE = `¡Hola! 👋 Soy el nuevo asistente virtual de ${BUSINESS_NAME}, todavía estoy aprendiendo — si no sé algo, te paso con una persona del equipo. We also speak English 🇬🇧`;

// Lo único que contesta el bot cuando está pausado del todo desde el panel (el
// interruptor de emergencia). Se manda UNA sola vez por cliente y por pausa, no
// en cada mensaje. A propósito no dice "el bot está caído": el cliente no tiene
// por qué enterarse de nuestros problemas, solo necesita saber que su mensaje ha
// llegado y que le va a contestar una persona.
const PAUSA_GLOBAL_REPLY = `¡Hola! Hemos recibido tu mensaje y en breve te responderá una persona del equipo.\n\nSi es urgente, puedes llamarnos al ${STORES[0].phone} en horario de tienda (${STORES[0].hours}).`;

// Lo que se le dice al cliente cuando la web no ha contestado y hay que volver
// a intentarlo en segundo plano. Deliberadamente corto y sin excusas técnicas:
// al cliente no le importa si la web va lenta, solo necesita saber que su
// mensaje ha llegado y que la respuesta viene enseguida.
const ESPERA_REPLY = 'Un segundo, por favor — estoy consultando el catálogo y te contesto enseguida.';

// Detección de saludo robusta: NO cuenta palabras totales (eso rompía con mensajes
// tipo "Buenas tardes, ¿hacéis escaneados?", que caían justo en 6 palabras y se
// comían la pregunta real). En vez de eso, quita el saludo del principio del texto
// y mira si queda algo con contenido detrás.
const GREETING_PHRASES = ['buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'hola', 'buenas'];

// Se quitan los saludos ENCADENADOS, no solo el primero: "Hola buenas" es de lo
// más corriente aquí, y quitando solo "hola" quedaba "buenas", que se tomaba por
// contenido real — el mensaje se iba a la IA para acabar contestando un saludo.
function stripLeadingGreeting(normalizedText) {
  let resto = normalizedText.trim();
  let encontrado = false;

  for (;;) {
    const phrase = GREETING_PHRASES.find((p) => resto.startsWith(p));
    if (!phrase) break;
    encontrado = true;
    resto = resto.slice(phrase.length).replace(/^[\s,.!¡¿?-]+/, '').trim();
  }

  return encontrado ? resto : null;
}

// Saludo "puro": el cliente solo saluda, sin ninguna pregunta detrás.
function isPureGreeting(normalizedText) {
  return stripLeadingGreeting(normalizedText) === '';
}

// Para usar desde whatsapp-webhook.js sobre el texto tal cual llega (sin normalizar
// a mano) — cierto tanto si es un saludo puro como si el saludo va seguido de una
// pregunta real, para poder anteponer un "¡Hola!" a la respuesta que sea.
function startsWithGreeting(rawText) {
  const normalized = rawText.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return stripLeadingGreeting(normalized) !== null;
}

// ¿El mensaje es SOLO un saludo, o ya trae algo que responder? Decide cuál de
// las dos presentaciones se usa. Un mensaje sin saludo ninguno ("¿hacéis
// fotocopias?") también cuenta como que trae contenido.
function esSoloSaludo(rawText) {
  const normalized = (rawText || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const resto = stripLeadingGreeting(normalized);
  if (resto === null) return false; // ni siquiera empieza saludando: es una pregunta
  return resto.replace(/[\s,.!¡¿?-]/g, '') === '';
}

// La presentación que toca según cómo abra el cliente la conversación.
function presentacionPara(rawText) {
  return esSoloSaludo(rawText) ? PRESENTACION : PRESENTACION_BREVE;
}

// Mismo criterio que el saludo, pero para "gracias"/"perfecto": el mensaje ENTERO
// (troceado por comas/puntos) tiene que ser solo agradecimiento — así "gracias" al
// final de una pregunta real, o "perfecto" dentro de una frase ("el regalo
// perfecto"), no cuentan como agradecimiento puro.
const THANKS_PHRASES = ['muchas gracias', 'vale gracias', 'gracias', 'perfecto'];

function isPureThanks(normalizedText) {
  const parts = normalizedText
    .trim()
    .split(/[,.!¡]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => THANKS_PHRASES.includes(part));
}

const REGISTRO_URL = 'https://ofipapel.net/mi-cuenta/';
const REGISTRO_INFO = `Puedes registrarte aquí: ${REGISTRO_URL}\nEl mismo registro sirve tanto para comprar en la web como en cualquiera de nuestras tiendas. Al registrarte, tienes una tarifa de precios mejorada. Además, si es tu primer pedido en la web, puedes usar el código B1ENVEN1DA para un 10% extra de descuento.`;

// Horario comercial estructurado (mismo horario que STORES[0].hours, la sede
// principal, en texto), para poder comprobar por código si ahora mismo hay
// alguien del equipo disponible o no. Minutos desde medianoche, hora de
// Canarias. Día: 0=domingo ... 6=sábado.
const TIMEZONE = 'Atlantic/Canary';
const BUSINESS_HOURS_RANGES = {
  1: [[540, 840], [960, 1140]], // lunes 9:00-14:00 y 16:00-19:00
  2: [[540, 840], [960, 1140]],
  3: [[540, 840], [960, 1140]],
  4: [[540, 840], [960, 1140]],
  5: [[540, 840], [960, 1140]],
  6: [[540, 780]], // sábado 9:00-13:00
  0: [], // domingo cerrado
};

function isWithinBusinessHours(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[parts.find((p) => p.type === 'weekday').value];
  const minutesNow = Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);

  return (BUSINESS_HOURS_RANGES[day] || []).some(([start, end]) => minutesNow >= start && minutesNow < end);
}

// Dos variantes del mensaje de escalado a persona: en horario dice que se revisa
// "ahora mismo"; fuera de horario deja claro que hasta que abra la tienda solo
// puede seguir ayudando el bot, para no generar una falsa expectativa.
const AGENTE_INFO_ABIERTO = `Claro, ahora mismo un miembro del equipo revisará tu conversación y te atenderá personalmente. Si es urgente, también puedes llamarnos directamente al ${STORES[0].phone} en horario de tienda (${STORES[0].hours}).`;

const AGENTE_INFO_CERRADO = `Ahora mismo estamos fuera del horario comercial (${STORES[0].hours}). Un miembro del equipo atenderá tu petición en cuanto retomemos la actividad.`;

function agenteInfo() {
  return isWithinBusinessHours() ? AGENTE_INFO_ABIERTO : AGENTE_INFO_CERRADO;
}

// Para detectar si un texto ya guardado es "el" mensaje de escalado a persona,
// sin importar si se mandó en horario o fuera de horario.
function isAgenteInfoMessage(text) {
  return text === AGENTE_INFO_ABIERTO || text === AGENTE_INFO_CERRADO;
}

// La regla de "hablar con alguien"/queja hace match por substring, así que un
// mensaje como "no quiero hablar con una persona" también la dispara aunque el
// cliente esté diciendo justo lo contrario. Si el mensaje contiene una negación
// clara delante, no se escala (se deja pasar a la IA en vez de ofrecer el botón).
const NEGATION_MARKERS = ['no quiero', 'no necesito', 'no hace falta', 'no me hace falta', 'sin necesidad de', 'no quisiera', "don't want", 'do not want', "don't need"];

function agenteInfoOrDecline(normalizedText) {
  const declined = NEGATION_MARKERS.some((marker) => normalizedText.includes(marker));
  return declined ? null : agenteInfo();
}

const PEDIDOS_INFO = `Para el seguimiento de tu pedido o cualquier incidencia relacionada, lo mejor es que contactes directamente con el departamento de Pedidos: ${STORES[0].phone} (extensión 2) o pedidos@ofipapelsl.com.`;

// Cuando preguntan por el estado de un pedido concreto, en vez de dar solo el
// contacto (PEDIDOS_INFO) se arranca una búsqueda real en WooCommerce — este texto
// hace de sentinela (como SELLOS_QUESTION) y a la vez es la pregunta real que se le
// manda al cliente para empezar esa búsqueda (ver whatsapp-webhook.js).
const PEDIDO_ESTADO_TRIGGER = 'Claro, dime el número de tu pedido (lo tienes en el email de confirmación) y te digo en qué estado está.';

function isPedidoEstadoQuestion(text) {
  return text === PEDIDO_ESTADO_TRIGGER;
}

// Las facturas de un pedido las lleva el repartidor con la mercancía: quien
// pregunta por la suya normalmente no sabe eso, no le falta nada. Por eso se
// dice primero, y solo después la vía para pedir una copia.
//
// Va a Pedidos, no a Administración: la copia de la factura de un pedido la
// saca quien gestionó el pedido. Administración es para pagos, cuentas e
// impagos, que es otra cosa.
//
// IMPORTANTE: esto solo se cuenta si el cliente pregunta por la factura. No es
// información que haya que meter en cualquier respuesta sobre un pedido.
const FACTURA_INFO = `La factura te la entrega el repartidor junto con la mercancía, dentro del pedido. Si no te la dejó o necesitas otra copia, escribe a pedidos@ofipapelsl.com con el número de pedido y te la mandan — o llama al ${STORES[0].phone} (extensión 2).`;

const ADMINISTRACION_INFO = `Para temas administrativos (facturas, pagos, cuentas) contacta directamente con Administración: ${STORES[0].phone} (extensión 1) o administracion@ofipapelsl.com.`;

// Currículums y ofertas de empleo van SIEMPRE a comercial@ofipapelsl.com. Sin
// esta regla lo contestaba la IA por su cuenta y se inventaba los detalles
// (mencionó un departamento de Recursos Humanos y una sección "Trabaja con
// Nosotros" en la web, y acabó dando el email de pedidos).
const EMPLEO_INFO = `Para enviar tu currículum o preguntar por ofertas de empleo, escribe a comercial@ofipapelsl.com — es el correo que gestiona las candidaturas. ¡Mucha suerte!`;

// Los presupuestos de material escolar y de colegios/cursos NO se atienden por
// WhatsApp (criterio del propietario): llevan una lista larga, a menudo en foto,
// y los prepara el departamento de Pedidos. Se remite ahí en vez de escalar a
// una persona por este canal, que es lo que se hacía con cualquier presupuesto.
// Se ofrecen las dos vías reales, y en el orden en que de verdad se usan: lo
// normal es traer la lista a la tienda, pero mucha gente prefiere no desplazarse
// y que se lo demos hecho. Lo que Pedidos necesita para no tener que
// repreguntar es siempre lo mismo: la lista, el centro y el curso.
const PRESUPUESTO_ESCOLAR_INFO = `Los presupuestos de material escolar no los gestionamos por WhatsApp, pero tienes dos formas fáciles:

📍 *En tienda*: pásate por cualquiera de nuestras tiendas con la lista del colegio y te preparamos el pedido allí mismo.

📧 *Por correo*, si prefieres no desplazarte: manda la lista a pedidos@ofipapelsl.com (vale una foto), indicando el *nombre del centro* y el *curso*. Te preparamos el presupuesto y te contestamos por ahí.`;

// Señales de que un presupuesto es escolar. Se comprueban con límites de palabra
// para no engancharse dentro de otra: sin eso, "curso" saltaría con "concurso" y
// "eso" (la etapa) con media frase en español. Por lo mismo, "eso" solo cuenta
// escrito en mayúsculas o junto a "la/el", que es como se usa de verdad.
const ESCOLAR_RE = new RegExp(
  '(^|[^a-z])(' +
    [
      'colegio', 'colegios', 'cole', 'escolar', 'escolares', 'instituto', 'institutos',
      'alumno', 'alumnos', 'alumna', 'alumnas', 'alumnado', 'ampa', 'guarderia',
      'infantil', 'primaria', 'secundaria', 'bachillerato', 'preescolar',
      'curso escolar', 'lista de material', 'listado de material', 'libros de texto',
      'material del cole', 'material para el cole', 'vuelta al cole',
    ].join('|') +
    ')([^a-z]|$)',
  'i'
);

function isPresupuestoEscolar(normalizedText) {
  return ESCOLAR_RE.test(normalizedText);
}

// Un presupuesto escolar va a Pedidos; cualquier otro presupuesto sigue pasando
// con una persona, como hasta ahora.
function presupuestoReply(normalizedText) {
  return isPresupuestoEscolar(normalizedText) ? PRESUPUESTO_ESCOLAR_INFO : agenteInfo();
}

const REPROGRAFIA_INFO = `Imprimimos todo tipo de documentos, en blanco y negro o a color, desde A4 hasta A3 (el tamaño más grande que hacemos). Hay distintos tipos de papel según lo que necesites, y el precio varía según la cantidad y el acabado — por eso, para impresiones, copias, fotocopias, encuadernados, plastificados, folletos, tarjetas de visita, sellos personalizados, talonarios, tarjetas para bodas o cualquier trabajo de imprenta (y sobre todo para precios), lo mejor es contactar directamente con el departamento de Reprografía: ${STORES[0].phone} extensión 3010, o impresion.ofipapel@gmail.com. Los sellos personalizados se piden en la tienda de Los Cristianos o desde la web (indicando el diseño en las observaciones del pedido, o por email si lleva logotipo).`;

const REPROGRAFIA_CONTACT = `${STORES[0].phone} extensión 3010, o impresion.ofipapel@gmail.com`;

// En vez de soltar la parrafada de las dos vías, se le pregunta al cliente cuál
// prefiere (con botones) y se le da solo el dato que le corresponde.
const SELLOS_QUESTION = '¿Vas a pedir el sello desde la web o prefieres pasar por la tienda de Los Cristianos?';

const SELLOS_FABRICACION_INFO = 'La fabricación es casi al instante, aunque depende un poco del volumen de trabajo que haya en producción en ese momento.';

const SELLOS_WEB_INFO = `Busca el producto "Sello Printy Brother" en la web — hay varios tamaños disponibles y cada uno tiene su precio (varía según el tamaño). Si el diseño es sencillo, indícalo en las observaciones del pedido; si lleva logotipo o es más complejo, mándanos el diseño por email a impresion.ofipapel@gmail.com después de finalizar el pedido. Antes de imprimirlo, siempre te enviamos una prueba para que nos des el OK. ${SELLOS_FABRICACION_INFO}`;

const SELLOS_TIENDA_INFO = `Perfecto, puedes pasar por la tienda de Los Cristianos (C/ Bulevar Chajofe, n.º 4) o llamar al ${REPROGRAFIA_CONTACT} para que te asesoren sobre el diseño, el tamaño y el precio (varía según el tamaño elegido). ${SELLOS_FABRICACION_INFO}`;

// Para detectar si un texto ya guardado es "la" pregunta de web/tienda de sellos
// (mismo patrón que isAgenteInfoMessage), y así el webhook sepa cuándo mandar los
// botones en vez de la respuesta de texto normal.
function isSellosQuestion(text) {
  return text === SELLOS_QUESTION;
}

// Sentinela para cuando la IA no tiene ninguna respuesta fiable: en vez de dejar que
// improvise una promesa vacía ("le paso tu consulta al equipo") o se limite a decir
// "no lo sé" sin más, se le instruye (ver AI_SYSTEM_PROMPT) a devolver EXACTAMENTE
// este texto — así whatsapp-webhook.js lo detecta y dispara el flujo real de
// escalado (botones Sí/No) en vez de mandar la frase tal cual como si fuera la
// respuesta final.
const NO_SE_LA_RESPUESTA = 'Lo siento, no tengo la respuesta para eso, pero puedo pasarte con un agente.';

// Se comprueba por "includes", no por igualdad exacta: la IA (aunque se le pida
// literalmente esa frase y nada más) a veces le añade una frase propia delante o
// detrás ("No tengo información sobre ese producto en concreto. Lo siento..."), y
// con igualdad exacta ese caso NO se detectaba — se mandaba como texto normal en
// vez de disparar el escalado real, y el cliente se quedaba con una respuesta a
// medias (y el siguiente mensaje suyo volvía a caer en la IA, que podía inventarse
// una promesa falsa tipo "te paso con un agente ahora mismo"). Con "includes" da
// igual lo que la IA añada alrededor: si la frase exacta aparece en algún punto,
// se dispara el escalado real de todas formas.
function isNoSeLaRespuesta(text) {
  return (text || '').includes(NO_SE_LA_RESPUESTA);
}

// Red de seguridad determinista: pedirle a la IA por instrucciones que no confirme
// productos concretos sin datos reales AYUDA, pero no es 100% fiable — un modelo
// rápido como Haiku a veces igualmente suelta un "sí, vendemos ese tipo de
// artículos" por pura plausibilidad (se ha visto en pruebas reales, con productos
// inventados como "reparador de arañazos" o "sangrías de fibra"). En vez de confiar
// en que la IA se porte bien siempre, se analiza su propia respuesta: si confirma
// con un "sí, vendemos/tenemos" (verbos de catálogo/stock de PRODUCTO) sin que
// haya venido de una regla fija, no nos fiamos y se sustituye entera por la
// respuesta segura. Ojo: solo "vendemos"/"tenemos" — "hacemos" se quitó porque
// también sale en confirmaciones legítimas de SERVICIOS que la IA sí conoce de
// verdad (p. ej. "sí, hacemos entregas a otras islas", que es un hecho real de
// ENVIOS_INFO, no una invención) y daba falsos positivos.
const FALSE_CONFIDENCE_PATTERN = /\bs[ií],?\s+(vendemos|tenemos)\b/i;

function isUnverifiedConfirmation(text) {
  return FALSE_CONFIDENCE_PATTERN.test(text || '');
}

// La misma red, para la disponibilidad. Saber qué cartucho lleva una impresora
// NO es saber si nos queda: son dos datos distintos y solo el segundo sale del
// catálogo. Visto en real: con la lista de consumibles delante pero sin datos de
// catálogo, contestó "Tenemos cartuchos para la Epson XP-4200 EN STOCK. Los
// modelos DISPONIBLES son los Epson 604" — la referencia era correcta, el stock
// se lo inventó entero.
//
// Solo se mira cuando no hubo resultados reales de búsqueda; con catálogo
// delante, decir "en stock" es legítimo. Y solo afirmaciones: "¿quieres que te
// confirme la disponibilidad?" no es afirmar nada, por eso no entra
// "disponibilidad" a secas.
const STOCK_SIN_DATOS_PATTERN =
  /\ben stock\b|\b(est[áa]n?|hay|tenemos|tengo|quedan|los|las|varios|varias)\s+(\w+\s+){0,3}disponibles?\b/i;

function isUnverifiedStockClaim(text) {
  return STOCK_SIN_DATOS_PATTERN.test(text || '');
}

const PRODUCTO_NO_VERIFICADO_INFO = `Sí, tengo acceso a todo el catálogo de Ofipapel. ¿Qué estás buscando exactamente? Así te confirmo si lo tenemos y a qué precio.`;

// Un ítem concreto por mensaje (igual que con los envíos): si el cliente pregunta
// por un servicio de Reprografía en concreto, se contesta solo sobre ese, no con
// el listado completo cada vez. "reply" opcional para una respuesta a medida en
// vez de la plantilla genérica (p. ej. sellos, que tiene dos vías de pedido).
const REPROGRAFIA_ITEMS = [
  // 'impresion'/'impresión' a secas NO son keyword: coinciden con "impresionante",
  // "me parece impresionante", etc. — un cumplido sobre la tienda no debe disparar
  // la respuesta de Reprografía. 'impresiones' (plural) sí es seguro.
  { name: 'impresiones', keywords: ['imprimir', 'imprime', 'imprimen', 'imprimimos', 'impresiones'] },
  { name: 'copias', keywords: ['copias'] },
  { name: 'fotocopias', keywords: ['fotocopia', 'fotocopias'] },
  { name: 'encuadernados', keywords: ['encuadernado', 'encuadernados', 'encuadernar'] },
  { name: 'plastificados', keywords: ['plastificado', 'plastificados', 'plastificar'] },
  { name: 'folletos', keywords: ['folletos'] },
  { name: 'tarjetas de visita', keywords: ['tarjetas de visita'] },
  // Antes que "sellos personalizados": si preguntan específicamente por sellos de
  // correos (postales), no se les mete en el flujo de sellos personalizados de goma.
  {
    name: 'sellos de correos',
    keywords: ['sellos de correos', 'sello de correos', 'sellos postales', 'sello postal'],
    reply: 'No, no vendemos sellos de correos (postales) — eso lo gestiona Correos. Si buscas un sello personalizado (de goma, para negocio), sí lo hacemos: dime y te explico cómo pedirlo.',
  },
  { name: 'sellos personalizados', keywords: ['sellos personalizados', 'sello personalizado', 'sellos', 'sello'], reply: SELLOS_QUESTION },
  { name: 'talonarios', keywords: ['talonarios'] },
  { name: 'tarjetas para bodas', keywords: ['tarjetas para bodas'] },
  { name: 'trabajos de imprenta', keywords: ['trabajo de imprenta', 'trabajos de imprenta', 'imprenta'] },
  {
    name: 'escaneado de documentos',
    keywords: ['escaneado', 'escaneados', 'escanear', 'escaneo', 'escanea', 'digitalizar', 'digitalizacion', 'digitalización'],
    reply: `No, no tenemos servicio de escaneado de documentos. Si necesitas otra cosa de Reprografía (impresiones, copias, encuadernados, plastificados...), contacta con el departamento: ${REPROGRAFIA_CONTACT}.`,
  },
];

// "láminas/fundas/bolsas/carteras de plastificar" es el PRODUCTO (las fundas que
// se compran para plastificar uno mismo) — no es lo mismo que "plastificar" como
// SERVICIO (traer un documento para que se lo plastifiquen en Reprografía). Si
// preguntan por el producto, se deja pasar la pregunta (sin match) para que la
// búsqueda real de WooCommerce la responda, en vez de ofrecerles por error el
// servicio de Reprografía.
const PLASTIFICAR_PRODUCTO_RE = /\b(lamina|laminas|funda|fundas|bolsa|bolsas|cartera|carteras)\s+(de\s+)?plastificar/;

// "Escanear el código" (el QR para registrarse, un código de barras...) no tiene
// nada que ver con el servicio de escaneado de documentos de Reprografía —
// comprobado en real: "quiero abrir una cuenta, intento escanear su código pero
// no funciona" recibía como respuesta que no hacemos escaneado de documentos.
const ESCANEAR_CODIGO_RE = /\b(codigo|qr)\b/;

function reprografiaReply(normalizedText) {
  if (PLASTIFICAR_PRODUCTO_RE.test(normalizedText)) return null;
  const item = REPROGRAFIA_ITEMS.find((it) => it.keywords.some((k) => normalizedText.includes(k)));
  if (item && item.name === 'escaneado de documentos' && ESCANEAR_CODIGO_RE.test(normalizedText)) {
    return null;
  }
  if (item) {
    if (item.reply) return item.reply;
    return `Sí, hacemos ${item.name}. El precio depende de la cantidad y el acabado, así que para eso o para encargarlo, contacta con Reprografía: ${REPROGRAFIA_CONTACT}.`;
  }
  return REPROGRAFIA_INFO;
}

const PLACAS_VV_INFO = `Los pedidos de placas VV (identificación de vivienda vacacional) tardan entre 2 y 4 días en procesarse, dependiendo del volumen de trabajo que haya en producción en ese momento. Si elegiste recogida en tienda, te avisamos por teléfono en cuanto esté lista.`;

const AGENDAS_INFO = `Tenemos muchísimos modelos y diseños de agendas en stock. En la web solo están los modelos más básicos, que se repiten todos los años; el resto no lo subimos porque cada año cambian los diseños y no es viable mantenerlo actualizado. Te invitamos a pasar por nuestra tienda, donde podrás ver en vivo cada uno de los diseños que tenemos disponibles.`;

const REGALOS_INFO = `Tenemos una campaña de regalos directos según el importe de tu compra. Los regalos disponibles van cambiando cada varias semanas, así que la lista actualizada (con el importe necesario para cada uno) siempre está en la familia de productos "Z-Regalos Promocionales" de la web. Para elegir tu regalo, indícalo en las observaciones del pedido.`;

const COMO_COMPRAR_INFO = `Por este WhatsApp no puedo tomarte el pedido directamente (soy un asistente automático), pero puedes hacerlo tú mismo en la web: entra en https://ofipapel.net, busca el producto por secciones, marcas o con el buscador, añádelo al carrito y ve a "Finalizar Compra" para dejar tus datos y elegir cómo pagar (ahí mismo puedes elegir "Recogida en tienda" en vez de envío a domicilio). Si prefieres que te lo gestionemos nosotros, escribe a pedidos@ofipapelsl.com o llama al ${STORES[0].phone} (extensión 2) indicando qué necesitas.`;

const RECOGIDA_TIENDA_INFO = `Sí, al hacer tu pedido en la web, en el paso de "Finalizar Compra" puedes elegir "Recogida en tienda" en vez de envío a domicilio — a veces resulta más cómodo y rápido pasar a por él, aunque tu pedido ya tenga el envío gratis.`;

const CATALOGO_DESCARGA_INFO = `En la web puedes descargar nuestros catálogos en formato PDF. Si lo prefieres en formato físico, solo tienes que pasar por alguna de nuestras tiendas.`;

const PAGO_INFO = `Formas de pago aceptadas: tarjeta de crédito o débito (Visa, MasterCard, 4B, Euro 6000, Maestro, American Express), transferencia bancaria, contra reembolso, o en tienda (solo para recogidas, con el pedido hecho antes por la web).`;

const ENVIOS_GENERAL_INTRO = `Hacemos envíos a toda Canarias, pero no enviamos a Península ni al extranjero. Los pedidos de lunes a viernes antes de las 13:00h se gestionan ese mismo día (después, al día siguiente; los de fin de semana/festivos, el próximo día laborable).`;

const PENINSULA_EXTRANJERO_KEYWORDS = ['peninsula', 'península', 'espana peninsular', 'españa peninsular', 'extranjero', 'fuera de españa', 'internacional', 'otro pais', 'otro país'];

// Además de las frases exactas de arriba, cubre variantes tipo "fuera de las Islas
// Canarias", "fuera de la isla de Canarias", etc., que no son un substring literal
// de ninguna keyword fija.
// Provincias españolas fuera de Canarias (las 48 peninsulares + Baleares + Ceuta y
// Melilla; las 2 provincias canarias — Santa Cruz de Tenerife y Las Palmas — no están
// aquí porque esas SÍ tienen servicio y ya las cubre ISLAND_SHIPPING). Así, si el
// cliente nombra una provincia/ciudad concreta en vez de decir "Península", el bot
// contesta directo en lugar de preguntar "¿a qué isla te refieres?".
const PROVINCIAS_FUERA_DE_CANARIAS = [
  'alava', 'araba', 'albacete', 'alicante', 'alacant', 'almeria', 'avila', 'badajoz',
  'baleares', 'illes balears', 'islas baleares', 'mallorca', 'menorca', 'ibiza', 'eivissa',
  'barcelona', 'burgos', 'caceres', 'cadiz', 'cantabria', 'castellon', 'castello',
  'ciudad real', 'cordoba', 'cuenca', 'girona', 'gerona', 'granada', 'guadalajara',
  'gipuzkoa', 'guipuzcoa', 'huelva', 'huesca', 'jaen', 'la rioja', 'leon', 'lleida',
  'lerida', 'lugo', 'madrid', 'malaga', 'murcia', 'navarra', 'nafarroa', 'ourense',
  'orense', 'asturias', 'oviedo', 'palencia', 'pontevedra', 'salamanca', 'segovia',
  'sevilla', 'soria', 'tarragona', 'teruel', 'toledo', 'valencia', 'valladolid',
  'vizcaya', 'bizkaia', 'zamora', 'zaragoza', 'ceuta', 'melilla',
];

function mentionsOutsideCanarias(normalizedText) {
  if (PENINSULA_EXTRANJERO_KEYWORDS.some((k) => normalizedText.includes(k))) return true;
  if (/fuera de(l)?\s+(la[s]?\s+)?(isla[s]?\s+)?(de\s+)?canarias/.test(normalizedText)) return true;
  return PROVINCIAS_FUERA_DE_CANARIAS.some((p) => normalizedText.includes(p));
}

// Datos por isla, usados tanto para la regla de FAQ (respuesta dirigida a una isla
// concreta si el cliente la menciona) como para el contexto que recibe la IA.
const ISLAND_SHIPPING = [
  {
    name: 'Tenerife',
    keywords: ['tenerife'],
    freeFrom: 20,
    feeBelow: 5,
    delivery: '24 a 48h',
    cutoffNote: 'Si el pedido se hace antes de las 13:00h, se entrega al día siguiente (salvo imprevistos); si se hace después de esa hora, ya no entra en el reparto del día siguiente, sino en el del otro día. El reparto es de lunes a viernes (no hay reparto en sábado ni domingo), así que un pedido de fin de semana entra en el reparto del lunes.',
  },
  { name: 'La Gomera', keywords: ['gomera'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  { name: 'El Hierro', keywords: ['hierro'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  // Ojo: 'palma' a secas NO es keyword de La Palma porque coincide con "Las Palmas"
  // (capital de Gran Canaria) y con "Palma de Mallorca" — ambigüedad real en español,
  // así que solo se reconoce con el artículo ("la palma").
  { name: 'La Palma', keywords: ['la palma'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  { name: 'Gran Canaria', keywords: ['gran canaria', 'las palmas'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  { name: 'Lanzarote', keywords: ['lanzarote'], freeFrom: 300, feeBelow: 20, delivery: '72h' },
  { name: 'Fuerteventura', keywords: ['fuerteventura'], freeFrom: 300, feeBelow: 20, delivery: '72h' },
];

function islandShippingLine(island) {
  const cutoff = island.cutoffNote ? ` ${island.cutoffNote}` : '';
  return `A ${island.name} el envío es gratis a partir de ${island.freeFrom}€; si no llegas a esa cantidad se cobran ${island.feeBelow}€ de gastos de envío. El plazo estimado es de ${island.delivery} (en días laborables).${cutoff}`;
}

function findIslandInText(normalizedText) {
  return ISLAND_SHIPPING.find((island) => island.keywords.some((k) => normalizedText.includes(k)));
}

// Respuesta rápida: si el cliente ya menciona una isla, contesta solo sobre esa isla
// (sin soltar la tabla entera); si no la menciona, da el resumen general y pregunta.
function enviosReply(normalizedText) {
  // Se comprueba la isla ANTES que "fuera de Canarias": un mensaje puede colar una
  // palabra que coincide con una provincia peninsular sin querer (p. ej. un cliente
  // que se llama o se apellida "León" preguntando por Tenerife) — si el mensaje
  // menciona una isla real, esa respuesta concreta gana siempre, en vez de decirle
  // por error que no se envía a donde sí se envía.
  const island = findIslandInText(normalizedText);
  if (island) return `${islandShippingLine(island)} Para artículos muy pesados o voluminosos el porte se calcula aparte, a consultar.`;
  if (mentionsOutsideCanarias(normalizedText)) {
    return 'No, solo hacemos envíos dentro de las Islas Canarias — no enviamos a Península ni al extranjero.';
  }
  return `${ENVIOS_GENERAL_INTRO} El envío gratis y el plazo cambian según la isla — ¿a cuál te refieres? Así te doy el dato exacto.`;
}

// Versión completa (todas las islas), para el contexto de la IA.
const ENVIOS_INFO = `${ENVIOS_GENERAL_INTRO}\n\n${ISLAND_SHIPPING.map(islandShippingLine).join('\n')}\n\nPara artículos muy pesados o voluminosos, el porte se calcula aparte, a consultar.`;

const DEVOLUCIONES_INFO = `Tienes 14 días naturales desde la entrega para devolver un producto, siempre que esté sin usar, con las etiquetas y en su embalaje original. El reembolso se hace por el mismo medio de pago, en un plazo máximo de 30 días naturales. Los gastos de la devolución los asume el cliente, salvo que el producto tenga algún defecto. Si compraste por la web, también puedes devolver en tienda sin coste. Para iniciar una devolución escribe a pedidos@ofipapelsl.com indicando tus datos de compra (núm. de pedido o núm. de factura) y el motivo. Si el producto llegó dañado o defectuoso, avísanos en las 24h siguientes a la entrega (con fotos) a ese mismo email.`;

// Reglas de coincidencia por palabras clave, evaluadas en orden.
// La primera que encuentre una palabra clave en el mensaje gana.
const FAQ_RULES = [
  {
    keywords: ['placa vv', 'placas vv', 'placa de vv', 'placas de vv', 'placa vivienda vacacional', 'placas vivienda vacacional', 'vivienda vacacional'],
    reply: PLACAS_VV_INFO,
  },
  {
    // 'agenda' (el producto) coincide con "agendar"/"agendarme" (pedir cita), así
    // que si el mensaje usa el verbo se deja pasar en vez de hablar de cuadernos.
    keywords: ['agenda', 'agendas'],
    reply: (normalizedText) => (/agendar/.test(normalizedText) ? null : AGENDAS_INFO),
  },
  {
    // 'que regalo'/'qué regalo' a secas se quitaron: coincidían con preguntas
    // genéricas de "¿qué regalo me recomendáis?" que no tienen nada que ver con
    // la campaña de regalos directos por importe de compra.
    keywords: ['regalo directo', 'regalos directos', 'regalo por compra', 'regalos por compra', 'campaña de regalos', 'campana de regalos', 'regalos promocionales', 'z-regalos'],
    reply: REGALOS_INFO,
  },
  {
    // Preguntar por el teléfono/extensión de Pedidos (no por el estado de un pedido
    // concreto) sigue dando el contacto de siempre, sin arrancar la búsqueda real.
    keywords: ['telefono de pedidos', 'teléfono de pedidos', 'telefono directo a pedidos', 'teléfono directo a pedidos', 'numero de pedidos', 'número de pedidos', 'extension de pedidos', 'extensión de pedidos', 'extension 2', 'extensión 2'],
    reply: PEDIDOS_INFO,
  },
  {
    // Colocada antes que las reglas genéricas de horario/dirección/teléfono para que
    // estas frases no caigan en la respuesta genérica de contacto. Preguntar por el
    // estado de un pedido concreto arranca la búsqueda real en WooCommerce (ver
    // isPedidoEstadoQuestion en whatsapp-webhook.js) en vez de solo dar el contacto.
    keywords: ['estado de mi pedido', 'estado del pedido', 'seguimiento de mi pedido', 'seguimiento del pedido', 'donde esta mi pedido', 'dónde está mi pedido', 'donde está mi pedido', 'cuando llega mi pedido', 'cuándo llega mi pedido', 'numero de pedido', 'número de pedido', 'no me ha llegado mi pedido', 'no me llego mi pedido', 'no me llegó mi pedido', 'mi pedido no ha llegado', 'incidencia con mi pedido', 'incidencia con un pedido', 'incidencia con el pedido'],
    reply: PEDIDO_ESTADO_TRIGGER,
  },
  {
    // Ojo con las palabras sueltas: 'trabajo' colisiona con "trabajo de
    // imprenta" (Reprografía) y 'personal' con "sellos personalizados", así que
    // aquí solo van frases que de verdad solo se dicen buscando empleo.
    keywords: [
      'curriculum', 'currículum', 'curriculo', 'currículo', 'mi cv', 'el cv', 'enviar cv', 'mandar cv',
      'oferta de empleo', 'ofertas de empleo', 'bolsa de empleo', 'solicitud de empleo', 'buscar empleo',
      'busco trabajo', 'buscando trabajo', 'puesto de trabajo', 'bolsa de trabajo',
      'trabajar con vosotros', 'trabajar con ustedes', 'trabajar en ofipapel', 'trabajar para ofipapel',
      'buscan personal', 'buscais personal', 'buscáis personal', 'necesitan personal', 'necesitais personal',
      'necesitáis personal', 'contratando', 'estan contratando', 'están contratando', 'vacante', 'vacantes',
    ],
    reply: EMPLEO_INFO,
  },
  {
    // Antes que la regla de Administración: ahí "factura" a secas manda al
    // departamento equivocado para lo que casi siempre se pregunta, que es la
    // copia de la factura de un pedido. Estas frases son más largas, así que
    // ganan (ver matchFaqRule, que se queda con la coincidencia más específica).
    keywords: [
      'la factura', 'una factura', 'mi factura', 'copia de la factura', 'copia de factura',
      'pedir la factura', 'pedir factura', 'necesito la factura', 'quiero la factura',
      'mandar la factura', 'mandarme la factura', 'enviar la factura', 'enviarme la factura',
      'me manden la factura', 'me envien la factura', 'me envíen la factura',
      'factura del pedido', 'factura de mi pedido', 'factura de la compra',
      'no me dieron la factura', 'no me dejaron la factura', 'sin factura',
      'factura simplificada', 'factura con mis datos', 'hacerme una factura',
    ],
    reply: FACTURA_INFO,
  },
  {
    keywords: ['factura', 'facturas', 'administracion', 'administración', 'departamento administrativo', 'telefono de administracion', 'teléfono de administración', 'telefono directo a administracion', 'teléfono directo a administración', 'extension de administracion', 'extensión de administración', 'extension 1', 'extensión 1'],
    reply: ADMINISTRACION_INFO,
  },
  {
    keywords: [
      'imprimir', 'imprime', 'imprimen', 'imprimimos', 'impresiones', 'copias', 'fotocopia', 'fotocopias',
      'encuadernado', 'encuadernados', 'encuadernar', 'plastificado', 'plastificados', 'plastificar',
      'folletos', 'tarjetas de visita', 'sellos personalizados', 'sello', 'sellos', 'talonarios', 'tarjetas para bodas',
      'trabajo de imprenta', 'trabajos de imprenta', 'imprenta', 'reprografia', 'reprografía',
      'departamento de reprografia', 'departamento de reprografía', 'extension 3010', 'extensión 3010',
      'escaneado', 'escaneados', 'escanear', 'escaneo', 'escanea', 'digitalizar', 'digitalizacion', 'digitalización',
    ],
    reply: reprografiaReply,
  },
  {
    // Colocada antes que la regla genérica de "teléfono/llamar" (más abajo, con la
    // keyword suelta "llamar") para que frases como "me pueden llamar" o "que me
    // llamen" no caigan en la respuesta genérica del teléfono de la tienda — eso
    // invita al CLIENTE a llamar, cuando en realidad está pidiendo lo contrario
    // (que LE llamen a él). Con "llamar" a secas más abajo, esta regla nunca ganaba.
    keywords: [
      // español
      'hablar con alguien', 'hablar con una persona', 'hablar con un agente', 'hablar con agente',
      'atencion humana', 'atención humana', 'persona real', 'no me sirve', 'no me ayuda', 'quiero hablar con',
      'queja', 'quejarme', 'poner una queja', 'reclamacion', 'reclamación', 'reclamar', 'denuncia', 'denunciar',
      'estoy harto', 'estoy harta', 'estoy cansado de', 'estoy cansada de', 'mal servicio', 'pesimo', 'pésimo',
      'indignado', 'indignada', 'inaceptable', 'esto es un desastre', 'esto no puede ser', 'estafa',
      'me han estafado', 'me habeis estafado', 'me habéis estafado', 'necesito una solucion', 'necesito una solución',
      'quiero una solucion', 'quiero una solución', 'que solucion me dan', 'qué solución me dan', 'solucion ya',
      'solución ya', 'es urgente', 'muy urgente',
      // Pedir que el equipo le devuelva la llamada/mensaje: esto NO lo puede prometer
      // la IA por su cuenta (no tiene forma de avisar a nadie de verdad), así que se
      // engancha al mismo flujo real de escalado en vez de dejar que lo conteste sola.
      'pasar un mensaje', 'pasarle un mensaje', 'pasar mi mensaje', 'pasar mi consulta', 'pasarle mi consulta',
      'dejar un mensaje', 'dejar mi numero', 'dejar mi número', 'dejar mi telefono', 'dejar mi teléfono',
      'que me llamen', 'que me llame', 'que me contacten', 'que me contacte', 'que me devuelvan la llamada',
      'me pueden llamar', 'me podeis llamar', 'me podéis llamar', 'anotar mi consulta', 'anotar mi pedido',
      // inglés (mismo canal de escalado, para que no dependa del idioma del cliente)
      'talk to an agent', 'talk to a person', 'talk to a human', 'speak to an agent', 'speak with an agent',
      'speak to a person', 'speak with a person', 'human agent', 'human person', 'real person', 'a real human',
      'customer service', 'i want to talk to', 'i want to speak to', 'can i speak with', 'can i talk to',
      'this is unacceptable', 'i want to complain', 'i have a complaint', 'this is a scam', 'i was scammed',
      'i need a solution', 'very urgent', 'it is urgent',
      'pass a message', 'leave a message', 'call me back', 'have someone call me', 'can someone call me',
    ],
    reply: agenteInfoOrDecline,
  },
  {
    // "¿Tenéis tienda física?" es una pregunta de confianza/existencia (¿sois una
    // tienda real, no solo online?), distinta de "dirección" (que por defecto solo
    // da la sede principal) — aquí sí tiene sentido enseñar las 3 tiendas de golpe.
    keywords: ['tienda fisica', 'tienda física', 'tiendas fisicas', 'tiendas físicas', 'tienen tienda', 'teneis tienda', 'tenéis tienda', 'hay tienda fisica', 'hay tienda física'],
    reply: () => `Sí, tenemos 3 tiendas físicas en Tenerife:\n${storesSummary()}`,
  },
  {
    // Por defecto solo se da el horario de la sede principal (no las 3 tiendas) —
    // si el cliente nombra una tienda en concreto (Aliz 1, Aliz 2...), se le da la suya.
    // Ojo: 'hora' a secas NO es keyword — coincide con "ahora" ("ahora mismo",
    // "¿podéis ayudarme ahora?"), una de las palabras más comunes del español, y
    // disparaba esta regla en mensajes que no tenían nada que ver con el horario.
    keywords: ['horario', 'a que hora', 'a qué hora', 'que hora abren', 'qué hora abren', 'que hora cierran', 'qué hora cierran', 'hasta que hora', 'hasta qué hora', 'desde que hora', 'desde qué hora', 'abierto', 'abren', 'cierran', 'cierra'],
    reply: (normalizedText) => {
      const found = findStoreInText(normalizedText);
      const store = found || STORES[0];
      const footer = found ? '' : ' Si preguntas por otra de nuestras tiendas (Aliz 1 o Aliz 2) te doy su horario en concreto.';
      return `Horario de ${store.name}: ${store.hours}.${footer}`;
    },
  },
  {
    // Igual que el horario: por defecto solo la dirección de la sede principal, salvo
    // que el cliente pregunte por una tienda concreta. Ojo: 'mapa' a secas NO es
    // keyword — coincide con "mapamundi" o "mapa de Tenerife" (productos que se
    // pueden vender en la tienda), y disparaba la dirección de la tienda en vez de
    // dejar pasar la pregunta sobre el producto.
    keywords: ['direccion', 'dirección', 'donde estan', 'donde estáis', 'dónde están', 'dónde estáis', 'ubicacion', 'ubicación', 'como llegar', 'cómo llegar', 'como llego', 'cómo llego'],
    reply: (normalizedText) => {
      const found = findStoreInText(normalizedText);
      const store = found || STORES[0];
      const footer = found ? '' : '\nSi buscas otra de nuestras tiendas (Aliz 1 o Aliz 2) dime cuál y te paso su dirección.';
      return `Estamos en: ${store.address}\nCómo llegar: ${store.mapsUrl}${footer}`;
    },
  },
  {
    // Las llamadas van casi siempre a la central (STORES[0]), así que no hace falta
    // dar el teléfono de las 3 tiendas — y si estamos fuera de horario no se invita
    // a llamar "ahora" porque no habría nadie para atender.
    // 'numero'/'número' sueltos NO son palabra clave: los clientes los usan
    // constantemente para referirse a la referencia de un producto ("cartucho hp
    // número 305 en negro" — visto en real, contestaba con el teléfono de la
    // tienda). Solo cuentan las frases que de verdad piden un teléfono.
    keywords: [
      'telefono', 'teléfono', 'llamar',
      'numero de contacto', 'número de contacto', 'numero de telefono', 'número de teléfono',
      'vuestro numero', 'vuestro número', 'su numero', 'su número', 'numero para llamar', 'número para llamar',
    ],
    reply: (normalizedText) => {
      const found = findStoreInText(normalizedText);
      const store = found || STORES[0];
      const nombre = found ? '' : ` (${store.name})`;
      return isWithinBusinessHours()
        ? `Puedes llamarnos ahora al ${store.phone}${nombre} (horario: ${store.hours}).`
        : `Ahora mismo estamos fuera de horario (${store.hours}), así que no hay nadie disponible para atender llamadas. Nuestro teléfono es ${store.phone}${nombre} — puedes llamarnos en cuanto abramos.`;
    },
  },
  {
    keywords: [
      'registrar', 'registro', 'cuenta de cliente', 'abrir cuenta', 'abrir una cuenta', 'crear cuenta',
      'crear una cuenta', 'hacerme una cuenta', 'hacer una cuenta', 'darme de alta',
      'darse de alta', 'dar de alta', 'alta de cliente', 'alta nueva', 'nuevo cliente', 'cliente nuevo',
      'nueva cuenta', 'mi cuenta', 'como me registro', 'cómo me registro',
    ],
    reply: REGISTRO_INFO,
  },
  {
    // Antes que la regla genérica de "cómo comprar" para que preguntas del tipo
    // "¿puedo pedir y recogerlo en tienda?" no caigan en la respuesta genérica del
    // proceso de compra sin mencionar la opción de recogida.
    keywords: ['recogida en tienda', 'recoger en tienda', 'recoger en la tienda', 'recoger mi pedido en tienda', 'recoger el pedido en tienda', 'recogerlo en tienda', 'recogerlo en la tienda'],
    reply: RECOGIDA_TIENDA_INFO,
  },
  {
    keywords: ['catalogo fisico', 'catálogo físico', 'catalogo en pdf', 'catálogo en pdf', 'catalogo impreso', 'catálogo impreso', 'descargar catalogo', 'descargar catálogo', 'teneis catalogo', 'tenéis catálogo', 'tienen catalogo', 'tienen catálogo'],
    reply: CATALOGO_DESCARGA_INFO,
  },
  {
    keywords: ['como comprar', 'cómo comprar', 'como hago un pedido', 'cómo hago un pedido', 'hacer un pedido', 'hacer el pedido', 'quiero pedir', 'quiero hacer un pedido', 'pedir por aqui', 'pedir por aquí', 'pedir por whatsapp', 'comprar online', 'comprar por internet', 'comprar en la web'],
    reply: COMO_COMPRAR_INFO,
  },
  {
    keywords: ['forma de pago', 'formas de pago', 'metodo de pago', 'método de pago', 'como pagar', 'cómo pagar', 'pago con tarjeta', 'contra reembolso', 'transferencia'],
    reply: PAGO_INFO,
  },
  {
    // "portes" (bare) colisionaba con "transportes" (p. ej. "Transportes Noda",
    // una empresa de transporte) — se cambia por frases específicas de gastos de envío.
    keywords: ['envio', 'envío', 'envios', 'envíos', 'gastos de envio', 'gastos de envío', 'gastos de portes', 'coste de portes', 'costo de portes', 'importe de portes', 'cuanto son los portes', 'cuánto son los portes', 'cuanto cuestan los portes', 'cuánto cuestan los portes', 'cuando llega', 'cuándo llega', 'plazo de entrega', 'mandan a', 'mandais', 'mandáis', 'enviais', 'enviáis', 'envian a', 'envían a'],
    reply: enviosReply,
  },
  {
    keywords: ['devolucion', 'devolución', 'devoluciones', 'devolver', 'devuelvo', 'devuelvas', 'cambio de producto', 'cambiar un producto', 'reembolso', 'garantia', 'garantía'],
    reply: DEVOLUCIONES_INFO,
  },
  {
    keywords: [
      'presupuesto', 'presupuestos', 'pedir presupuesto', 'solicitar presupuesto', 'necesito un presupuesto',
      'quiero un presupuesto', 'hacer un presupuesto',
      'quote', 'a quote', 'price quote', 'get a quote', 'request a quote', 'need a quote',
    ],
    reply: presupuestoReply,
  },
  {
    // La petición de la lista del colegio muchas veces ni siquiera lleva la
    // palabra "presupuesto" ("necesito el material del cole de mi hija"), así
    // que estas frases entran por sí solas. Ojo: NO vale con "material escolar"
    // a secas, que es una pregunta normal de catálogo ("¿tenéis material
    // escolar?") y ésa sí la contesta el bot.
    keywords: [
      'lista de material', 'listado de material', 'lista del material', 'listado del material',
      'lista de libros', 'listado de libros', 'libros de texto',
      'material del colegio', 'material para el colegio', 'material del cole',
      'material para el cole', 'material del curso', 'material para el curso',
    ],
    reply: PRESUPUESTO_ESCOLAR_INFO,
  },
  {
    // Igual que el saludo: "gracias"/"perfecto" aparecen también al final de mensajes
    // con una pregunta real detrás (p. ej. "...¿sería posible recogerlo esta mañana?
    // Gracias.") o dentro de una pregunta real ("busco el regalo perfecto"). El
    // conteo de palabras totales daba falsos positivos en ambos casos — ahora se
    // comprueba que el mensaje ENTERO (quitando puntuación) sea solo agradecimiento,
    // no que sea corto.
    keywords: ['gracias', 'muchas gracias', 'perfecto', 'vale gracias'],
    reply: (normalizedText) => (isPureThanks(normalizedText) ? '¡De nada! Si necesitas cualquier otra cosa aquí estamos. 😊' : null),
  },
  {
    // Al final a propósito: "hola"/"buenos días" aparece en muchísimos mensajes que
    // además preguntan otra cosa (p. ej. "Buenos días, ¿tenéis bobinas de 20kg?"), y
    // si esta regla fuera la primera se comería esas preguntas. Solo debe ganar si
    // ninguna regla más específica ha coincidido antes Y el mensaje es realmente solo
    // un saludo puro (sin nada más detrás) — si hay una pregunta real, se deja pasar
    // a reglas más específicas o a la IA en vez de devolver el saludo genérico.
    keywords: ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches'],
    reply: (normalizedText) => (isPureGreeting(normalizedText) ? GREETING : null),
  },
];

const CATALOGO_INFO = `Además de papelería, vendemos: accesorios de telefonía, accesorios de informática, ordenadores, artículos para el hogar, electrodomésticos, y uno de los mayores stocks de Canarias en consumibles para todo tipo de impresoras (tóner, tinta, etc.), además de impresoras y multifunción láser e inkjet, entre muchos otros artículos. También ofrecemos leasing de impresoras. Tenemos además amplia exposición de mobiliario de oficina, con gran variedad de sillas gaming y sillas ergonómicas de oficina.`;

// Prompt de sistema usado como respaldo cuando ninguna regla de FAQ coincide. Es una
// función (no una cadena fija) porque necesita el estado de horario comercial EN EL
// MOMENTO de cada mensaje: Claude no tiene ni idea de qué hora es "ahora mismo" si no
// se lo decimos explícitamente en el prompt en cada llamada.
// Lo que ya sabemos de quien escribe, para que un cliente habitual no sea
// tratado como si fuera la primera vez. Son datos duros (nombre salido de un
// pedido verificado, pedidos que él mismo consultó, productos que escribió y
// notas del equipo), nunca conclusiones de la IA — ver conversation-store.js.
function fichaClienteBlock(ficha) {
  if (!ficha) return '';
  const lineas = [];
  if (ficha.empresa) lineas.push(`- Empresa: ${ficha.empresa}`);
  if (ficha.nombre) lineas.push(`- Nombre: ${ficha.nombre}`);
  if (Array.isArray(ficha.pedidos) && ficha.pedidos.length) {
    lineas.push(`- Pedidos que ya ha consultado por aquí: ${ficha.pedidos.map((p) => `#${p.id}`).join(', ')}`);
  }
  if (Array.isArray(ficha.productos) && ficha.productos.length) {
    lineas.push(`- Ha preguntado antes por: ${ficha.productos.join('; ')}`);
  }
  if (ficha.notas) lineas.push(`- Notas del equipo sobre este cliente: ${ficha.notas}`);
  if (lineas.length === 0) return '';

  return `\nLo que ya sabemos de este cliente de conversaciones anteriores (datos reales de nuestro sistema, no suposiciones):\n${lineas.join('\n')}\nÚsalo con naturalidad, como lo haría alguien del equipo que ya le conoce (por ejemplo, si vuelve a preguntar por un pedido que ya consultó, no le hagas repetir el número). No se lo recites de golpe ni le des a entender que tienes una ficha suya, y no des por hecho que hoy quiere lo mismo que la última vez: pregúntaselo.\n`;
}

function buildAiSystemPrompt(productContext = null, fichaCliente = null) {
  const abierto = isWithinBusinessHours();
  const estadoActual = abierto
    ? `ABIERTO ahora mismo (horario de la sede principal: ${STORES[0].hours}).`
    : `CERRADO ahora mismo (horario de la sede principal: ${STORES[0].hours}) — no hay nadie disponible para atender llamadas ni pasar con un agente hasta que abramos.`;

  const productContextBlock = productContext
    ? `\nResultado de búsqueda EN TIEMPO REAL en nuestro catálogo (ofipapel.net) para el mensaje que te acaban de escribir — son datos reales, tómalos como ciertos:\n${productContext}\n\nCómo usar estos resultados:\n- Si no tienen nada que ver con lo que pregunta el cliente, ignóralos por completo — no los menciones y sigue las instrucciones de "no sé la respuesta" para ese producto.\n- CRÍTICO con las referencias (83A, 305, 603XL, TN2420, CF283A...): un resultado solo vale si su nombre lleva EXACTAMENTE la referencia que ha pedido el cliente. Si pide el 83 y lo que aparece es un 87-A, un 219-X o un 216-A, NO es el suyo: no se lo ofrezcas como si lo fuera ni digas que "es ese" — son piezas distintas que no le servirán, y hacérselo comprar es un problema real para él y para la tienda. En ese caso trátalo como que no lo has encontrado y sigue las instrucciones de "no sé la respuesta". Un número parecido NUNCA es equivalente.\n- Si la pregunta es GENÉRICA (un tipo de artículo, no un modelo/marca concreto — p. ej. "grapadoras", "cartuchos de tinta") y hay CATEGORÍAS que coinciden con varios tipos distintos, pregunta por el tipo citando los nombres reales de esas categorías (p. ej. "¿qué tipo buscas: de oficina, eléctricas, de tenaza...?"). En cuanto el cliente concrete el tipo, dale el enlace directo a esa categoría (no hace falta que sea un producto suelto) — así puede ver todas las opciones de ese tipo en la web.\n- Si la pregunta ya es sobre un producto o modelo concreto y hay un solo resultado de PRODUCTOS que responde claramente, confírmalo con su nombre y precio, e incluye el enlace directo de ese producto. Si ese resultado está SIN STOCK, dilo con claridad y, en vez de tratarlo como si se pudiera pedir con normalidad, indica que para consultar disponibilidad o reposición contacte con Compras: compras@ofipapelsl.com o ${STORES[0].phone}.\n- Si hay varios PRODUCTOS que podrían valer y lo que cambia entre ellos es un dato concreto (tamaño, color, marca, presentación...), NO los listes todos ni des ningún enlace todavía: mira qué varía entre los nombres y pregúntaselo directamente al cliente citando las opciones reales que has visto (por ejemplo: "¿qué tamaño necesitas: A4, A3 o 50x65?"), para poder confirmarle el producto exacto en cuanto responda.\n- Esa regla vale MIENTRAS estás concretando, no después. En cuanto el cliente concreta (te dice el color, la capacidad, o que prefiere el compatible), o en cuanto te pregunta CÓMO encontrarlos, dónde están o cómo comprarlos, dale los ENLACES DIRECTOS de los productos que tienes arriba. Nunca le expliques cómo usar el buscador de la web ni en qué sección mirar: ya tienes las direcciones exactas, y mandarle a buscar teniéndolas delante es dejarle a él tu trabajo. Tampoco describas cómo es la web por dentro (dónde está el buscador, qué secciones hay): no la estás viendo y te lo estarías inventando.\n- Si un producto viene marcado como CON DESCUENTO POR CANTIDAD, no des su precio como si fuera un precio único y cerrado: di que ese es el precio por unidad y que baja según la cantidad que se lleve, e invítale a ver el escalado completo en la ficha del producto (el enlace). Nunca te inventes los tramos ni los precios con descuento — no los tienes, solo están en la ficha.\n- IMPORTANTE con TODOS los precios del catálogo: son SIN IGIC (así se muestran en la web, "Igic No Incluido"). Siempre que des un precio, acláralo en la misma frase (por ejemplo: "4,66€ + IGIC"). Nunca calcules tú el precio con IGIC aplicado.\n- ORIGINAL y GENÉRICO: cada producto de arriba lleva su etiqueta puesta por el sistema. En Ofipapel "genérico" y "compatible" son LA MISMA COSA: el consumible que NO es de la marca de la impresora, y que cuesta bastante menos. Si el cliente pide "genérico", "compatible", "no original", "más barato" o "de marca blanca", quiere los marcados como GENÉRICO. Fíate SOLO de la etiqueta, nunca de lo que te parezca por el nombre. Y si pide genéricos y arriba no hay ninguno marcado así, dile que de esa referencia solo tenemos original — no le presentes un original como si fuera el genérico.\n- CUIDADO con la palabra "compatible", que significa dos cosas y ya se confundieron una vez con un cliente real: que un consumible SIRVA para su impresora no lo convierte en "un compatible". Un original TAMBIÉN sirve para su impresora. Usa "compatible"/"genérico" solo para el producto que no es de la marca; para lo otro di "le vale a tu impresora" o "es el que lleva".\n- Si de la misma referencia hay original y genérico, dilo con los dos precios y deja claro cuál es cuál: es la comparación que casi todo el mundo quiere hacer.\n- NUNCA remitas al cliente al teléfono ni al correo para saber un precio o una disponibilidad que ya tienes aquí arriba. Visto en real: con los tóneres de su impresora delante, con su precio, el bot contestó \"el equipo te puede consultar disponibilidad y precios\" — y le hizo llamar para algo que ya sabía. Manda al equipo solo para lo que de verdad no puedes resolver: un pedido, una incidencia, o un producto que no aparece en estos resultados.\n`
    // Sin resultados hay que decírselo igual, porque si no la IA se inventa el
    // motivo. Comprobado en real: preguntaron por soportes de móvil para coche
    // (tenemos seis) y contestó "no tengo acceso al catálogo en tiempo real",
    // que además de falso deja al cliente pensando que el bot no sirve.
    : `\nSe ha buscado EN TIEMPO REAL en nuestro catálogo (ofipapel.net) lo que te acaban de escribir, y NO ha aparecido ningún producto que encaje.\n\nCómo contarlo:\n- Puedes decir que no lo encuentras, pero NUNCA digas que no tienes acceso al catálogo, que no puedes consultar el stock o que no ves los precios: sí has buscado. Decir lo contrario es mentirle al cliente y le hace pensar que no sirves para nada.\n- Que no aparezca no significa que no lo tengamos: puede estar con otro nombre, ser una marca que no está en la web o venderse solo en tienda. Dilo así, sin dar por hecho que no existe, y ofrécele preguntar al equipo (${STORES[0].phone} o pedidos@ofipapelsl.com) o pasarse por la tienda.\n- No te inventes productos, precios ni disponibilidad, y no afirmes que "es probable que lo tengamos".\n- Si le preguntas algo para concretar, hazlo ABIERTO. No le ofrezcas una lista de opciones inventada ("¿de madera, plástico o aluminio?", "¿qué marca?") como si supieras que existen esas variantes: no has visto ninguna. Pregúntale para qué lo quiere o cómo es, y con lo que te diga se vuelve a buscar.\n`;

  return `Eres el asistente de atención al cliente por WhatsApp de ${BUSINESS_NAME}, una tienda en Tenerife de papelería, informática, tecnología y equipamiento de oficina y hogar (no solo papelería).

Estado ahora mismo: ${estadoActual}

Información del negocio:
${storesSummary()}

Qué vendemos: ${CATALOGO_INFO}
${fichaClienteBlock(fichaCliente)}${productContextBlock}

Qué NO vendemos (dilo con seguridad, no hace falta escalar): sellos de correos/postales (eso lo gestiona Correos, no nosotros — sí hacemos sellos personalizados de goma, que es distinto) ni papel sellado/timbrado para trámites oficiales.

Registro de clientes: ${REGISTRO_INFO}

Cómo comprar: ${COMO_COMPRAR_INFO}

Catálogos: ${CATALOGO_DESCARGA_INFO}

Formas de pago: ${PAGO_INFO}

Envíos: ${ENVIOS_INFO}

Placas VV (identificación de vivienda vacacional): ${PLACAS_VV_INFO}

Agendas: ${AGENDAS_INFO}

Campaña de regalos directos: ${REGALOS_INFO}

Reprografía (impresiones, copias, encuadernados, imprenta): ${REPROGRAFIA_INFO}

Devoluciones: ${DEVOLUCIONES_INFO}

Contacto general: teléfono ${STORES[0].phone}, email pedidos@ofipapelsl.com (consultas generales, pedidos y devoluciones).

Empleo: ${EMPLEO_INFO} No existe ningún otro canal para esto — no menciones departamentos de recursos humanos, formularios ni secciones de la web de las que no tengas constancia aquí.

Instrucciones:
- Responde SIEMPRE en el idioma en que esté escrito el mensaje del cliente, desde el primer mensaje, aunque sea muy corto (si escribe "Hi", respondes en inglés; si escribe "Hola", en español; etc.). No respondas en español por defecto ni digas cosas como "respondo en español" — cambia de idioma directamente, sin comentarlo. Hazlo de forma breve, cercana y natural (máximo 3-4 frases), como lo haría una persona real del equipo escribiendo un WhatsApp, no como un robot leyendo una lista de datos.
- No hace falta que saludes tú al principio de tu respuesta (ni "Hola", ni "¡Buenas!", ni nada parecido): si el cliente ha saludado, el sistema ya antepone el saludo automáticamente antes de tu respuesta. Ve directa/o a responder la pregunta.
- Contesta solo a lo que el cliente ha preguntado. Si la información que tienes cubre varios casos (por ejemplo, varias islas de envío) y el cliente solo pregunta por uno, dale únicamente el dato de ese caso concreto; no le sueltes toda la lista si no la ha pedido.
- Nunca invites a llamar "ahora mismo" si estamos fuera del horario comercial (${STORES[0].hours}) — no habría nadie para atender la llamada. Fuera de horario, en vez de sugerir llamar, deja claro que la atención personal (por teléfono o con un agente) será en cuanto abramos y retomemos la actividad, no al instante.
- IMPORTANTE — salvo que arriba tengas un "Resultado de búsqueda EN TIEMPO REAL" que responda exactamente a lo que preguntan, NO TIENES ACCESO A NUESTRO CATÁLOGO NI AL STOCK REAL. Si te preguntan si vendemos un PRODUCTO CONCRETO (una marca, modelo o artículo específico — no una categoría general de las listadas en "Qué vendemos") y no tienes ese resultado real, NUNCA confirmes ni descartes que lo tenemos, aunque te suene plausible para una papelería/tienda de informática y te parezca una respuesta razonable ("seguramente sí lo vendemos"). No lo sabes de verdad, así que ese caso ES un "no sé la respuesta" — pasa directamente al punto siguiente.
- IMPORTANTE — si no sabes la respuesta a algo (un producto concreto, precio o servicio del que no tienes datos fiables, o cualquier pregunta que no puedas responder con seguridad), NO improvises una respuesta ni inventes que vas a "consultarlo" o "pasarlo al equipo". Da la información breve que sí tengas (por ejemplo, el departamento o contacto más adecuado si lo hay), y SIEMPRE añade al final, en una frase aparte, EXACTAMENTE este texto, tal cual, sin cambiar ni una palabra: "${NO_SE_LA_RESPUESTA}" — aunque ya hayas dado un contacto o departamento, esa frase exacta tiene que aparecer siempre que no tengas la certeza de la respuesta. El sistema la detecta y le ofrece al cliente, en un segundo mensaje aparte, hablar con un agente de verdad (con botones Sí/No reales) — así que no hace falta que tú ofrezcas nada de eso con tus propias palabras, solo incluye la frase exacta.
- Si preguntan por el estado de un pedido ya hecho, lo PRIMERO es pedirles el número de pedido (lo tienen en el email de confirmación): el sistema sí puede consultarlo de verdad y decirles en qué estado está. NUNCA digas que no tienes acceso a sus pedidos ni que no puedes consultarlos desde aquí — es falso y les hace llamar para nada. Si ya te han dado el número y aun así no tienes el dato delante, pídeselo otra vez por si venía mal escrito. Solo cuando se trate de algo que el número no resuelve (una incidencia, una devolución, un cambio en el pedido) indícales que contacten con Pedidos al ${STORES[0].phone} (extensión 2) o pedidos@ofipapelsl.com (si es fuera de horario, aclara que la respuesta será cuando abramos).
- Si es un tema administrativo (facturas, pagos, cuentas) que no puedas resolver, indícales que contacten con Administración al ${STORES[0].phone} (extensión 1) o administracion@ofipapelsl.com (si es fuera de horario, aclara que la respuesta será cuando abramos).
- IMPORTANTE: nunca prometas cosas que no puedes cumplir tú sola, como "le paso tu consulta al equipo", "he anotado tu nombre y teléfono para que te llamen" o "el equipo te contactará mañana". No tienes forma de avisar a nadie ni de guardar esos datos para un seguimiento real — si dices eso, el cliente se queda esperando una llamada que nunca llega. Si el cliente pide que le devuelvan la llamada, le contacten, o le pasen un mensaje al equipo, no lo gestiones tú: dile que puede escribir directamente a pedidos@ofipapelsl.com con su nombre y teléfono, o (si estamos en horario) llamar al ${STORES[0].phone}.
- Si el mensaje parece una queja, un pedido complejo, o el cliente muestra que no está satisfecho con tu respuesta, ofrécele amablemente hablar con una persona del equipo. Si estamos en horario, facilita el teléfono directo: ${STORES[0].phone}. Si estamos fuera de horario, no des el teléfono para llamar ahora: dile que un agente atenderá su petición en cuanto retomemos la actividad.
- NUNCA le mandes al cliente a buscar él en ofipapel.net ("busca 'Epson 604' en la web y ahí lo ves"). Buscar es tu trabajo, no el suyo: si te ha escrito por WhatsApp es justamente para no tener que hacerlo. Puedes dar el enlace directo de un producto o de una categoría concreta cuando lo tengas en los resultados de búsqueda, pero no la instrucción de que se ponga a buscar. Si no tienes los datos, dile lo que sí sabes y ofrécele el contacto del equipo.
- No uses markdown ni listas largas, escribe como un mensaje de texto normal.`;
}

module.exports = {
  BUSINESS_NAME,
  STORES,
  GREETING,
  PRESENTACION,
  PRESENTACION_BREVE,
  presentacionPara,
  esSoloSaludo,
  PAUSA_GLOBAL_REPLY,
  ESPERA_REPLY,
  AGENTE_INFO_ABIERTO,
  AGENTE_INFO_CERRADO,
  agenteInfo,
  isAgenteInfoMessage,
  isWithinBusinessHours,
  SELLOS_QUESTION,
  SELLOS_WEB_INFO,
  SELLOS_TIENDA_INFO,
  isSellosQuestion,
  startsWithGreeting,
  NO_SE_LA_RESPUESTA,
  isNoSeLaRespuesta,
  isUnverifiedConfirmation,
  isUnverifiedStockClaim,
  PRODUCTO_NO_VERIFICADO_INFO,
  PEDIDOS_INFO,
  PEDIDO_ESTADO_TRIGGER,
  isPedidoEstadoQuestion,
  PRESUPUESTO_ESCOLAR_INFO,
  FACTURA_INFO,
  isPresupuestoEscolar,
  FAQ_RULES,
  buildAiSystemPrompt,
};
