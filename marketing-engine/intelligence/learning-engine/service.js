// Learning Engine — arquitectura para que el sistema pueda aprender de
// campañas reales en el futuro. HOY NO IMPLEMENTA APRENDIZAJE NINGUNO: es
// la estructura (contratos + almacén + esta costura) preparada para que
// activar el aprendizaje real sea sustituir el cuerpo de
// getRecommendationBias() por una agregación real — cero cambios en
// campaign-recommender/service.js, que ya la llama hoy y usará el
// resultado real el día que exista sin saber que cambió nada.
//
// === INICIO: SIN APRENDIZAJE REAL (preparado, no implementado) ===
// Punto de enganche futuro (ver ROADMAP_V2.md, Fase 3):
//   1. Agrupar listRecords() por COMPARABILITY_KEYS (config.js).
//   2. Para el grupo de la categoría/campaña/plataforma/formato pedidos,
//      calcular medias de outcome.engagement / outcome.sales por variante
//      usada (record.recommendation.campaignType).
//   3. Si el grupo alcanza MIN_SAMPLE_SIZE, devolver un ajuste EXPLICABLE
//      (qué variante rindió mejor y cuánto, nunca una puntuación opaca).
// === FIN: SIN APRENDIZAJE REAL ===

const { listRecords, recordCampaign } = require('./store.js');
const { MIN_SAMPLE_SIZE, RECORD_VERSION } = require('./config.js');

/**
 * @param {object} productProfile - ver contracts.js → PRODUCT_PROFILE_SHAPE
 * @returns {{biasApplied:boolean, adjustments:object, sampleSize:number, minSampleSize:number, reason:string}}
 */
function getRecommendationBias(productProfile) {
  const sampleSize = listRecords().filter(
    (record) => record.input && record.input.categoryKey === productProfile.categoryKey
  ).length;

  const reason = sampleSize < MIN_SAMPLE_SIZE
    ? `Sin resultados propios suficientes todavía (${sampleSize}/${MIN_SAMPLE_SIZE} campañas comparables de "${productProfile.categoryKey}").`
    : `${sampleSize} campañas comparables registradas, pero la agregación real todavía no está implementada (ver ROADMAP_V2.md, Fase 3) — se sigue devolviendo un resultado neutro a propósito.`;

  // biasApplied es SIEMPRE false en este sprint, incluso si sampleSize
  // superara MIN_SAMPLE_SIZE — "preparar la estructura" no es lo mismo que
  // "implementar el cálculo", y este componente no debe fingir lo segundo.
  return { biasApplied: false, adjustments: {}, sampleSize, minSampleSize: MIN_SAMPLE_SIZE, reason };
}

/**
 * Construye el registro que closeJob() persiste al final de cada pipeline
 * completado — la campaña en sí, nunca su resultado real (eso llega
 * después, a mano, vía recordOutcome() — ningún sitio del repo la llama
 * todavía, es la costura para el Almacén del futuro, ver ROADMAP_V2.md).
 * @param {object} job
 * @returns {object} cumple CAMPAIGN_RECORD_SHAPE (ver ../contracts.js)
 */
function buildRecordFromJob(job) {
  const productProfile = job.intelligence && job.intelligence.productProfile;
  const recommendation = job.intelligence && job.intelligence.recommendation;
  const directorCreativo = job.state['director-creativo'] || {};

  return {
    jobId: job.id,
    recordedAt: new Date().toISOString(),
    version: RECORD_VERSION,
    input: {
      productName: job.input.productName,
      categoryKey: (productProfile && productProfile.categoryKey) || job.input.category,
      brand: job.input.brand,
      channel: job.input.channel || 'ambas',
    },
    recommendation: recommendation
      ? {
          campaignType: recommendation.campaignType,
          format: recommendation.format,
          platform: recommendation.platform,
          postingWindow: recommendation.postingWindow,
        }
      : { campaignType: 'sin-recomendacion', format: directorCreativo.postType || 'foto', platform: directorCreativo.channel || 'ambas', postingWindow: 'sin-datos' },
    pipelineDecisions: {
      postType: directorCreativo.postType || 'foto',
      tone: directorCreativo.tone || '',
      channel: directorCreativo.channel || 'ambas',
      graphicFamily: directorCreativo.graphicFamily || '',
    },
    creativeScoreTotal: null, // lo rellena intelligence/index.js → closeJob() tras puntuar
    outcome: null,
  };
}

module.exports = { getRecommendationBias, buildRecordFromJob, recordCampaign };
