// Concept Score — evaluación en dos capas (decisión definitiva del
// propietario):
//   Capa 1 (plan, gratuita): puntúa los 8-12 conceptos SIN llamar a
//     ningún proveedor — reutiliza creative-validator/ + calidad de las
//     referencias mezcladas + originalidad. Sirve para construir el
//     shortlist de 3-4.
//   Capa 2 (real, con coste): solo se llama sobre el shortlist, con el
//     resultado real del proveedor — es la puntuación DEFINITIVA que se
//     compara contra QUALITY_THRESHOLD.

const { validateCreative } = require('../../creative-validator/service.js');
const { listAll } = require('../reference-library/service.js');
const { WEIGHTS, bandFor } = require('./config.js');

function averageVisualImpact(sourceReferenceIds) {
  const manifest = listAll();
  const levels = sourceReferenceIds
    .map((id) => manifest.find((row) => row.id === id))
    .filter(Boolean)
    .map((row) => row.visualImpactLevel)
    .filter((v) => typeof v === 'number');
  if (levels.length === 0) return 60; // sin dato — ni penaliza ni premia, valor neutro documentado
  return levels.reduce((sum, v) => sum + v, 0) / levels.length;
}

/**
 * Capa 1 — evaluación de plan, sin proveedor.
 * @param {object} concept
 * @param {object} composedPrompt - salida de master-prompt-composer/service.js#composeMasterPrompt
 * @param {object} brief
 * @param {object} preparedAssets
 */
function scoreConceptPlan(concept, composedPrompt, brief, preparedAssets) {
  const baseValidation = validateCreative(brief, preparedAssets, composedPrompt, null);
  const passedRatio = baseValidation.checks.filter((c) => c.passed).length / baseValidation.checks.length;
  const baseScore = passedRatio * WEIGHTS.baseValidator;

  const impact = averageVisualImpact(concept.sourceReferenceIds); // 0-100
  const referenceQualityScore = (impact / 100) * WEIGHTS.referenceQuality;

  // La originalidad es un invariante ya forzado por concept-generator/
  // (assertNoReferenceIsFullyCopied + directorVariation obligatoria) — no
  // hay nada que "medir" de plan que no esté ya garantizado por
  // construcción, así que el peso se concede completo. Queda declarado
  // aquí explícitamente para que quien lea el score entienda por qué no
  // varía entre conceptos, no como un valor arbitrario oculto.
  const originalityScore = WEIGHTS.originality;

  const total = Math.round(baseScore + referenceQualityScore + originalityScore);

  return {
    conceptId: concept.conceptId,
    evaluatedOn: 'plan',
    total,
    band: bandFor(total),
    breakdown: { baseScore: Math.round(baseScore), referenceQualityScore: Math.round(referenceQualityScore), originalityScore },
    baseValidation,
  };
}

/**
 * Capa 2 — evaluación real, definitiva. Se llama solo sobre el
 * shortlist, tras generar de verdad con el proveedor.
 * @param {object} concept
 * @param {object} composedPrompt
 * @param {object|null} generationResult - GENERATION_RESULT_SHAPE del proveedor
 * @param {object} brief
 * @param {object} preparedAssets
 */
function scoreConceptPixel(concept, composedPrompt, generationResult, brief, preparedAssets) {
  const validation = validateCreative(brief, preparedAssets, composedPrompt, generationResult);
  const passedRatio = validation.checks.filter((c) => c.passed).length / validation.checks.length;
  const total = Math.round(passedRatio * 100);

  return {
    conceptId: concept.conceptId,
    evaluatedOn: 'pixel',
    total,
    band: bandFor(total),
    validation,
  };
}

/** Ordena conceptos ya puntuados (capa 1) de mejor a peor y toma los `limit` primeros — el shortlist que sí se manda al proveedor real. */
function buildShortlist(scoredConcepts, limit) {
  return [...scoredConcepts].sort((a, b) => b.score.total - a.score.total).slice(0, limit);
}

module.exports = { scoreConceptPlan, scoreConceptPixel, buildShortlist };
