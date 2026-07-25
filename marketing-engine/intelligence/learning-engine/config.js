// Configuración del Learning Engine. Solo constantes — decisiones tomadas
// ahora, en el punto de partida, para que quien implemente el aprendizaje
// real en el futuro (ver ROADMAP_V2.md, Fase 3) no tenga que inventarlas.

// Nº mínimo de campañas comparables antes de que
// learning-engine/service.js → getRecommendationBias() deje de devolver
// un resultado neutro. Umbral deliberadamente conservador: con menos
// muestras, un "aprendizaje" real sería solo ruido estadístico disfrazado
// de criterio.
const MIN_SAMPLE_SIZE = 20;

const RECORD_VERSION = '1';

// Claves por las que una futura agregación agrupará campañas para
// compararlas entre sí (core/orchestrator.js y campaign-recommender/ ya
// producen las cuatro). Declaradas ahora para que CAMPAIGN_RECORD_SHAPE
// (ver ../contracts.js) ya tenga la forma que esa agregación necesitará.
const COMPARABILITY_KEYS = ['categoryKey', 'campaignType', 'platform', 'format'];

module.exports = { MIN_SAMPLE_SIZE, RECORD_VERSION, COMPARABILITY_KEYS };
