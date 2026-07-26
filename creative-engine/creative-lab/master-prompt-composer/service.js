// Prompt Maestro — EXTIENDE creative-engine/prompt-composer/, no lo
// sustituye. Dos mecanismos de extensión:
//
//  1. buildEffectiveBrief(): las elecciones del concepto para ángulo/
//     lente, iluminación, escenario y composición SOBREESCRIBEN los
//     campos equivalentes del CreativeBrief (brief.photography.*,
//     brief.artDirection.composition) ANTES de llamar al compositor
//     base — así las 9 secciones ya existentes (producto, dirección
//     creativa, fotografía, dirección de arte, marca, inteligencia de
//     producto, campaña, copy, formato) reflejan el concepto sin
//     reescribir su lógica, y sin que dos secciones digan cosas
//     distintas sobre lo mismo (ej. "frontal centrado" en una sección y
//     "dutch angle" en otra).
//  2. Las 6 secciones que el compositor base NO tiene (estilo, filosofía
//     de dirección artística, armonía de paleta, emoción+narrativa,
//     refinamiento de espacio de texto, variación propia del director)
//     se AÑADEN al final.
//
// El negativePrompt se reutiliza tal cual del compositor base — la
// misma lista estática (incluye "sin texto renderizado") sigue aplicando
// sin cambios.

const { composePrompt: composeBasePrompt } = require('../../prompt-composer/service.js');
const { getEntryByField } = require('../libraries/index.js');
const { buildConceptSections } = require('./sections/from-concept.js');
const { buildDirectorVariationSection } = require('./sections/director-variation.js');

function buildEffectiveBrief(brief, concept) {
  return {
    ...brief,
    photography: {
      ...brief.photography,
      angle: getEntryByField('angleLensId', concept.angleLensId).text,
      background: getEntryByField('scenarioId', concept.scenarioId).text,
      lighting: getEntryByField('lightingId', concept.lightingId).text,
    },
    artDirection: {
      ...brief.artDirection,
      composition: getEntryByField('compositionId', concept.compositionId).text,
    },
  };
}

/**
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts (un elemento)
 * @returns {object} { conceptId, sections, fullPrompt, negativePrompt, wordCount, tokensApprox }
 */
function composeMasterPrompt(brief, preparedAssets, concept) {
  const effectiveBrief = buildEffectiveBrief(brief, concept);
  const base = composeBasePrompt(effectiveBrief, preparedAssets);

  const extraSections = [...buildConceptSections(concept), buildDirectorVariationSection(concept)];
  const sections = [...base.sections, ...extraSections];
  const fullPrompt = sections.map((s) => s.text).join('. ');
  const wordCount = fullPrompt.split(/\s+/).filter(Boolean).length;

  return {
    conceptId: concept.conceptId,
    sections,
    fullPrompt,
    negativePrompt: base.negativePrompt,
    wordCount,
    tokensApprox: Math.round(wordCount * 1.3), // misma aproximación explícita que prompt-composer/, no un tokenizador real
  };
}

module.exports = { composeMasterPrompt, buildEffectiveBrief };
