// Análisis — primera etapa del flujo de Creative Lab. NO repite Product
// Intelligence (eso ya lo hizo marketing-engine/intelligence/ antes de
// llegar aquí, y sus resultados ya están dentro del CreativeBrief vía
// brief.productIntelligence/brief.campaign — ver creative-engine/brief/
// from-marketing-engine.js). El único trabajo de esta etapa es traducir
// el CreativeBrief en el conjunto de referencias elegibles con las que
// concept-generator/ va a mezclar — nada más.

const { findRelevantReferences } = require('../reference-library/service.js');

const MIN_REFERENCES_TO_MIX = 2; // la norma de "combinar, no copiar" exige al menos 2

// Sprint "Visual Reference Intelligence" (FASE 3), instrucción explícita
// del propietario: "Selecciona automáticamente entre 5 y 10 referencias
// visuales compatibles." Antes el límite por defecto era 6 — técnicamente
// ya dentro del rango pero pegado al borde inferior. Se nombra el rango
// explícitamente y se fuerza (nunca se confía en que el caller pase un
// valor sensato) para que la invariante se cumpla siempre, no solo por
// defecto. findRelevantReferences ya degrada con gracia si la biblioteca
// tiene menos referencias disponibles que el límite pedido (ver
// reference-library/service.js), así que forzar el mínimo no rompe nada
// con una biblioteca todavía pequeña.
const REFERENCE_SELECTION_RANGE = { min: 5, max: 10 };
const DEFAULT_REFERENCE_LIMIT = 8;

/**
 * @param {object} brief - CreativeBrief ya validado
 * @param {object} [options]
 * @param {number} [options.referenceLimit=DEFAULT_REFERENCE_LIMIT] - se recorta siempre a REFERENCE_SELECTION_RANGE
 * @returns {{brief: object, references: object[]}}
 */
function analyzeBrief(brief, options = {}) {
  const requested = options.referenceLimit || DEFAULT_REFERENCE_LIMIT;
  const limit = Math.min(Math.max(requested, REFERENCE_SELECTION_RANGE.min), REFERENCE_SELECTION_RANGE.max);
  const references = findRelevantReferences(brief, { limit });

  if (references.length < MIN_REFERENCES_TO_MIX) {
    throw new Error(
      `Análisis: solo ${references.length} referencia(s) elegible(s) para "${brief.product.category}" — ` +
      `concept-generator/ necesita al menos ${MIN_REFERENCES_TO_MIX} para mezclar sin copiar ninguna. ` +
      'Añade más entradas a la Biblioteca de Referencias (ver reference-library/service.js#registerEntry) ' +
      "o etiqueta alguna referencia existente con 'general'."
    );
  }

  return { brief, references };
}

module.exports = { analyzeBrief, MIN_REFERENCES_TO_MIX, REFERENCE_SELECTION_RANGE, DEFAULT_REFERENCE_LIMIT };
