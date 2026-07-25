// Variant Generator — genera 1/3/5/10 propuestas realmente distintas para
// la MISMA campaña, variando la ejecución visual (ángulo/luz/composición),
// nunca la estrategia (eso ya lo decidió el brief). Nunca reimplementa la
// lógica de composición de prompts — cada variante llama a
// prompt-composer/service.js#composePrompt sobre una copia del brief con
// el delta del ángulo aplicado.

const { composePrompt } = require('../prompt-composer/service.js');
const { GENERATION_REQUEST_SHAPE } = require('../provider-manager/provider.interface.js');
const { assertShape } = require('../shared/shapes.js');
const { VARIANT_COUNTS, VISUAL_ANGLES } = require('./config.js');

/**
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {number} count - uno de VARIANT_COUNTS (1, 3, 5, 10)
 * @returns {object[]} Variant[]: { variantId, angleId, label, brief, composedPrompt, generationRequest }
 */
function generateVariants(brief, preparedAssets, count) {
  if (!VARIANT_COUNTS.includes(count)) {
    throw new Error(
      `Número de variantes no soportado: ${count}. Valores válidos: ${VARIANT_COUNTS.join(', ')} (ver variant-generator/config.js#VARIANT_COUNTS).`
    );
  }

  // Selección determinista (los primeros N ángulos, en el orden
  // declarado) — no aleatoria, para que la salida sea reproducible y
  // verificable (mismo criterio que todo lo demás en este repo: mismo
  // input, misma salida).
  const angles = VISUAL_ANGLES.slice(0, count);

  const variants = angles.map((angle, index) => {
    const variantBrief = mergeAngle(brief, angle);
    const composedPrompt = composePrompt(variantBrief, preparedAssets);
    const generationRequest = toGenerationRequest(variantBrief, preparedAssets, composedPrompt);

    return {
      variantId: `v${index + 1}-${angle.id}`,
      angleId: angle.id,
      label: angle.label,
      brief: variantBrief,
      composedPrompt,
      generationRequest,
    };
  });

  assertDistinctPrompts(variants);
  return variants;
}

// Solo toca photography/artDirection — la estrategia (creativeDirection,
// campaign, productIntelligence) es la misma en las N variantes a
// propósito: lo que cambia es CÓMO se fotografía, no QUÉ se cuenta.
function mergeAngle(brief, angle) {
  return {
    ...brief,
    photography: { ...brief.photography, angle: angle.framing, lighting: angle.lighting },
    artDirection: { ...brief.artDirection, composition: angle.composition },
  };
}

function toGenerationRequest(brief, preparedAssets, composedPrompt) {
  const dims = preparedAssets.dimensions;
  const request = {
    prompt: composedPrompt.fullPrompt,
    negativePrompt: composedPrompt.negativePrompt,
    width: dims.width,
    height: dims.height,
    contentClass: brief.format.contentClass,
    referenceImages: preparedAssets.product.photoPath ? [preparedAssets.product.photoPath] : [],
    metadata: null,
  };
  assertShape(request, GENERATION_REQUEST_SHAPE, 'generationRequest');
  return request;
}

/**
 * Convierte "cada variante debe ser realmente distinta" en un invariante
 * forzado, no una esperanza — lanza si dos variantes comparten el mismo
 * fullPrompt textual.
 */
function assertDistinctPrompts(variants) {
  const prompts = variants.map((v) => v.composedPrompt.fullPrompt);
  const unique = new Set(prompts);
  if (unique.size !== prompts.length) {
    throw new Error('Variantes no distintas: dos o más variantes generaron el mismo prompt — revisar variant-generator/config.js#VISUAL_ANGLES.');
  }
}

module.exports = { generateVariants, assertDistinctPrompts };
