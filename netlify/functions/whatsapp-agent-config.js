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
  },
];

function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function storesSummary() {
  return STORES.map(
    (s) => `• ${s.name}: ${s.address} · Horario: ${s.hours} · Tel: ${s.phone}`
  ).join('\n');
}

function storesLocationSummary() {
  return STORES.map(
    (s) => `• ${s.name}: ${s.address}\n  Cómo llegar: ${mapsLink(s.address)}`
  ).join('\n');
}

const GREETING = `¡Hola! 👋 Soy el asistente virtual de ${BUSINESS_NAME}. ¿En qué puedo ayudarte? Puedes preguntarme por horarios, ubicación, teléfono o lo que necesites.`;

const REGISTRO_URL = 'https://ofipapel.net/mi-cuenta/';
const REGISTRO_INFO = `Puedes registrarte aquí: ${REGISTRO_URL}\nEl mismo registro sirve tanto para comprar en la web como en cualquiera de nuestras tiendas. Al registrarte, tienes una tarifa de precios mejorada. Además, si es tu primer pedido en la web, puedes usar el código B1ENVEN1DA para un 10% extra de descuento.`;

const AGENTE_INFO = `Claro, ahora mismo un miembro del equipo revisará tu conversación y te atenderá personalmente. Si es urgente, también puedes llamarnos directamente al ${STORES[0].phone} en horario de tienda (${STORES[0].hours}).`;

const COMO_COMPRAR_INFO = `Puedes comprar en https://ofipapel.net: busca el producto por secciones, marcas o con el buscador, añádelo al carrito y ve a "Finalizar Compra" para dejar tus datos y elegir cómo pagar.`;

const PAGO_INFO = `Formas de pago aceptadas: tarjeta de crédito o débito (Visa, MasterCard, 4B, Euro 6000, Maestro, American Express), transferencia bancaria, contra reembolso, o en tienda (solo para recogidas, con el pedido hecho antes por la web).`;

const ENVIOS_INFO = `Hacemos envíos solo dentro de Canarias. Los pedidos de lunes a viernes antes de las 11:30h se gestionan ese mismo día (después, al día siguiente; los de fin de semana/festivos, el próximo día laborable). Tiempos estimados de entrega: Tenerife, La Gomera, El Hierro y La Palma 24-48h; Gran Canaria 48-72h; Lanzarote y Fuerteventura 72-120h. El envío sale gratis a partir de 20€ en Tenerife (200€ en el resto de islas, 300€ en Lanzarote/Fuerteventura); por debajo de ese importe se cobran unos gastos de gestión.`;

const DEVOLUCIONES_INFO = `Tienes 14 días naturales desde la entrega para devolver un producto, siempre que esté sin usar, con las etiquetas y en su embalaje original. El reembolso se hace por el mismo medio de pago, en un plazo máximo de 30 días naturales. Los gastos de la devolución los asume el cliente, salvo que el producto tenga algún defecto. Si compraste por la web, también puedes devolver en tienda sin coste. Para iniciar una devolución escribe a pedidos@ofipapelsl.com indicando tus datos, la compra y el motivo. Si el producto llegó dañado o defectuoso, avísanos en las 24h siguientes a la entrega (con fotos) a ese mismo email.`;

// Reglas de coincidencia por palabras clave, evaluadas en orden.
// La primera que encuentre una palabra clave en el mensaje gana.
const FAQ_RULES = [
  {
    keywords: ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches'],
    reply: GREETING,
  },
  {
    keywords: ['horario', 'hora', 'abierto', 'abren', 'cierran', 'cierra'],
    reply: `Nuestros horarios son:\n${storesSummary()}`,
  },
  {
    keywords: ['direccion', 'dirección', 'donde estan', 'donde estáis', 'dónde están', 'dónde estáis', 'ubicacion', 'ubicación', 'mapa', 'como llegar', 'cómo llegar'],
    reply: `Estamos en:\n${storesLocationSummary()}`,
  },
  {
    keywords: ['telefono', 'teléfono', 'llamar', 'numero', 'número'],
    reply: `Puedes llamarnos al:\n${storesSummary()}`,
  },
  {
    keywords: ['registrar', 'registro', 'cuenta de cliente', 'abrir cuenta', 'crear cuenta', 'darme de alta', 'alta de cliente', 'como me registro', 'cómo me registro'],
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
    reply: ENVIOS_INFO,
  },
  {
    keywords: ['devolucion', 'devolución', 'devoluciones', 'devolver', 'devuelvo', 'devuelvas', 'cambio de producto', 'cambiar un producto', 'reembolso', 'garantia', 'garantía'],
    reply: DEVOLUCIONES_INFO,
  },
  {
    keywords: ['hablar con alguien', 'hablar con una persona', 'hablar con un agente', 'hablar con agente', 'atencion humana', 'atención humana', 'persona real', 'no me sirve', 'no me ayuda', 'quiero hablar con'],
    reply: AGENTE_INFO,
  },
  {
    keywords: ['gracias', 'muchas gracias', 'perfecto', 'vale gracias'],
    reply: '¡De nada! Si necesitas cualquier otra cosa aquí estamos. 😊',
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

Devoluciones: ${DEVOLUCIONES_INFO}

Contacto general: teléfono ${STORES[0].phone}, email comercial@ofipapelsl.com (consultas generales) o pedidos@ofipapelsl.com (pedidos y devoluciones).

Instrucciones:
- Responde siempre en español, de forma breve, cercana y natural (máximo 3-4 frases), como en un chat de WhatsApp real.
- Si preguntan por productos o precios concretos que no conoces con certeza, no inventes datos: invita a llamar o visitar la tienda.
- Si el mensaje parece una queja, un pedido complejo, o el cliente muestra que no está satisfecho con tu respuesta, ofrécele amablemente hablar con una persona del equipo y facilita el teléfono directo: ${STORES[0].phone}.
- No uses markdown ni listas largas, escribe como un mensaje de texto normal.`;

module.exports = {
  BUSINESS_NAME,
  STORES,
  GREETING,
  FAQ_RULES,
  AI_SYSTEM_PROMPT,
};
