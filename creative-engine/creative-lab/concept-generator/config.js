// Configuración del Generador de Conceptos. CONCEPT_COUNT_MIN/MAX = "entre
// 8 y 12 conceptos" pedido explícitamente. REFERENCES_PER_CONCEPT = cuántas
// entradas de la Biblioteca de Referencias se mezclan por concepto (nunca
// una sola — esa es la norma obligatoria de "no copiar").

const CONCEPT_COUNT_MIN = 8;
const CONCEPT_COUNT_MAX = 12;
const CONCEPT_COUNT_DEFAULT = 10;
const REFERENCES_PER_CONCEPT = 3;

// Los 8 campos de brief-por-referencia que se mezclan combinatoriamente.
// Mismos nombres que reference-library/schema.js.
const ATOMIC_DIMENSIONS = [
  'styleId', 'compositionId', 'artDirectionId', 'lightingId',
  'scenarioId', 'paletteHarmonyId', 'angleLensId', 'textSpaceId',
];

// Campo -> biblioteca atómica: reutiliza el mapa canónico de
// libraries/index.js (ver comentario ahí — evita una tercera copia).
const { FIELD_TO_DIMENSION: DIMENSION_TO_LIBRARY } = require('../libraries/index.js');

// Las 6 dimensiones donde el Director Creativo puede introducir su propia
// variación (norma obligatoria) — exactamente las que pidió el
// propietario: encuadre, emoción, narrativa, iluminación, composición,
// escenario. 'emotion' y 'narrative' son texto libre inventado por el
// director (no vienen de ninguna biblioteca); las otras 4 son overrides
// sobre una biblioteca atómica con un valor que NINGUNA de las
// referencias mezcladas en ese concepto usó.
const DIRECTOR_VARIATION_DIMENSIONS = [
  'angleLensId', // encuadre
  'emotion',
  'narrative',
  'lightingId',
  'compositionId',
  'scenarioId',
];

// Frases de variación propia del director — nunca copiadas de una
// referencia ni de una biblioteca atómica. Deterministas (rotan por
// índice de concepto), no generadas al azar.
const ORIGINAL_EMOTION_TWISTS = [
  'orgullo silencioso', 'alivio inmediato', 'curiosidad despierta', 'sensación de pertenencia',
  'sorpresa contenida', 'calma después del esfuerzo', 'ilusión anticipada', 'seguridad recuperada',
  'pequeña victoria cotidiana', 'asombro tranquilo', 'gratitud práctica', 'energía renovada',
];

const ORIGINAL_NARRATIVE_ANGLES = [
  'el instante justo antes de usarlo, cuando todo empieza',
  'un pequeño ritual diario que se repite sin pensar',
  'el producto como protagonista silencioso de un momento compartido',
  'la pausa que el producto hace posible en medio del día',
  'el antes y el después que marca sin decir una palabra',
  'una escena cotidiana vista con ojos nuevos',
  'el detalle que solo se nota cuando falta',
  'el producto acompañando, no protagonizando, un momento real',
  'la primera vez que se descubre para qué sirve de verdad',
  'un gesto simple que cambia el resto del día',
  'el producto como testigo discreto de la rutina',
  'la sensación de que por fin encaja algo que faltaba',
];

module.exports = {
  CONCEPT_COUNT_MIN,
  CONCEPT_COUNT_MAX,
  CONCEPT_COUNT_DEFAULT,
  REFERENCES_PER_CONCEPT,
  ATOMIC_DIMENSIONS,
  DIMENSION_TO_LIBRARY,
  DIRECTOR_VARIATION_DIMENSIONS,
  ORIGINAL_EMOTION_TWISTS,
  ORIGINAL_NARRATIVE_ANGLES,
};
