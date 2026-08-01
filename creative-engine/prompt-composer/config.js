// Orden de las secciones y términos negativos estáticos del Prompt
// Composer. El orden importa: los modelos de difusión pesan más los
// primeros tokens — el producto va primero siempre, el formato técnico
// va último siempre, y las dos secciones de ESTRATEGIA (inteligencia de
// producto, campaña) van después del lenguaje puramente visual
// (fotografía, dirección de arte, marca) para no diluirlo con
// vocabulario de negocio que un modelo de imagen no sabe interpretar.
const SECTION_ORDER = [
  'product',
  'creative-direction',
  'photography',
  'art-direction',
  'brand',
  'product-intelligence',
  'campaign',
  'copy',
  'format',
];

// Estáticos, no dependen del brief. Incluye explícitamente "sin texto
// renderizado" — coherente con el principio de composición posterior
// (ver sections/copy.js y ARCHITECTURE.md): creative-engine genera
// imagen/fondo con espacio negativo, el texto y el logo se componen
// después, igual que ya hace 07-maquetador con HTML→PNG en marketing-engine.
const NEGATIVE_PROMPT_TERMS = [
  'texto renderizado o letras ilegibles',
  'logotipos adicionales o marcas de agua no solicitadas',
  'producto deformado o con proporciones incorrectas',
  'colores fuera de la paleta de marca',
  'composición sobrecargada sin espacio negativo',
];

const SECTION_JOIN = '. ';

module.exports = { SECTION_ORDER, NEGATIVE_PROMPT_TERMS, SECTION_JOIN };
