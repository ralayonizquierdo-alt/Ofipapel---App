// Importador de referencias desde campañas propias aprobadas — la pieza
// que activa de verdad la "memoria" de la Biblioteca de Referencias
// (documentada en ARCHITECTURE.md, nunca invocada hasta ahora fuera de
// seed-inicial.js). Usa la MISMA registerEntry() que siembra la
// biblioteca — un solo punto de entrada, sin lógica duplicada.
//
// Los 8 ids de biblioteca atómica (styleId, compositionId...) se leen del
// concepto ganador ya guardado por creative-assets/store.js en
// metadata.json (runCreativeLab → store.saveVersion) — no del objeto
// `winner` que devuelve runCreativeLab, que solo expone un resumen. Los
// campos curatoriales (idealProducts, whenToUse, whenToAvoid,
// whatMakesItSpecial, whyItWorksOnSocial, visualImpactLevel) requieren
// juicio humano/cualitativo — no se infieren solos — así que el llamador
// los aporta explícitamente (ver reference-library/schema.js).

const store = require('../../creative-assets/store.js');
const { registerEntry } = require('./service.js');

/**
 * @param {string} creativeId
 * @param {number} versionNumber - la versión aprobada (bestEver.versionNumber en runCreativeLab)
 * @param {object} curation - { idealProducts, whenToUse, whenToAvoid, whatMakesItSpecial, whyItWorksOnSocial, visualImpactLevel? }
 * @returns {object} la entrada registrada (ver reference-library/schema.js)
 */
function importFromCampaign(creativeId, versionNumber, curation) {
  const version = store.getVersion(creativeId, versionNumber);
  if (!version || !version.metadata || !version.metadata.concept) {
    throw new Error(
      `import-from-campaign: no se encontró metadata.concept para "${creativeId}" v${versionNumber} — ` +
      '¿se llamó a store.saveVersion() con { metadata: { concept } } al ejecutar runCreativeLab()?'
    );
  }
  const concept = version.metadata.concept;

  const entry = {
    id: `campana-${creativeId}-v${versionNumber}`,
    label: concept.label,
    styleId: concept.styleId,
    compositionId: concept.compositionId,
    artDirectionId: concept.artDirectionId,
    lightingId: concept.lightingId,
    scenarioId: concept.scenarioId,
    paletteHarmonyId: concept.paletteHarmonyId,
    angleLensId: concept.angleLensId,
    emotion: concept.emotion,
    textSpaceId: concept.textSpaceId,
    idealProducts: curation.idealProducts,
    whenToUse: curation.whenToUse,
    whenToAvoid: curation.whenToAvoid,
    whatMakesItSpecial: curation.whatMakesItSpecial,
    whyItWorksOnSocial: curation.whyItWorksOnSocial,
    visualImpactLevel: curation.visualImpactLevel ?? null,
    sourceType: 'campana-propia',
    sourceRef: `creative-engine/creative-assets/assets/${creativeId}/versions/v${versionNumber}`,
    curatedAt: new Date().toISOString().slice(0, 10),
  };

  return registerEntry(entry);
}

module.exports = { importFromCampaign };
