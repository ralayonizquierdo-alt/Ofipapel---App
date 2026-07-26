// Configuración de Editorial Design Engine — tablas de decisión, sin
// lógica (mismo criterio que asset-pipeline/config.js). Cada tabla
// mapea un patrón editorial ya elegido por Art Direction Engine
// (art-direction-engine/patterns.js) a un recurso expresivo concreto —
// nunca coordenadas, nunca vuelve a decidir el patrón en sí.

// Alineaciones que rompen la simetría — mismo vocabulario que
// patterns.js#alignment, reutilizado aquí, no redeclarado con otro
// nombre.
const BREAK_SYMMETRY_ALIGNMENTS = ['asymmetric-left', 'asymmetric-right'];

// Hacia qué zona del lienzo se desplaza el peso visual cuando se rompe
// la simetría — usado por Composition Engine para decidir el offset del
// apilado y por Component Library para orientar la cinta/banda de color.
const TENSION_ZONE_BY_ALIGNMENT = {
  center: 'center',
  'asymmetric-left': 'top-left',
  'asymmetric-right': 'top-right',
};

// Patrones donde el título puede invadir ligeramente el borde de la foto
// — un recurso real de publicidad premium (Nike, carteles, editorial),
// nunca en piezas de catálogo/retail (framed-minimal) donde la claridad
// prima sobre el dramatismo. `maxOverlapRatio` es la fracción del área
// del título que puede quedar dentro del área del hero antes de que
// Design Director lo penalice como desorden en vez de como recurso.
const OVERLAP_ALLOWANCE_PATTERNS = ['nike-style', 'poster-design', 'asymmetric-editorial', 'magazine-editorial', 'mediamarkt-editorial'];
const TITLE_HERO_MAX_OVERLAP_RATIO = 0.12;

// Patrones donde el producto puede "invadir el lienzo" — el hero
// desborda el margen estructural por un lado, en vez de quedar
// perfectamente contenido. Reservado a patrones de alto impacto donde
// ese desbordamiento es survivorship real de publicidad (nunca en
// catálogo/lujo, donde el orden es el mensaje).
const BLEED_PATTERNS = ['nike-style', 'poster-design', 'hero-product', 'product-first', 'amazon-premium', 'mediamarkt-editorial'];

// Patrones que admiten una banda de color deliberada (bloque sólido de
// acento a un borde) como recurso editorial — no decoración porque sí,
// solo donde el patrón ya tiene una identidad gráfica que la pide
// (retail agresivo, editorial asimétrico, cartel).
const COLOR_BAND_PATTERNS = ['poster-design', 'asymmetric-editorial', 'amazon-premium', 'mediamarkt-editorial'];
const COLOR_BAND_WIDTH_RATIO = 0.16;

module.exports = {
  BREAK_SYMMETRY_ALIGNMENTS, TENSION_ZONE_BY_ALIGNMENT,
  OVERLAP_ALLOWANCE_PATTERNS, TITLE_HERO_MAX_OVERLAP_RATIO,
  BLEED_PATTERNS, COLOR_BAND_PATTERNS, COLOR_BAND_WIDTH_RATIO,
};
