// Prompt Composer Cinematográfico — reescritura completa (sprint del
// mismo nombre, 2026-07-26). Objetivo único del propietario: dejar de
// describir productos y empezar a describir campañas. Ya no envuelve
// creative-engine/prompt-composer/ (el compositor de 9 secciones,
// "producto" primero) — compone su propio prompt de principio a fin, con
// el orden exacto pedido: historia y emoción abren el briefing, la ficha
// técnica del producto queda dentro de "Dirección de fotografía" (4º
// bloque, no el primero).
//
// No se ha modificado NINGÚN otro componente: creative-engine/prompt-composer/
// sigue intacto (creative-engine/index.js#runCreativePipeline lo sigue
// usando tal cual); solo se reutilizan por import de solo lectura
// NEGATIVE_PROMPT_TERMS/SECTION_JOIN de ahí. El resultado sigue teniendo
// exactamente la misma forma que antes — {conceptId, sections, fullPrompt,
// negativePrompt, wordCount, tokensApprox} — así que index.js,
// concept-score/ y el CLI no necesitan ningún cambio.

const { buildConceptSections } = require('./sections/from-concept.js');
const { SECTION_JOIN, NEGATIVE_PROMPT_TERMS } = require('./config.js');

/**
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts (un elemento)
 * @returns {object} { conceptId, sections, fullPrompt, negativePrompt, wordCount, tokensApprox }
 */
function composeMasterPrompt(brief, preparedAssets, concept) {
  const sections = buildConceptSections(concept, brief, preparedAssets);
  const fullPrompt = sections.map((s) => s.text).join(SECTION_JOIN);
  const negativePrompt = NEGATIVE_PROMPT_TERMS.join(', ');
  const wordCount = fullPrompt.split(/\s+/).filter(Boolean).length;

  return {
    conceptId: concept.conceptId,
    sections,
    fullPrompt,
    negativePrompt,
    wordCount,
    tokensApprox: Math.round(wordCount * 1.3), // misma aproximación explícita que el resto del repo, no un tokenizador real
  };
}

module.exports = { composeMasterPrompt };
