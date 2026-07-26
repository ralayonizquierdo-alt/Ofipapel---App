// Análisis — primera etapa del flujo de Creative Lab. NO repite Product
// Intelligence (eso ya lo hizo marketing-engine/intelligence/ antes de
// llegar aquí, y sus resultados ya están dentro del CreativeBrief vía
// brief.productIntelligence/brief.campaign — ver creative-engine/brief/
// from-marketing-engine.js). El único trabajo de esta etapa es traducir
// el CreativeBrief en el conjunto de referencias elegibles con las que
// concept-generator/ va a mezclar — nada más.

const { findRelevantReferences } = require('../reference-library/service.js');

const MIN_REFERENCES_TO_MIX = 2; // la norma de "combinar, no copiar" exige al menos 2

/**
 * @param {object} brief - CreativeBrief ya validado
 * @param {object} [options]
 * @param {number} [options.referenceLimit=6]
 * @returns {{brief: object, references: object[]}}
 */
function analyzeBrief(brief, options = {}) {
  const limit = options.referenceLimit || 6;
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

module.exports = { analyzeBrief, MIN_REFERENCES_TO_MIX };
