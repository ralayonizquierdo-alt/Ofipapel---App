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

const GREETING = `¡Hola! 👋 Soy el asistente virtual de ${BUSINESS_NAME}. ¿En qué puedo ayudarte? Puedes preguntarme por horarios, ubicación, teléfono o lo que necesites.`;

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

const ADMINISTRACION_INFO = `Para temas administrativos (facturas, pagos, cuentas) contacta directamente con Administración: ${STORES[0].phone} (extensión 1) o administracion@ofipapelsl.com.`;

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

// Un ítem concreto por mensaje (igual que con los envíos): si el cliente pregunta
// por un servicio de Reprografía en concreto, se contesta solo sobre ese, no con
// el listado completo cada vez. "reply" opcional para una respuesta a medida en
// vez de la plantilla genérica (p. ej. sellos, que tiene dos vías de pedido).
const REPROGRAFIA_ITEMS = [
  { name: 'impresiones', keywords: ['imprimir', 'imprime', 'imprimen', 'imprimimos', 'impresion', 'impresión', 'impresiones'] },
  { name: 'copias', keywords: ['copias'] },
  { name: 'fotocopias', keywords: ['fotocopia', 'fotocopias'] },
  { name: 'encuadernados', keywords: ['encuadernado', 'encuadernados', 'encuadernar'] },
  { name: 'plastificados', keywords: ['plastificado', 'plastificados', 'plastificar'] },
  { name: 'folletos', keywords: ['folletos'] },
  { name: 'tarjetas de visita', keywords: ['tarjetas de visita'] },
  { name: 'sellos personalizados', keywords: ['sellos personalizados', 'sello personalizado', 'sellos', 'sello'], reply: SELLOS_QUESTION },
  { name: 'talonarios', keywords: ['talonarios'] },
  { name: 'tarjetas para bodas', keywords: ['tarjetas para bodas'] },
  { name: 'trabajos de imprenta', keywords: ['trabajo de imprenta', 'trabajos de imprenta', 'imprenta'] },
];

function reprografiaReply(normalizedText) {
  const item = REPROGRAFIA_ITEMS.find((it) => it.keywords.some((k) => normalizedText.includes(k)));
  if (item) {
    if (item.reply) return item.reply;
    return `Sí, hacemos ${item.name}. El precio depende de la cantidad y el acabado, así que para eso o para encargarlo, contacta con Reprografía: ${REPROGRAFIA_CONTACT}.`;
  }
  return REPROGRAFIA_INFO;
}

const PLACAS_VV_INFO = `Los pedidos de placas VV (identificación de vivienda vacacional) tardan entre 2 y 4 días en procesarse, dependiendo del volumen de trabajo que haya en producción en ese momento. Si elegiste recogida en tienda, te avisamos por teléfono en cuanto esté lista.`;

const AGENDAS_INFO = `Tenemos muchísimos modelos y diseños de agendas en stock. En la web solo están los modelos más básicos, que se repiten todos los años; el resto no lo subimos porque cada año cambian los diseños y no es viable mantenerlo actualizado. Te invitamos a pasar por nuestra tienda, donde podrás ver en vivo cada uno de los diseños que tenemos disponibles.`;

const REGALOS_INFO = `Tenemos una campaña de regalos directos según el importe de tu compra. Los regalos disponibles van cambiando cada varias semanas, así que la lista actualizada (con el importe necesario para cada uno) siempre está en la familia de productos "Z-Regalos Promocionales" de la web. Para elegir tu regalo, indícalo en las observaciones del pedido.`;

const COMO_COMPRAR_INFO = `Puedes comprar en https://ofipapel.net: busca el producto por secciones, marcas o con el buscador, añádelo al carrito y ve a "Finalizar Compra" para dejar tus datos y elegir cómo pagar. Ahí mismo puedes elegir "Recogida en tienda" en vez de envío a domicilio.`;

const RECOGIDA_TIENDA_INFO = `Sí, al hacer tu pedido en la web, en el paso de "Finalizar Compra" puedes elegir "Recogida en tienda" en vez de envío a domicilio — a veces resulta más cómodo y rápido pasar a por él, aunque tu pedido ya tenga el envío gratis.`;

const CATALOGO_DESCARGA_INFO = `En la web puedes descargar nuestros catálogos en formato PDF. Si lo prefieres en formato físico, solo tienes que pasar por alguna de nuestras tiendas.`;

const PAGO_INFO = `Formas de pago aceptadas: tarjeta de crédito o débito (Visa, MasterCard, 4B, Euro 6000, Maestro, American Express), transferencia bancaria, contra reembolso, o en tienda (solo para recogidas, con el pedido hecho antes por la web).`;

const ENVIOS_GENERAL_INTRO = `Hacemos envíos a toda Canarias, pero no enviamos a Península ni al extranjero. Los pedidos de lunes a viernes antes de las 11:30h se gestionan ese mismo día (después, al día siguiente; los de fin de semana/festivos, el próximo día laborable).`;

const PENINSULA_EXTRANJERO_KEYWORDS = ['peninsula', 'península', 'espana peninsular', 'españa peninsular', 'extranjero', 'fuera de españa', 'internacional', 'otro pais', 'otro país'];

// Además de las frases exactas de arriba, cubre variantes tipo "fuera de las Islas
// Canarias", "fuera de la isla de Canarias", etc., que no son un substring literal
// de ninguna keyword fija.
function mentionsOutsideCanarias(normalizedText) {
  if (PENINSULA_EXTRANJERO_KEYWORDS.some((k) => normalizedText.includes(k))) return true;
  return /fuera de(l)?\s+(la[s]?\s+)?(isla[s]?\s+)?(de\s+)?canarias/.test(normalizedText);
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
    cutoffNote: 'Si el pedido se hace antes de las 13:00h, se entrega al día siguiente (salvo imprevistos); si se hace después de esa hora, ya no entra en el reparto del día siguiente, sino en el del otro día.',
  },
  { name: 'La Gomera', keywords: ['gomera'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  { name: 'El Hierro', keywords: ['hierro'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  { name: 'La Palma', keywords: ['la palma', 'palma'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
  { name: 'Gran Canaria', keywords: ['gran canaria'], freeFrom: 200, feeBelow: 15, delivery: '48 a 72h' },
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
  if (mentionsOutsideCanarias(normalizedText)) {
    return 'No, solo hacemos envíos dentro de las Islas Canarias — no enviamos a Península ni al extranjero.';
  }
  const island = findIslandInText(normalizedText);
  if (island) return `${islandShippingLine(island)} Para artículos muy pesados o voluminosos el porte se calcula aparte, a consultar.`;
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
    keywords: ['agenda', 'agendas'],
    reply: AGENDAS_INFO,
  },
  {
    keywords: ['regalo directo', 'regalos directos', 'regalo por compra', 'regalos por compra', 'campaña de regalos', 'campana de regalos', 'regalos promocionales', 'z-regalos', 'que regalo', 'qué regalo', 'que regalos', 'qué regalos'],
    reply: REGALOS_INFO,
  },
  {
    // Colocada antes que las reglas genéricas de horario/dirección/teléfono para que
    // "teléfono de pedidos", "extensión de pedidos", etc. no caigan en la respuesta
    // genérica de contacto solo por contener la palabra "teléfono" o "número".
    keywords: ['estado de mi pedido', 'estado del pedido', 'seguimiento de mi pedido', 'seguimiento del pedido', 'donde esta mi pedido', 'dónde está mi pedido', 'donde está mi pedido', 'cuando llega mi pedido', 'cuándo llega mi pedido', 'numero de pedido', 'número de pedido', 'no me ha llegado mi pedido', 'no me llego mi pedido', 'no me llegó mi pedido', 'mi pedido no ha llegado', 'incidencia con mi pedido', 'incidencia con un pedido', 'incidencia con el pedido', 'telefono de pedidos', 'teléfono de pedidos', 'telefono directo a pedidos', 'teléfono directo a pedidos', 'numero de pedidos', 'número de pedidos', 'extension de pedidos', 'extensión de pedidos', 'extension 2', 'extensión 2'],
    reply: PEDIDOS_INFO,
  },
  {
    keywords: ['factura', 'facturas', 'administracion', 'administración', 'departamento administrativo', 'telefono de administracion', 'teléfono de administración', 'telefono directo a administracion', 'teléfono directo a administración', 'extension de administracion', 'extensión de administración', 'extension 1', 'extensión 1'],
    reply: ADMINISTRACION_INFO,
  },
  {
    keywords: [
      'imprimir', 'imprime', 'imprimen', 'imprimimos', 'impresion', 'impresión', 'impresiones', 'copias', 'fotocopia', 'fotocopias',
      'encuadernado', 'encuadernados', 'encuadernar', 'plastificado', 'plastificados', 'plastificar',
      'folletos', 'tarjetas de visita', 'sellos personalizados', 'sello', 'sellos', 'talonarios', 'tarjetas para bodas',
      'trabajo de imprenta', 'trabajos de imprenta', 'imprenta', 'reprografia', 'reprografía',
      'departamento de reprografia', 'departamento de reprografía', 'extension 3010', 'extensión 3010',
    ],
    reply: reprografiaReply,
  },
  {
    // Por defecto solo se da el horario de la sede principal (no las 3 tiendas) —
    // si el cliente nombra una tienda en concreto (Aliz 1, Aliz 2...), se le da la suya.
    keywords: ['horario', 'hora', 'abierto', 'abren', 'cierran', 'cierra'],
    reply: (normalizedText) => {
      const found = findStoreInText(normalizedText);
      const store = found || STORES[0];
      const footer = found ? '' : ' Si preguntas por otra de nuestras tiendas (Aliz 1 o Aliz 2) te doy su horario en concreto.';
      return `Horario de ${store.name}: ${store.hours}.${footer}`;
    },
  },
  {
    // Igual que el horario: por defecto solo la dirección de la sede principal, salvo
    // que el cliente pregunte por una tienda concreta.
    keywords: ['direccion', 'dirección', 'donde estan', 'donde estáis', 'dónde están', 'dónde estáis', 'ubicacion', 'ubicación', 'mapa', 'como llegar', 'cómo llegar', 'como llego', 'cómo llego'],
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
    keywords: ['telefono', 'teléfono', 'llamar', 'numero', 'número'],
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
      'registrar', 'registro', 'cuenta de cliente', 'abrir cuenta', 'crear cuenta', 'darme de alta',
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
    keywords: ['como comprar', 'cómo comprar', 'como hago un pedido', 'cómo hago un pedido', 'hacer un pedido', 'comprar online', 'comprar por internet', 'comprar en la web'],
    reply: COMO_COMPRAR_INFO,
  },
  {
    keywords: ['forma de pago', 'formas de pago', 'metodo de pago', 'método de pago', 'como pagar', 'cómo pagar', 'pago con tarjeta', 'contra reembolso', 'transferencia'],
    reply: PAGO_INFO,
  },
  {
    keywords: ['envio', 'envío', 'envios', 'envíos', 'gastos de envio', 'gastos de envío', 'portes', 'cuando llega', 'cuándo llega', 'plazo de entrega', 'mandan a', 'enviais', 'enviáis', 'envian a', 'envían a'],
    reply: enviosReply,
  },
  {
    keywords: ['devolucion', 'devolución', 'devoluciones', 'devolver', 'devuelvo', 'devuelvas', 'cambio de producto', 'cambiar un producto', 'reembolso', 'garantia', 'garantía'],
    reply: DEVOLUCIONES_INFO,
  },
  {
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
    keywords: [
      'presupuesto', 'presupuestos', 'pedir presupuesto', 'solicitar presupuesto', 'necesito un presupuesto',
      'quiero un presupuesto', 'hacer un presupuesto',
      'quote', 'a quote', 'price quote', 'get a quote', 'request a quote', 'need a quote',
    ],
    reply: agenteInfo,
  },
  {
    // Igual que el saludo: "gracias"/"perfecto" aparecen también al final de mensajes
    // con una pregunta real detrás (p. ej. "...¿sería posible recogerlo esta mañana?
    // Gracias."), así que solo se contesta "de nada" si el mensaje es puro
    // agradecimiento/cierre corto; si es largo, se deja pasar a reglas más
    // específicas o a la IA en vez de comerse la pregunta.
    keywords: ['gracias', 'muchas gracias', 'perfecto', 'vale gracias'],
    reply: (normalizedText) => (normalizedText.split(/\s+/).filter(Boolean).length <= 6 ? '¡De nada! Si necesitas cualquier otra cosa aquí estamos. 😊' : null),
  },
  {
    // Al final a propósito: "hola"/"buenos días" aparece en muchísimos mensajes que
    // además preguntan otra cosa (p. ej. "Buenos días, ¿tenéis bobinas de 20kg?"), y
    // si esta regla fuera la primera se comería esas preguntas. Solo debe ganar si
    // ninguna regla más específica ha coincidido antes Y el mensaje es realmente solo
    // un saludo corto — si es largo (pregunta real detrás), se deja pasar a la IA en
    // vez de devolver el saludo genérico.
    keywords: ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches'],
    reply: (normalizedText) => (normalizedText.split(/\s+/).filter(Boolean).length <= 6 ? GREETING : null),
  },
];

const CATALOGO_INFO = `Además de papelería, vendemos: accesorios de telefonía, accesorios de informática, ordenadores, artículos para el hogar, electrodomésticos, mobiliario de oficina, y uno de los mayores stocks de Canarias en consumibles para todo tipo de impresoras (tóner, tinta, etc.), además de impresoras y multifunción láser e inkjet, entre muchos otros artículos. También ofrecemos leasing de impresoras.`;

// Prompt de sistema usado como respaldo cuando ninguna regla de FAQ coincide. Es una
// función (no una cadena fija) porque necesita el estado de horario comercial EN EL
// MOMENTO de cada mensaje: Claude no tiene ni idea de qué hora es "ahora mismo" si no
// se lo decimos explícitamente en el prompt en cada llamada.
function buildAiSystemPrompt() {
  const abierto = isWithinBusinessHours();
  const estadoActual = abierto
    ? `ABIERTO ahora mismo (horario de la sede principal: ${STORES[0].hours}).`
    : `CERRADO ahora mismo (horario de la sede principal: ${STORES[0].hours}) — no hay nadie disponible para atender llamadas ni pasar con un agente hasta que abramos.`;

  return `Eres el asistente de atención al cliente por WhatsApp de ${BUSINESS_NAME}, una tienda en Tenerife de papelería, informática, tecnología y equipamiento de oficina y hogar (no solo papelería).

Estado ahora mismo: ${estadoActual}

Información del negocio:
${storesSummary()}

Qué vendemos: ${CATALOGO_INFO}

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

Instrucciones:
- Responde SIEMPRE en el idioma en que esté escrito el mensaje del cliente, desde el primer mensaje, aunque sea muy corto (si escribe "Hi", respondes en inglés; si escribe "Hola", en español; etc.). No respondas en español por defecto ni digas cosas como "respondo en español" — cambia de idioma directamente, sin comentarlo. Hazlo de forma breve, cercana y natural (máximo 3-4 frases), como lo haría una persona real del equipo escribiendo un WhatsApp, no como un robot leyendo una lista de datos.
- Contesta solo a lo que el cliente ha preguntado. Si la información que tienes cubre varios casos (por ejemplo, varias islas de envío) y el cliente solo pregunta por uno, dale únicamente el dato de ese caso concreto; no le sueltes toda la lista si no la ha pedido.
- Nunca invites a llamar "ahora mismo" si estamos fuera del horario comercial (${STORES[0].hours}) — no habría nadie para atender la llamada. Fuera de horario, en vez de sugerir llamar, deja claro que la atención personal (por teléfono o con un agente) será en cuanto abramos y retomemos la actividad, no al instante.
- Si preguntan por productos o precios concretos que no conoces con certeza, no inventes datos: invita a visitar la tienda o, si estamos en horario, a llamar; y añade también la opción de pasarle con un agente si lo prefiere, con un tono cercano tipo "no obstante, si lo desea, podemos pasarle con un agente que resolverá su duda 😊".
- Si preguntan algo concreto sobre un pedido ya hecho (en qué estado está, cuándo llega exactamente, una incidencia, un número de pedido) y no tienes esa información, no inventes nada: indícales que contacten con Pedidos al ${STORES[0].phone} (extensión 2) o pedidos@ofipapelsl.com (si es fuera de horario, aclara que la respuesta será cuando abramos).
- Si es un tema administrativo (facturas, pagos, cuentas) que no puedas resolver, indícales que contacten con Administración al ${STORES[0].phone} (extensión 1) o administracion@ofipapelsl.com (si es fuera de horario, aclara que la respuesta será cuando abramos).
- IMPORTANTE: nunca prometas cosas que no puedes cumplir tú sola, como "le paso tu consulta al equipo", "he anotado tu nombre y teléfono para que te llamen" o "el equipo te contactará mañana". No tienes forma de avisar a nadie ni de guardar esos datos para un seguimiento real — si dices eso, el cliente se queda esperando una llamada que nunca llega. Si el cliente pide que le devuelvan la llamada, le contacten, o le pasen un mensaje al equipo, no lo gestiones tú: dile que puede escribir directamente a pedidos@ofipapelsl.com con su nombre y teléfono, o (si estamos en horario) llamar al ${STORES[0].phone}.
- Si el mensaje parece una queja, un pedido complejo, o el cliente muestra que no está satisfecho con tu respuesta, ofrécele amablemente hablar con una persona del equipo. Si estamos en horario, facilita el teléfono directo: ${STORES[0].phone}. Si estamos fuera de horario, no des el teléfono para llamar ahora: dile que un agente atenderá su petición en cuanto retomemos la actividad.
- No uses markdown ni listas largas, escribe como un mensaje de texto normal.`;
}

module.exports = {
  BUSINESS_NAME,
  STORES,
  GREETING,
  AGENTE_INFO_ABIERTO,
  AGENTE_INFO_CERRADO,
  agenteInfo,
  isAgenteInfoMessage,
  isWithinBusinessHours,
  SELLOS_QUESTION,
  SELLOS_WEB_INFO,
  SELLOS_TIENDA_INFO,
  isSellosQuestion,
  FAQ_RULES,
  buildAiSystemPrompt,
};
