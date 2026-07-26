// Prompt Composer Cinematográfico — reescritura completa (sprint
// "Prompt Composer Cinematográfico", 2026-07-26). El prompt deja de
// describir el producto primero y pasa a describir la campaña primero:
// el orden es exactamente el pedido por el propietario — historia y
// emoción abren el briefing, la ficha técnica de foto/producto queda
// dentro de "Dirección de fotografía" (4º bloque, no el primero).
//
// Ya NO se llama a creative-engine/prompt-composer/ (el compositor base
// de 9 secciones) — este módulo compone su propio prompt completo de
// principio a fin. No se ha modificado ningún otro componente: solo se
// REUTILIZAN por import de solo lectura NEGATIVE_PROMPT_TERMS y
// SECTION_JOIN del compositor base (evita duplicar esa lista), y
// getEntryByField de libraries/index.js (sin tocar ninguno de los dos
// ficheros).

const { NEGATIVE_PROMPT_TERMS: BASE_NEGATIVE_TERMS, SECTION_JOIN } = require('../../prompt-composer/config.js');

// Los 12 bloques obligatorios que van en el cuerpo del prompt (el 13º,
// negative prompt, es un campo aparte — mismo criterio que el
// compositor base). Orden = exactamente el orden pedido por el
// propietario: historia/emoción abren, ficha técnica de foto queda en
// medio, espacio de texto cierra.
const SECTION_ORDER = [
  'story', 'emotion', 'art-direction', 'cinematography', 'lighting',
  'lens-angle', 'composition', 'depth-of-field', 'textures', 'materials',
  'ambiance', 'copy',
];

// Términos negativos propios de un briefing de agencia — se AÑADEN a los
// 5 ya existentes del compositor base (no se modifica esa lista, se
// concatena aquí).
const CINEMATIC_NEGATIVE_TERMS = [
  'iluminación plana sin dirección',
  'composición amateur o descentrada sin intención',
  'aspecto de foto de stock genérica',
  'baja resolución o artefactos de compresión',
  'perspectiva distorsionada de forma no intencional',
];

const NEGATIVE_PROMPT_TERMS = [...BASE_NEGATIVE_TERMS, ...CINEMATIC_NEGATIVE_TERMS];

// Profundidad de campo — derivada del ángulo/lente del concepto (12
// entradas, una por cada id real de libraries/angles-lenses.js; cobertura
// completa, sin necesidad de valor por defecto).
const DEPTH_OF_FIELD_BY_ANGLE_LENS = {
  'frontal-centrado': 'profundidad de campo media, producto completamente nítido, fondo con desenfoque suave y controlado',
  'tres-cuartos': 'profundidad de campo media-baja, producto nítido en primer plano, fondo con desenfoque progresivo',
  'cenital-flat-lay': 'profundidad de campo amplia, todos los elementos del plano nítidos por igual',
  'contrapicado-heroico': 'profundidad de campo baja, producto marcadamente nítido contra un fondo muy desenfocado, refuerza la monumentalidad',
  'picado-dominante': 'profundidad de campo media, plano de conjunto ligeramente comprimido',
  'macro-detalle': 'profundidad de campo mínima, solo el detalle exacto en foco, el resto se disuelve en desenfoque',
  'gran-angular': 'profundidad de campo muy amplia, producto y entorno completamente nítidos',
  'teleobjetivo-comprimido': 'profundidad de campo extremadamente baja, bokeh marcado, fondo reducido a manchas de color',
  'ojo-de-pez': 'profundidad de campo amplia con distorsión de barril, todo el encuadre en foco',
  'perfil-lateral': 'profundidad de campo media, silueta del producto perfectamente definida',
  'dutch-angle-editorial': 'profundidad de campo media-baja, tensión visual reforzada por el desenfoque direccional',
  'altura-producto': 'profundidad de campo media, mirada neutra con el producto en foco absoluto',
};

// Texturas — derivadas de la dirección artística (10 entradas, cobertura
// completa de libraries/art-directions.js).
const TEXTURES_BY_ART_DIRECTION = {
  minimalismo: 'texturas lisas y limpias, superficies sin ruido visual',
  maximalismo: 'texturas ricas y superpuestas, múltiples capas táctiles conviviendo',
  brutalismo: 'texturas crudas y ásperas, hormigón visto, metal sin pulir',
  organico: 'texturas naturales e irregulares: fibra, veta de madera, piedra porosa',
  'corporativo-clasico': 'texturas neutras y uniformes, acabados mate controlados',
  'experimental-conceptual': 'texturas inesperadas, contraste deliberado entre lo suave y lo áspero',
  'nostalgico-retro': 'texturas con grano sutil, ligera pátina de otra época',
  futurista: 'texturas lisas de alta tecnología, superficies casi sin fricción visual',
  'artesanal-honesto': 'texturas imperfectas y táctiles, marcas visibles del proceso hecho a mano',
  'lujo-discreto': 'texturas premium sutiles: satinado, cepillado, sin ostentación',
};

// Materiales — derivados del escenario (14 entradas, cobertura completa
// de libraries/scenarios.js). Eje distinto de "texturas": aquí es QUÉ
// materiales físicos aparecen en el entorno, no cómo se sienten.
const MATERIALS_BY_SCENARIO = {
  'estudio-fondo-blanco': 'superficie mate blanca sin textura visible, ausencia deliberada de otros materiales',
  'estudio-fondo-color-marca': 'fondo de papel o vinilo en color sólido, acabado uniforme',
  'cocina-domestica': 'encimera de madera o piedra, cerámica, acero inoxidable',
  'salon-hogar': 'tapicería textil, madera cálida, elementos decorativos cotidianos',
  'terraza-exterior': 'madera de exterior, piedra natural, vegetación real',
  'escritorio-oficina': 'madera clara o metal de oficina, papel, elementos de trabajo',
  'en-uso-manos': 'piel humana real, el material propio del producto en contacto directo',
  'contexto-urbano': 'asfalto, hormigón urbano, cristal de escaparate',
  'naturaleza-exterior': 'tierra, hojas, piedra natural, agua',
  'superficie-textil': 'lino, algodón crudo, lana natural',
  'superficie-piedra-marmol': 'mármol pulido, veta natural visible, superficie reflectante',
  'flotando-sin-escenario': 'ninguno más allá del propio producto, fondo neutro sin textura',
  'punto-de-venta': 'estantería, cartón de packaging, elementos de tienda real',
  'exterior-canario-mediterraneo': 'piedra volcánica, madera envejecida por el sol, vegetación mediterránea',
};

module.exports = {
  SECTION_ORDER,
  SECTION_JOIN,
  NEGATIVE_PROMPT_TERMS,
  DEPTH_OF_FIELD_BY_ANGLE_LENS,
  TEXTURES_BY_ART_DIRECTION,
  MATERIALS_BY_SCENARIO,
};
