// Tablas de recomendación. Ninguna reglas aquí duplica
// agents/01-director-creativo/config.js → CATEGORY_RULES: ese fichero
// decide por categoría directamente; estas tablas operan sobre las señales
// MÁS RICAS que produce product-intelligence/ (estacionalidad activa,
// banda de ticket, público, afinidad de estrategia) — un nivel de
// abstracción distinto, no una reescritura del mismo criterio.

// "Formato recomendado" de cada una de las 15 estrategias de
// knowledge/campaign-strategies.md — primera opción listada cuando el
// documento da más de una. Es una TABLA DE CONSULTA hacia ese documento,
// no una redescripción: si knowledge/ cambia el formato recomendado de una
// estrategia, esta tabla debe seguirlo.
const FORMAT_BY_STRATEGY = {
  'Problema → Solución': 'carrusel',
  Lifestyle: 'foto',
  'Producto Hero': 'foto',
  'Black Friday': 'foto',
  'Vuelta al Cole': 'carrusel',
  Navidad: 'reel',
  'Oferta Flash': 'foto',
  Novedad: 'carrusel',
  Comparativa: 'carrusel',
  'Top Ventas / Más vendido': 'foto',
  'Empresas (B2B)': 'foto',
  Hogar: 'foto',
  Informática: 'foto',
  Gaming: 'reel',
  'Eco / Sostenibilidad': 'foto',
};

// Estilo/tono breve por objetivo — mismo vocabulario de los 4 modos de
// knowledge/creative-playbook.md §2, redeclarado aquí (no importado de
// agents/01-director-creativo/config.js → OBJECTIVE_TONE_MAP) por el mismo
// motivo que contracts.js redeclara los enumOf: cada capa es responsable
// de su propia forma aunque el vocabulario de base coincida.
const STYLE_BY_OBJECTIVE = {
  vender: 'directo y persuasivo, con urgencia clara',
  emocionar: 'cercano y emocional, construye relación antes que vender',
  sorprender: 'sorprendente, rompe el patrón habitual del feed',
  minimalista: 'sobrio y preciso, sin adjetivos vacíos',
};

// Ejemplos de CTA por objetivo — knowledge/copywriting-playbook.md §4
// (tipos de CTA por objetivo). Son EJEMPLOS orientativos en
// recommendation.cta, no la plantilla fija que ya usa
// agents/06-copywriter/config.js → CTA_BY_CHANNEL (ese sigue siendo quien
// decide el texto final del copy).
const CTA_BY_OBJECTIVE = {
  vender: 'Directo a la compra, con urgencia clara (p. ej. "Cómpralo ahora", "Solo mientras queden unidades").',
  emocionar: 'Suave, casi opcional — o ausente si la pieza es puramente de marca (p. ej. "Así de bien queda en tu día a día").',
  sorprender: 'De bajo compromiso, invita a descubrir (p. ej. "Descúbrelo").',
  minimalista: 'Informativo, orientado a resolver dudas técnicas (p. ej. "¿Dudas de compatibilidad? Pregúntanos").',
};

// Heurística genérica de mejor horario por canal — NINGÚN documento de
// knowledge/ da horas concretas (social-media-playbook.md solo habla de
// comportamiento por canal, no de franjas horarias). Es la única tabla de
// todo intelligence/ sin respaldo en knowledge/ ni en datos reales — y por
// eso es la primera que learning-engine/ debe sustituir en cuanto haya
// suficientes resultados reales (ver ROADMAP_V2.md, Fase 3). Hora local de
// Canarias, coherente con el resto del proyecto (Ofipapel es un negocio de
// Tenerife).
const POSTING_WINDOWS = {
  instagram: { window: 'martes a jueves, 19:00–21:00 (hora Canarias)', note: 'fuera de horario laboral, cuando el público navega por ocio' },
  facebook: { window: 'miércoles a viernes, 12:00–14:00 (hora Canarias)', note: 'franja de descanso/comida, cuando este público navega con más calma' },
  whatsapp: { window: 'días laborables, 10:00–12:00 (hora Canarias)', note: 'horario comercial — canal de conversión directa, no depende de "hora de scroll"' },
  ambas: { window: 'martes a jueves, 19:00–21:00 (hora Canarias)', note: 'se usa la ventana de Instagram como referencia principal al publicar en ambos canales' },
};

// Nº de variantes a proponer, por banda de ticket. Ticket bajo/impulsivo:
// pocas variantes, decisión rápida. Ticket medio: más ángulos posibles
// (lifestyle/oferta/problema-solución conviven bien). Ticket alto/técnico:
// mensaje más deliberado, menos variantes pero más trabajadas.
const VARIANT_COUNT_BY_TICKET = { bajo: 2, medio: 3, alto: 2 };

module.exports = { FORMAT_BY_STRATEGY, STYLE_BY_OBJECTIVE, CTA_BY_OBJECTIVE, POSTING_WINDOWS, VARIANT_COUNT_BY_TICKET };
