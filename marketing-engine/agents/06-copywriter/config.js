// Plantillas de texto por defecto, parametrizadas por tono/canal. Mismo
// espíritu que design-studio/campaigns/vuelta-al-cole-2026/COPY.md (título,
// CTA por contexto, hashtags), pero generado por reglas, no copiado de una
// campaña concreta.

const CTA_BY_CHANNEL = {
  whatsapp: 'Escríbenos por WhatsApp',
  instagram: 'Míralo en tienda',
  facebook: 'Más información',
  ambas: 'Descúbrelo en Ofipapel',
};

const BRAND_HASHTAGS = {
  ofipapel: ['#ofipapel', '#loscristianos', '#tenerife'],
  'canarias-ink': ['#canariasink', '#tenerife'],
  falcontrol: ['#falcontrol'],
};

module.exports = { CTA_BY_CHANNEL, BRAND_HASHTAGS };
