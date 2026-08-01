// Moodboard — textual y estructurado, NUNCA una imagen. Aprendizaje
// directo de la demo de creative-engine sin proveedor real: un
// "moodboard" hecho de imagen sería el mismo placeholder evidente que ya
// se rechazó. Se declara honestamente `evaluatedOn: 'plan'` — mismo eje
// que ya usa creative-engine/creative-validator/ (plan hoy, pixel cuando
// exista una imagen real que inspeccionar).

const { getEntryByField } = require('../libraries/index.js');

function resolveLabel(dimensionField, id) {
  return getEntryByField(dimensionField, id).label;
}

/**
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @returns {object} moodboard textual
 */
function buildMoodboard(concept, preparedAssets) {
  const keywords = [
    resolveLabel('styleId', concept.styleId),
    resolveLabel('artDirectionId', concept.artDirectionId),
    resolveLabel('lightingId', concept.lightingId),
    concept.emotion,
  ];

  const referenceCues = [
    `Estilo: ${resolveLabel('styleId', concept.styleId)}.`,
    `Composición: ${resolveLabel('compositionId', concept.compositionId)}.`,
    `Dirección de arte: ${resolveLabel('artDirectionId', concept.artDirectionId)}.`,
    `Iluminación: ${resolveLabel('lightingId', concept.lightingId)}.`,
    `Escenario: ${resolveLabel('scenarioId', concept.scenarioId)}.`,
    `Ángulo/lente: ${resolveLabel('angleLensId', concept.angleLensId)}.`,
    `Narrativa: ${concept.narrative}.`,
  ].join(' ');

  return {
    conceptId: concept.conceptId,
    evaluatedOn: 'plan',
    keywords,
    palette: preparedAssets.brand.palette,
    referenceCues,
    emotion: concept.emotion,
    narrative: concept.narrative,
    textSpaceNote: resolveLabel('textSpaceId', concept.textSpaceId),
    inspiredBy: concept.sourceReferenceIds,
    directorVariation: concept.directorVariation,
  };
}

module.exports = { buildMoodboard };
