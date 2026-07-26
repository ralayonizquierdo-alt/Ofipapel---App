// Secciones NUEVAS que aporta el concepto de Creative Lab y que el
// prompt-composer/ base de creative-engine no tiene equivalente:
// estilo, filosofía de dirección artística, armonía de paleta, emoción +
// narrativa, y un refinamiento del espacio de texto. (Ángulo/lente,
// iluminación, escenario y composición NO se duplican aquí — ya se
// inyectan en el prompt base sobreescribiendo brief.photography/
// brief.artDirection antes de llamar a composeBasePrompt, ver
// master-prompt-composer/service.js#buildEffectiveBrief — evita que dos
// secciones digan cosas distintas sobre lo mismo.)
//
// Se consolidan en un solo fichero (a diferencia de un fichero por
// sección como en prompt-composer/) porque las 5 tienen la misma forma
// trivial "resolver un id de biblioteca + devolver {id,label,text}" —
// una decisión de simplicidad tomada durante la implementación, sin
// perder modularidad real (cada builder sigue siendo una función
// independiente, solo comparten fichero).

const { getEntryByField } = require('../../libraries/index.js');

function buildStyleSection(concept) {
  const style = getEntryByField('styleId', concept.styleId);
  return { id: 'lab-style', label: 'Estilo (Creative Lab)', text: style.text };
}

function buildArtPhilosophySection(concept) {
  const artDirection = getEntryByField('artDirectionId', concept.artDirectionId);
  return { id: 'lab-art-philosophy', label: 'Filosofía de dirección artística (Creative Lab)', text: artDirection.text };
}

function buildPaletteHarmonySection(concept) {
  const harmony = getEntryByField('paletteHarmonyId', concept.paletteHarmonyId);
  return { id: 'lab-palette-harmony', label: 'Armonía de paleta (Creative Lab)', text: harmony.text };
}

function buildEmotionNarrativeSection(concept) {
  return {
    id: 'lab-emotion-narrative',
    label: 'Emoción y narrativa (Creative Lab)',
    text: `Emoción a transmitir: ${concept.emotion}. Ángulo narrativo: ${concept.narrative}.`,
  };
}

function buildTextSpaceRefinementSection(concept) {
  const textSpace = getEntryByField('textSpaceId', concept.textSpaceId);
  return { id: 'lab-text-space', label: 'Refinamiento de espacio de texto (Creative Lab)', text: textSpace.text };
}

function buildConceptSections(concept) {
  return [
    buildStyleSection(concept),
    buildArtPhilosophySection(concept),
    buildPaletteHarmonySection(concept),
    buildEmotionNarrativeSection(concept),
    buildTextSpaceRefinementSection(concept),
  ];
}

module.exports = { buildConceptSections };
