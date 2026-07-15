// Datos del negocio y reglas de respuesta rápida para el agente de WhatsApp de Ofipapel.
// Edita este archivo (sin tocar whatsapp-webhook.js) para actualizar horarios,
// direcciones, teléfonos o añadir nuevas preguntas frecuentes.

const BUSINESS_NAME = 'Ofipapel';

const STORES = [
  {
    name: 'Los Cristianos',
    address: 'Calle Bulevar Chajofe, n.º 4, 38650 Los Cristianos, Santa Cruz de Tenerife, España',
    hours: 'Lunes a viernes 9:00-13:30 y 16:30-20:00, sábados 9:30-13:30',
    phone: '922 753 520',
    mapsUrl: 'https://maps.app.goo.gl/Sx5yVAos3Ltjyuiv8',
  },
];

function storesSummary() {
  return STORES.map(
    (s) => `• ${s.name}: ${s.address} · Horario: ${s.hours} · Tel: ${s.phone}`
  ).join('\n');
}

function storesLocationSummary() {
  return STORES.map(
    (s) => `• ${s.name}: ${s.address}\n  Cómo llegar: ${s.mapsUrl}`
  ).join('\n');
}

const GREETING = `¡Hola! 👋 Soy el asistente virtual de ${BUSINESS_NAME}. ¿En qué puedo ayudarte? Puedes preguntarme por horarios, ubicación, teléfono o lo que necesites.`;

const REGISTRO_URL = 'https://ofipapel.net/mi-cuenta/';
const REGISTRO_INFO = `Puedes registrarte aquí: ${REGISTRO_URL}\nEl mismo registro sirve tanto para comprar en la web como en cualquiera de nuestras tiendas. Al registrarte, tienes una tarifa de precios mejorada. Además, si es tu primer pedido en la web, puedes usar el código B1ENVEN1DA para un 10% extra de descuento.`;

// Horario comercial estructurado (mismo horario que STORES[0].hours, en texto), para
// poder comprobar por código si ahora mismo hay alguien del equipo disponible o no.
// Minutos desde medianoche, hora de Canarias. Día: 0=domingo ... 6=sábado.
const TIMEZONE = 'Atlantic/Canary';
const BUSINESS_HOURS_RANGES = {
  1: [[540, 810], [990, 1200]], // lunes 9:00-13:30 y 16:30-20:00
  2: [[540, 810], [990, 1200]],
  3: [[540, 810], [990, 1200]],
  4: [[540, 810], [990, 1200]],
  5: [[540, 810], [990, 1200]],
  6: [[570, 810]], // sábado 9:30-13:30
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

const AGENTE_INFO_CERRADO = `Claro, en cuanto abramos (${STORES[0].hours}) un miembro del equipo revisará tu conversación y te atenderá personalmente. Ahora mismo estamos fuera de horario, así que de momento solo puedo seguir ayudándote yo — cuéntame qué necesitas y lo intento.`;

function agenteInfo() {
  return isWithinBusinessHours() ? AGENTE_INFO_ABIERTO : AGENTE_INFO_CERRADO;
}

// Para detectar si un texto ya guardado es "el" mensaje de escalado a persona,
// sin importar si se mandó en horario o fuera de horario.
function isAgenteInfoMessage(text) {
  return text === AGENTE_INFO_ABIERTO || text === AGENTE_INFO_CERRADO;
}

const PEDIDOS_INFO = `Para el seguimiento de tu pedido o cualquier incidencia relacionada, lo mejor es que contactes directamente con el departamento de Pedidos: ${STORES[0].phone} (extensión 2) o pedidos@ofipapelsl.com.`;

const ADMINISTRACION_INFO = `Para temas administrativos (facturas, pagos, cuentas) contacta directamente con Administración: ${STORES[0].phone} (extensión 1) o administracion@ofipapelsl.com.`;

const PLACAS_VV_INFO = `Los pedidos de placas VV (identificación de vivienda vacacional) tardan entre 2 y 4 días en procesarse, dependiendo del volumen de trabajo que haya en producción en ese momento. Si elegiste recogida en tienda, te avisamos por teléfono en cuanto esté lista.`;

const AGENDAS_INFO = `Tenemos muchísimos modelos y diseños de agendas en stock. En la web solo están los modelos más básicos, que se repiten todos los años; el resto no lo subimos porque cada año cambian los diseños y no es viable mantenerlo actualizado. Te invitamos a pasar por nuestra tienda, donde podrás ver en vivo cada uno de los diseños que tenemos disponibles.`;

const COMO_COMPRAR_INFO = `Puedes comprar en https://ofipapel.net: busca el producto por secciones, marcas o con el buscador, añádelo al carrito y ve a "Finalizar Compra" para dejar tus datos y elegir cómo pagar.`;

const PAGO_INFO = `Formas de pago aceptadas: tarjeta de crédito o débito (Visa, MasterCard, 4B, Euro 6000, Maestro, American Express), transferencia bancaria, contra reembolso, o en tienda (solo para recogidas, con el pedido hecho antes por la web).`;

const ENVIOS_GENERAL_INTRO = `Hacemos envíos a toda Canarias. Los pedidos de lunes a viernes antes de las 11:30h se gestionan ese mismo día (después, al día siguiente; los de fin de semana/festivos, el próximo día laborable).`;

// Datos por isla, usados tanto para la regla de FAQ (respuesta dirigida a una isla
// concreta si el cliente la menciona) como para el contexto que recibe la IA.
const ISLAND_SHIPPING = [
  { name: 'Tenerife', keywords: ['tenerife'], freeFrom: 20, feeBelow: 5, delivery: '24-48h' },
  { name: 'La Gomera', keywords: ['gomera'], freeFrom: 200, feeBelow: 15, delivery: '48-72h' },
  { name: 'El Hierro', keywords: ['hierro'], freeFrom: 200, feeBelow: 15, delivery: '48-72h' },
  { name: 'La Palma', keywords: ['la palma', 'palma'], freeFrom: 200, feeBelow: 15, delivery: '48-72h' },
  { name: 'Gran Canaria', keywords: ['gran canaria'], freeFrom: 200, feeBelow: 15, delivery: '48-72h' },
  { name: 'Lanzarote', keywords: ['lanzarote'], freeFrom: 300, feeBelow: 20, delivery: '72h' },
  { name: 'Fuerteventura', keywords: ['fuerteventura'], freeFrom: 300, feeBelow: 20, delivery: '72h' },
];

function islandShippingLine(island) {
  return `A ${island.name} el envío es gratis a partir de ${island.freeFrom}€; si no llegas a esa cantidad se cobran ${island.feeBelow}€ de gastos de envío. El plazo estimado es de ${island.delivery} (en días laborables).`;
}

function findIslandInText(normalizedText) {
  return ISLAND_SHIPPING.find((island) => island.keywords.some((k) => normalizedText.includes(k)));
}

// Respuesta rápida: si el cliente ya menciona una isla, contesta solo sobre esa isla
// (sin soltar la tabla entera); si no la menciona, da el resumen general y pregunta.
function enviosReply(normalizedText) {
  const island = findIslandInText(normalizedText);
  if (island) return `${islandShippingLine(island)} Para artículos muy pesados o voluminosos el porte se calcula aparte, a consultar.`;
  return `${ENVIOS_GENERAL_INTRO} El envío gratis y el plazo cambian según la isla — ¿a cuál te refieres? Así te doy el dato exacto.`;
}

// Versión completa (todas las islas), para el contexto de la IA.
const ENVIOS_INFO = `${ENVIOS_GENERAL_INTRO}\n\n${ISLAND_SHIPPING.map(islandShippingLine).join('\n')}\n\nPara artículos muy pesados o voluminosos, el porte se calcula aparte, a consultar.`;

const DEVOLUCIONES_INFO = `Tienes 14 días naturales desde la entrega para devolver un producto, siempre que esté sin usar, con las etiquetas y en su embalaje original. El reembolso se hace por el mismo medio de pago, en un plazo máximo de 30 días naturales. Los gastos de la devolución los asume el cliente, salvo que el producto tenga algún defecto. Si compraste por la web, también puedes devolver en tienda sin coste. Para iniciar una devolución escribe a pedidos@ofipapelsl.com indicando tus datos, la compra y el motivo. Si el producto llegó dañado o defectuoso, avísanos en las 24h siguientes a la entrega (con fotos) a ese mismo email.`;

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
    keywords: ['horario', 'hora', 'abierto', 'abren', 'cierran', 'cierra'],
    reply: `Nuestros horarios son:\n${storesSummary()}`,
  },
  {
    keywords: ['direccion', 'dirección', 'donde estan', 'donde estáis', 'dónde están', 'dónde estáis', 'ubicacion', 'ubicación', 'mapa', 'como llegar', 'cómo llegar', 'como llego', 'cómo llego'],
    reply: `Estamos en:\n${storesLocationSummary()}`,
  },
  {
    keywords: ['telefono', 'teléfono', 'llamar', 'numero', 'número'],
    reply: `Puedes llamarnos al:\n${storesSummary()}`,
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
    keywords: ['como comprar', 'cómo comprar', 'como hago un pedido', 'cómo hago un pedido', 'hacer un pedido', 'comprar online', 'comprar por internet', 'comprar en la web'],
    reply: COMO_COMPRAR_INFO,
  },
  {
    keywords: ['forma de pago', 'formas de pago', 'metodo de pago', 'método de pago', 'como pagar', 'cómo pagar', 'pago con tarjeta', 'contra reembolso', 'transferencia'],
    reply: PAGO_INFO,
  },
  {
    keywords: ['envio', 'envío', 'envios', 'envíos', 'gastos de envio', 'gastos de envío', 'portes', 'cuando llega', 'cuándo llega', 'plazo de entrega', 'mandan a', 'enviais a', 'enviáis a'],
    reply: enviosReply,
  },
  {
    keywords: ['devolucion', 'devolución', 'devoluciones', 'devolver', 'devuelvo', 'devuelvas', 'cambio de producto', 'cambiar un producto', 'reembolso', 'garantia', 'garantía'],
    reply: DEVOLUCIONES_INFO,
  },
  {
    keywords: [
      'hablar con alguien', 'hablar con una persona', 'hablar con un agente', 'hablar con agente',
      'atencion humana', 'atención humana', 'persona real', 'no me sirve', 'no me ayuda', 'quiero hablar con',
      'queja', 'quejarme', 'poner una queja', 'reclamacion', 'reclamación', 'reclamar', 'denuncia', 'denunciar',
      'estoy harto', 'estoy harta', 'estoy cansado de', 'estoy cansada de', 'mal servicio', 'pesimo', 'pésimo',
      'indignado', 'indignada', 'inaceptable', 'esto es un desastre', 'esto no puede ser', 'estafa',
      'me han estafado', 'me habeis estafado', 'me habéis estafado', 'necesito una solucion', 'necesito una solución',
      'quiero una solucion', 'quiero una solución', 'que solucion me dan', 'qué solución me dan', 'solucion ya',
      'solución ya', 'es urgente', 'muy urgente',
    ],
    reply: agenteInfo,
  },
  {
    keywords: ['presupuesto', 'presupuestos', 'pedir presupuesto', 'solicitar presupuesto', 'necesito un presupuesto', 'quiero un presupuesto', 'hacer un presupuesto'],
    reply: agenteInfo,
  },
  {
    keywords: ['gracias', 'muchas gracias', 'perfecto', 'vale gracias'],
    reply: '¡De nada! Si necesitas cualquier otra cosa aquí estamos. 😊',
  },
  {
    // Al final a propósito: "hola" aparece en muchísimos mensajes que además
    // preguntan otra cosa (p. ej. "Hola, ¿tenéis descuento por registrarme?"), y si
    // esta regla fuera la primera se comería esas preguntas. Solo debe ganar si
    // ninguna regla más específica ha coincidido antes.
    keywords: ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches'],
    reply: GREETING,
  },
];

// Prompt de sistema usado como respaldo cuando ninguna regla de FAQ coincide.
const AI_SYSTEM_PROMPT = `Eres el asistente de atención al cliente por WhatsApp de ${BUSINESS_NAME}, una papelería en Tenerife.

Información del negocio:
${storesSummary()}

Registro de clientes: ${REGISTRO_INFO}

Cómo comprar: ${COMO_COMPRAR_INFO}

Formas de pago: ${PAGO_INFO}

Envíos: ${ENVIOS_INFO}

Placas VV (identificación de vivienda vacacional): ${PLACAS_VV_INFO}

Agendas: ${AGENDAS_INFO}

Devoluciones: ${DEVOLUCIONES_INFO}

Contacto general: teléfono ${STORES[0].phone}, email comercial@ofipapelsl.com (consultas generales) o pedidos@ofipapelsl.com (pedidos y devoluciones).

Instrucciones:
- Responde siempre en español, de forma breve, cercana y natural (máximo 3-4 frases), como lo haría una persona real del equipo escribiendo un WhatsApp, no como un robot leyendo una lista de datos.
- Contesta solo a lo que el cliente ha preguntado. Si la información que tienes cubre varios casos (por ejemplo, varias islas de envío) y el cliente solo pregunta por uno, dale únicamente el dato de ese caso concreto; no le sueltes toda la lista si no la ha pedido.
- Si preguntan por productos o precios concretos que no conoces con certeza, no inventes datos: invita a llamar o visitar la tienda.
- Si preguntan algo concreto sobre un pedido ya hecho (en qué estado está, cuándo llega exactamente, una incidencia, un número de pedido) y no tienes esa información, no inventes nada: indícales que contacten con Pedidos al ${STORES[0].phone} (extensión 2) o pedidos@ofipapelsl.com.
- Si es un tema administrativo (facturas, pagos, cuentas) que no puedas resolver, indícales que contacten con Administración al ${STORES[0].phone} (extensión 1) o administracion@ofipapelsl.com.
- Si el mensaje parece una queja, un pedido complejo, o el cliente muestra que no está satisfecho con tu respuesta, ofrécele amablemente hablar con una persona del equipo y facilita el teléfono directo: ${STORES[0].phone}. Ten en cuenta el horario de tienda (${STORES[0].hours}): si ahora mismo está cerrado, dilo y aclara que la atención personal será cuando abramos, no al instante.
- No uses markdown ni listas largas, escribe como un mensaje de texto normal.`;

module.exports = {
  BUSINESS_NAME,
  STORES,
  GREETING,
  AGENTE_INFO_ABIERTO,
  AGENTE_INFO_CERRADO,
  agenteInfo,
  isAgenteInfoMessage,
  isWithinBusinessHours,
  FAQ_RULES,
  AI_SYSTEM_PROMPT,
};
