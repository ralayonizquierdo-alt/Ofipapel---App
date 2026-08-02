// "Fotografía Base" — modo de prueba explícito, NO el flujo normal de
// campaña (ver service.js#composeMasterPrompt, "story"/"emotion"/"copy"
// etc.). Encargo del propietario: aislar si el problema de calidad viene
// de la fotografía en sí o de la composición de campaña completa —
// pide EXCLUSIVAMENTE una fotografía publicitaria pura del producto,
// prohibiendo de forma literal y exhaustiva cualquier texto, logo, CTA,
// precio, icono o elemento gráfico superpuesto. No sustituye el modo
// normal: solo se usa cuando runCreativeLab() recibe
// options.testMode === 'fotografia-base' — sin ese flag, cero cambio de
// comportamiento (ver index.js).
//
// Reutiliza el mismo Creative Brief y las mismas bibliotecas atómicas
// (estilo, iluminación, ángulo, composición, dirección de arte,
// escenario) que el modo normal — el "ADN Visual" no cambia, solo se
// deja fuera todo lo que compone campaña (historia, emoción, copy,
// jerarquía de texto).

const { getEntryByField } = require('../libraries/index.js');
const { BASE_PHOTOGRAPHY_NEGATIVE_TERMS } = require('./config.js');

/**
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts (un elemento)
 * @returns {object} misma forma que composeMasterPrompt: {conceptId, sections, fullPrompt, negativePrompt, wordCount, tokensApprox}
 */
function composeBasePhotographyPrompt(brief, preparedAssets, concept) {
  const style = getEntryByField('styleId', concept.styleId);
  const lighting = getEntryByField('lightingId', concept.lightingId);
  const angleLens = getEntryByField('angleLensId', concept.angleLensId);
  const composition = getEntryByField('compositionId', concept.compositionId);
  const artDirection = getEntryByField('artDirectionId', concept.artDirectionId);
  const scenario = getEntryByField('scenarioId', concept.scenarioId);
  const brand = preparedAssets.brand;
  const fidelityRules = brief.photography.fidelityRules || [];
  const fidelityText = fidelityRules.length > 0
    ? fidelityRules.join('; ')
    : 'mismas proporciones, materiales y colores, sin inventar piezas';
  const descriptionText = brief.product.description ? ` ${brief.product.description}.` : '';

  const positive = [
    `Fotografía publicitaria editorial premium de un único producto: ${brief.product.name} (${brief.product.category}).${descriptionText}`,
    `Estilo fotográfico: ${style.text}.`,
    `Iluminación: ${lighting.text}.`,
    `Lente y ángulo: ${angleLens.text}.`,
    `Composición: ${composition.text}.`,
    `Dirección de arte: ${artDirection.text}, coherente con la identidad de marca de ${brand.label}.`,
    `Ambiente: ${scenario.text}.`,
    `Fidelidad obligatoria al producto real: ${fidelityText}.`,
    'Calidad de producción profesional de campaña publicitaria real, nitidez total, sin aspecto de foto de stock genérica ni de foto casera.',
    'Deja amplio espacio negativo limpio alrededor del producto — el producto es el único protagonista del encuadre, sin nada más compitiendo por atención.',
  ].join(' ');

  const negativeClause =
    `Prohibido de forma estricta y literal incluir en la imagen: ${BASE_PHOTOGRAPHY_NEGATIVE_TERMS.join(', ')}. ` +
    'Esto es exclusivamente una fotografía de producto — nada de diseño de anuncio, nada de maquetación, nada compuesto encima de la foto. Solo la fotografía.';

  const fullPrompt = `${positive} ${negativeClause}`;
  const negativePrompt = BASE_PHOTOGRAPHY_NEGATIVE_TERMS.join(', ');
  const wordCount = fullPrompt.split(/\s+/).filter(Boolean).length;

  return {
    conceptId: concept.conceptId,
    sections: [{ id: 'base-photography', label: 'Fotografía Base (modo de prueba)', text: fullPrompt }],
    fullPrompt,
    negativePrompt,
    wordCount,
    tokensApprox: Math.round(wordCount * 1.3),
  };
}

module.exports = { composeBasePhotographyPrompt };
