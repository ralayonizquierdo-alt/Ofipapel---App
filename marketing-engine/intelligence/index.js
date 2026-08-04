// Punto de entrada único de marketing-engine/intelligence/ — lo único que
// core/orchestrator.js conoce de esta capa (mismo criterio que
// core/providers/registry.js frente a cada provider.js: el consumidor
// nunca conoce los cinco componentes por separado).
//
// Modo por defecto: 'shadow' (ver mode.js) — enrichJob() SIEMPRE calcula
// productProfile/recommendation/variants, pero JAMÁS toca job.input salvo
// que MARKETING_ENGINE_INTELLIGENCE_MODE=decision esté activo, y aun así
// solo rellena los campos que el usuario no fijó ya. closeJob() compara la
// recomendación con la decisión real, puntúa la pieza terminada y guarda
// el registro — nada de esto puede romper el pipeline: cualquier error se
// captura aquí, nunca se propaga.

const { analyzeProduct } = require('./product-intelligence/service.js');
const { recommend, explain, compareToActual } = require('./campaign-recommender/service.js');
const { generateVariants } = require('./variant-engine/service.js');
const { scoreCampaign } = require('./creative-score/service.js');
const { recordCampaign, buildRecordFromJob } = require('./learning-engine/service.js');
const { currentMode } = require('./mode.js');

/**
 * Se llama ANTES de que el pipeline empiece (core/orchestrator.js →
 * runPipeline, justo después de pipeline_start). Pura respecto a `job`:
 * nunca lo muta salvo en modo 'decision' (ver applyAsOverrides).
 * @param {object} job
 * @returns {object} { mode, productProfile, recommendation, variants, shadowComparison, creativeScore }
 */
function enrichJob(job) {
  const mode = currentMode();
  const productProfile = analyzeProduct(job);
  const recommendation = recommend(productProfile, job);
  const variants = generateVariants(productProfile, recommendation, recommendation.variantCount);

  if (mode === 'decision') {
    applyAsOverrides(job, recommendation);
  }

  return {
    mode,
    generatedAt: new Date().toISOString(),
    productProfile,
    recommendation,
    variants,
    // Se rellenan al final del pipeline, cuando la decisión real ya es
    // definitiva — ver closeJob().
    shadowComparison: null,
    creativeScore: null,
  };
}

// Único sitio de todo el módulo donde currentMode() cambia un
// comportamiento observable del pipeline. Nunca pisa un override que el
// propio usuario ya haya elegido en el formulario de "Nueva Campaña".
function applyAsOverrides(job, recommendation) {
  const ov = recommendation.jobInputOverrides;
  if (!job.input.postTypeOverride) job.input.postTypeOverride = ov.postTypeOverride;
  if (!job.input.objective) job.input.objective = ov.objective;
  if (!job.input.creativeStyleHint) job.input.creativeStyleHint = ov.creativeStyleHint;
  if (!job.input.channel) job.input.channel = ov.channel;
}

/**
 * Se llama al final del pipeline, justo después de job.status='completed'
 * y antes del saveJob final (core/orchestrator.js). Compara, puntúa y
 * registra — cualquier fallo se captura y se reporta en `warnings`, nunca
 * se propaga: un fallo aquí no puede convertir una campaña ya completada
 * en un fallo del pipeline.
 * @param {object} job - con job.intelligence ya presente (de enrichJob)
 * @returns {{shadowComparison: object|null, creativeScore: object|null, recorded: boolean, warnings: string[]}}
 */
function closeJob(job) {
  const warnings = [];
  let shadowComparison = null;
  let creativeScore = null;
  let recorded = false;

  if (job.intelligence && job.intelligence.recommendation) {
    try {
      shadowComparison = compareToActual(job.intelligence.recommendation, job);
    } catch (err) {
      warnings.push(`shadow-comparison: ${err.message}`);
    }
  }

  try {
    creativeScore = scoreCampaign(job);
  } catch (err) {
    warnings.push(`creative-score: ${err.message}`);
  }

  try {
    const record = buildRecordFromJob(job);
    record.shadowComparison = shadowComparison;
    record.creativeScoreTotal = creativeScore ? creativeScore.total : null;
    recordCampaign(record);
    recorded = true;
  } catch (err) {
    warnings.push(`record: ${err.message}`);
  }

  return { shadowComparison, creativeScore, recorded, warnings };
}

module.exports = {
  enrichJob,
  closeJob,
  // Re-exportados para el CLI de demo y para cualquier consumidor futuro
  // que necesite un componente suelto sin pasar por el ciclo completo.
  analyzeProduct,
  recommend,
  explain,
  generateVariants,
  scoreCampaign,
};
