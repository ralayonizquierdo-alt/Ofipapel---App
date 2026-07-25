// Tablas de datos del Product Intelligence — sin lógica, solo criterio
// tabulado. Editar aquí para afinar el análisis sin tocar service.js.
//
// Tres reglas de contenido, para que este fichero no se convierta en el
// mismo error que ya documentó .claude/rax/DECISIONES.md (2026-07-10):
// identidad/datos de negocio inventados de memoria en vez de verificados.
//
// 1. `ticket` es una BANDA cualitativa (bajo/medio/alto) + un booleano de
//    compra impulsiva, nunca un importe en euros. Este repo no contiene
//    ningún dato real de precios de Ofipapel — inventar "25-60€" sería
//    fabricar un hecho de negocio. Punto de enganche futuro: sustituir por
//    el ticket medio REAL cuando se conecten los datos de ventas de
//    Index.html/Supabase.
// 2. `complementary` lista TIPOS de producto, nunca referencias/SKUs — el
//    repo no contiene un catálogo de productos de Ofipapel.
// 3. `emotions` y `strategyAffinity` usan el vocabulario YA EXISTENTE en
//    marketing-engine/knowledge/ (las emociones de cada patrón en
//    campaign-strategies.md, los 4 modos de creative-playbook.md) — son
//    claves de enlace hacia ese conocimiento, no contenido nuevo inventado
//    aquí. Si knowledge/ cambia una emoción o un nombre de estrategia,
//    este fichero debe seguirlo, no divergir.
//
// Claves de categoría: `electrodomesticos`, `papeleria`, `oferta` y
// `default` son EXACTAMENTE las mismas 4 claves que
// agents/01-director-creativo/config.js → CATEGORY_RULES (y las mismas 4
// opciones del <select> de categoría en app.html) — a propósito, para que
// una categoría nunca resuelva en un módulo y falle en el otro. Las otras
// 3 (`consumibles-impresion`, `informatica`, `hogar`) son extensiones
// justificadas por evidencia real del repo (ver comentario en cada una) y
// hoy solo son alcanzables desde el CLI — app.html no las puede enviar
// todavía porque su <select> no las incluye.

const PRODUCT_CATEGORY_PROFILES = {
  electrodomesticos: {
    label: 'Electrodomésticos',
    benefits: [
      'ahorra tiempo o esfuerzo en una tarea del día a día',
      'mejora el confort del hogar de forma inmediata',
      'bajo mantenimiento una vez instalado',
    ],
    objections: [
      { objection: 'Consume mucha electricidad', answeredBy: ['consumo', 'eficiente', 'ahorro', 'w', 'watt'] },
      { objection: 'Ocupa mucho espacio', answeredBy: ['compacto', 'tamaño', 'ligero'] },
      { objection: 'No sé si es de calidad o dura', answeredBy: ['garantía', 'calidad', 'resistente'] },
    ],
    audience: {
      segment: 'particular-hogar',
      role: 'quien compra y usa el producto',
      buyingContext: 'necesidad estacional o sustitución de un aparato',
      decisionDriver: 'utilidad inmediata y precio',
    },
    seasonalEventIds: ['verano-canario', 'rebajas-verano', 'black-friday'],
    seasonalityNoteDefault: 'Sin evento estacional activo — categoría de reposición todo el año.',
    ticket: { band: 'medio', impulseBuy: false, note: 'Compra pensada, no impulsiva — suele comparar antes.' },
    complementary: ['accesorios de repuesto', 'filtros', 'alargadores y regletas'],
    emotions: ['alivio', 'bienestar'],
    salesArguments: ['resuelve una molestia concreta del día a día', 'fácil de usar desde el primer momento'],
    strategyAffinity: ['Problema → Solución', 'Lifestyle', 'Producto Hero', 'Black Friday'],
    keywordHints: ['ventilador', 'nebulizador', 'calefactor', 'microondas', 'plancha', 'aspiradora', 'freidora', 'batidora'],
  },

  papeleria: {
    label: 'Papelería',
    benefits: [
      'imprescindible para el día a día de estudio u oficina',
      'buena relación calidad-precio para uso frecuente',
      'disponible ya, en tienda de barrio, sin esperar un pedido',
    ],
    objections: [
      { objection: 'Lo puedo pedir más barato online', answeredBy: ['tienda', 'hoy mismo', 'sin esperar', 'local'] },
      { objection: 'No sé si tienen justo lo que necesito', answeredBy: ['variedad', 'surtido', 'todo lo necesario'] },
    ],
    audience: {
      segment: 'familias y estudiantes / oficinas locales',
      role: 'quien decide la compra (a menudo distinto de quien la usa)',
      buyingContext: 'reposición periódica o lista de material',
      decisionDriver: 'comodidad y confianza en el negocio local',
    },
    seasonalEventIds: ['vuelta-al-cole'],
    seasonalityNoteDefault: 'Categoría de reposición constante — pico claro solo en vuelta al cole.',
    ticket: { band: 'bajo', impulseBuy: true, note: 'Ticket bajo, a menudo compra por impulso o necesidad inmediata.' },
    complementary: ['mochilas', 'estuches', 'material de oficina'],
    emotions: ['alivio de la logística', 'confianza'],
    salesArguments: ['todo lo de la lista en un mismo sitio', 'trato cercano y de barrio'],
    strategyAffinity: ['Vuelta al Cole', 'Top Ventas / Más vendido', 'Hogar'],
    keywordHints: ['cuaderno', 'bolígrafo', 'mochila', 'folio', 'carpeta', 'rotulador', 'agenda', 'estuche'],
  },

  // No es una familia de producto, es una SITUACIÓN comercial — por eso su
  // perfil está pensado como modificador (urgencia/FOMO, sin categoría de
  // producto propia) más que como una categoría de producto en sí misma.
  oferta: {
    label: 'Oferta',
    benefits: ['precio reducido por tiempo limitado', 'oportunidad de ahorro real y verificable'],
    objections: [
      { objection: '¿Es un descuento real o inflado antes de bajarlo?', answeredBy: ['antes', 'ahora', 'precio original', 'real'] },
      { objection: '¿Hasta cuándo dura la oferta?', answeredBy: ['hasta', 'solo', 'fecha', 'últimas'] },
    ],
    audience: {
      segment: 'quien ya conoce o busca activamente el producto',
      role: 'comprador sensible al precio',
      buyingContext: 'decisión acelerada por la oferta, no por una necesidad nueva',
      decisionDriver: 'urgencia y percepción de ahorro',
    },
    seasonalEventIds: ['black-friday', 'rebajas-invierno', 'rebajas-verano'],
    seasonalityNoteDefault: 'Activada por decisión comercial (stock, liquidación), no por calendario fijo.',
    ticket: { band: 'medio', impulseBuy: true, note: 'La urgencia empuja a la compra impulsiva incluso en ticket medio.' },
    complementary: [],
    emotions: ['urgencia', 'FOMO'],
    salesArguments: ['ahorro cuantificable', 'disponibilidad limitada'],
    strategyAffinity: ['Black Friday', 'Oferta Flash', 'Top Ventas / Más vendido'],
    keywordHints: ['oferta', 'rebaja', 'descuento', 'liquidación', 'promoción'],
  },

  default: {
    label: 'Otra / sin especificar',
    benefits: ['resuelve una necesidad concreta del cliente'],
    objections: [
      { objection: 'No conozco esta marca o este producto', answeredBy: ['calidad', 'garantía', 'confianza'] },
    ],
    audience: {
      segment: 'público general del negocio',
      role: 'comprador particular',
      buyingContext: 'variable — sin señal de categoría',
      decisionDriver: 'relación calidad-precio y confianza en el negocio',
    },
    seasonalEventIds: [],
    seasonalityNoteDefault: 'Categoría no especificada — sin estacionalidad conocida.',
    ticket: { band: 'medio', impulseBuy: false, note: 'Sin datos suficientes para afinar — banda neutra por defecto.' },
    complementary: [],
    emotions: ['confianza'],
    salesArguments: ['buena relación calidad-precio'],
    strategyAffinity: ['Producto Hero'],
    keywordHints: [],
  },

  // Extensión con evidencia real: canarias-ink.html tiene un catálogo real
  // verificado (toner ×975, inkjet ×861, etiqueta ×64, botella ×56,
  // cinta ×43, ribbon ×2) — es la única categoría de esta tabla respaldada
  // por un catálogo real de producto en el repo.
  'consumibles-impresion': {
    label: 'Consumibles de impresión',
    benefits: [
      'compatibilidad garantizada con el modelo de impresora',
      'rendimiento de páginas competitivo frente al original',
      'disponibilidad inmediata sin esperar un pedido',
    ],
    objections: [
      { objection: '¿Es compatible con mi impresora?', answeredBy: ['compatible', 'modelo', 'referencia'] },
      { objection: '¿Rinde tanto como el original?', answeredBy: ['rendimiento', 'páginas', 'calidad'] },
    ],
    audience: {
      segment: 'particulares y oficinas con impresora en uso',
      role: 'quien gestiona el consumible cuando se agota',
      buyingContext: 'reposición reactiva (se ha acabado) o preventiva',
      decisionDriver: 'compatibilidad exacta y precio frente al original',
    },
    seasonalEventIds: [],
    seasonalityNoteDefault: 'Reposición constante — el disparador es el consumo real, no el calendario.',
    ticket: { band: 'bajo', impulseBuy: false, note: 'Compra reactiva de reposición — decide por compatibilidad, no por deseo.' },
    complementary: ['papel de impresión', 'otros consumibles del mismo modelo (p. ej. tricolor + negro)'],
    emotions: ['confianza técnica', 'alivio'],
    salesArguments: ['compatibilidad verificada con el modelo exacto', 'alternativa fiable al cartucho original'],
    strategyAffinity: ['Informática', 'Comparativa', 'Top Ventas / Más vendido'],
    keywordHints: ['toner', 'tóner', 'tinta', 'cartucho', 'inkjet', 'ribbon', 'etiqueta', 'impresora'],
  },

  // Extensión con criterio ya escrito en knowledge/campaign-strategies.md
  // §13 — no se redescribe aquí, solo se referencia (strategyAffinity).
  informatica: {
    label: 'Informática',
    benefits: ['mejora el rendimiento para la tarea concreta que lo necesita', 'especificaciones claras y verificables'],
    objections: [
      { objection: '¿Es compatible con lo que ya tengo?', answeredBy: ['compatible', 'conector', 'requisitos'] },
      { objection: '¿Vale la pena frente a otra opción similar?', answeredBy: ['comparado', 'frente a', 'rendimiento'] },
    ],
    audience: {
      segment: 'particular o profesional que compra por especificación',
      role: 'usuario técnico o semi-técnico',
      buyingContext: 'necesidad concreta de rendimiento o sustitución',
      decisionDriver: 'datos técnicos verificables, no estética',
    },
    seasonalEventIds: ['black-friday'],
    seasonalityNoteDefault: 'Sin estacionalidad marcada fuera de campañas comerciales generales.',
    ticket: { band: 'alto', impulseBuy: false, note: 'Ticket más alto que la media del catálogo — compra reflexiva.' },
    complementary: ['periféricos', 'cables y adaptadores', 'software o licencias'],
    emotions: ['confianza técnica'],
    salesArguments: ['ficha técnica clara', 'soporte y garantía'],
    strategyAffinity: ['Informática', 'Gaming', 'Comparativa'],
    keywordHints: ['ordenador', 'portátil', 'monitor', 'teclado', 'ratón', 'disco', 'memoria', 'router'],
  },

  // Extensión con criterio ya escrito en knowledge/campaign-strategies.md
  // §12 — idem, solo referenciado.
  hogar: {
    label: 'Hogar',
    benefits: ['mejora un momento concreto del día a día en casa', 'fácil de integrar sin obra ni instalación compleja'],
    objections: [
      { objection: '¿Encaja con lo que ya tengo en casa?', answeredBy: ['estilo', 'tamaño', 'encaja'] },
      { objection: '¿Merece la pena el gasto para algo no esencial?', answeredBy: ['comodidad', 'bienestar', 'merece la pena'] },
    ],
    audience: {
      segment: 'particular-hogar',
      role: 'quien decide sobre el propio espacio doméstico',
      buyingContext: 'mejora voluntaria del hogar, no urgencia',
      decisionDriver: 'bienestar percibido y encaje estético o funcional',
    },
    seasonalEventIds: ['verano-canario', 'navidad', 'black-friday'],
    seasonalityNoteDefault: 'Categoría amplia, sin pico único — varía según el producto concreto.',
    ticket: { band: 'medio', impulseBuy: true, note: 'Puede ser impulsiva cuando el gancho emocional es fuerte.' },
    complementary: ['accesorios de decoración u organización'],
    emotions: ['bienestar', 'comodidad'],
    salesArguments: ['mejora tangible de la comodidad diaria'],
    strategyAffinity: ['Hogar', 'Lifestyle', 'Black Friday'],
    keywordHints: ['organizador', 'decoración', 'textil', 'iluminación', 'almacenaje'],
  },
};

// El motor de estacionalidad que knowledge/ no tiene (los 5 docs mencionan
// fechas como Black Friday/Navidad/Vuelta al Cole dentro de la prosa de
// cada estrategia, pero ninguno calcula "qué está activo hoy"). Rangos en
// MM-DD, comparados contra la fecha efectiva (product-intelligence/service.js).
// `strategy` es SIEMPRE un nombre exacto de knowledge/campaign-strategies.md.
const COMMERCIAL_CALENDAR = [
  { id: 'vuelta-al-cole', from: '08-15', to: '09-20', strategy: 'Vuelta al Cole', urgency: 'media' },
  { id: 'black-friday', from: '11-20', to: '11-30', strategy: 'Black Friday', urgency: 'maxima' },
  { id: 'navidad', from: '12-01', to: '12-31', strategy: 'Navidad', urgency: 'baja' },
  { id: 'rebajas-invierno', from: '01-07', to: '01-31', strategy: 'Oferta Flash', urgency: 'alta' },
  { id: 'rebajas-verano', from: '07-01', to: '07-31', strategy: 'Oferta Flash', urgency: 'alta' },
  // Más largo que el verano peninsular — respaldado por el propio brief de
  // ejemplo del repo (campaigns-input/ejemplo-producto-generico.json:
  // "ideal para el verano en Tenerife") y por el enfoque local que
  // documenta knowledge/README.md.
  { id: 'verano-canario', from: '06-01', to: '10-15', strategy: 'Lifestyle', urgency: 'baja' },
];

// Umbral de similitud (0-1, coincidencias de keywordHints / palabras del
// texto) por encima del cual analyzeProduct() usa un perfil de categoría
// distinto de `default` cuando el usuario elige "Otra". Por debajo, se
// queda en `default` reportando resolvedVia:'fallback'.
const KEYWORD_MATCH_THRESHOLD = 0.15;

module.exports = { PRODUCT_CATEGORY_PROFILES, COMMERCIAL_CALENDAR, KEYWORD_MATCH_THRESHOLD };
