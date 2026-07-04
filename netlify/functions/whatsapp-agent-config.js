// Datos del negocio y reglas de respuesta rápida para el agente de WhatsApp de Ofipapel.
// Edita este archivo (sin tocar whatsapp-webhook.js) para actualizar horarios,
// direcciones, teléfonos o añadir nuevas preguntas frecuentes.

const BUSINESS_NAME = 'Ofipapel';

// TODO: sustituye estos datos por los reales de cada tienda antes de publicar.
const STORES = [
  {
    name: 'Los Cristianos',
    address: 'TODO: dirección exacta de la tienda de Los Cristianos',
    hours: 'Lunes a viernes 9:00-13:30 y 16:30-20:00, sábados 9:30-13:30',
    phone: '643 31 66 14',
  },
  {
    name: 'Playa de las Américas',
    address: 'TODO: dirección exacta de la tienda de Playa de las Américas',
    hours: 'Lunes a viernes 9:00-13:30 y 16:30-20:00, sábados 9:30-13:30',
    phone: 'TODO: teléfono fijo de la tienda',
  },
];

function storesSummary() {
  return STORES.map(
    (s) => `• ${s.name}: ${s.address} · Horario: ${s.hours} · Tel: ${s.phone}`
  ).join('\n');
}

const GREETING = `¡Hola! 👋 Soy el asistente virtual de ${BUSINESS_NAME}. ¿En qué puedo ayudarte? Puedes preguntarme por horarios, ubicación, teléfono o lo que necesites.`;

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
    keywords: ['direccion', 'dirección', 'donde estan', 'dónde están', 'ubicacion', 'ubicación', 'mapa', 'como llegar', 'cómo llegar'],
    reply: `Estas son nuestras tiendas:\n${storesSummary()}`,
  },
  {
    keywords: ['telefono', 'teléfono', 'llamar', 'numero', 'número'],
    reply: `Puedes llamarnos a:\n${storesSummary()}`,
  },
  {
    keywords: ['gracias', 'muchas gracias', 'perfecto', 'vale gracias'],
    reply: '¡De nada! Si necesitas cualquier otra cosa aquí estamos. 😊',
  },
];

// Prompt de sistema usado como respaldo cuando ninguna regla de FAQ coincide.
const AI_SYSTEM_PROMPT = `Eres el asistente de atención al cliente por WhatsApp de ${BUSINESS_NAME}, una papelería con tiendas físicas en Tenerife.

Información del negocio:
${storesSummary()}

Instrucciones:
- Responde siempre en español, de forma breve, cercana y natural (máximo 3-4 frases), como en un chat de WhatsApp real.
- Si preguntan por productos o precios concretos que no conoces con certeza, no inventes datos: invita a llamar o visitar la tienda.
- Si el mensaje parece una queja, un pedido complejo o requiere atención personalizada, indica amablemente que un miembro del equipo le atenderá en breve.
- No uses markdown ni listas largas, escribe como un mensaje de texto normal.`;

module.exports = {
  BUSINESS_NAME,
  STORES,
  GREETING,
  FAQ_RULES,
  AI_SYSTEM_PROMPT,
};
