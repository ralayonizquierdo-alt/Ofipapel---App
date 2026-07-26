// Configuración de Creative Lab — valores acordados con el propietario,
// fácilmente configurables por variable de entorno sin tocar código
// (mismo patrón que MARKETING_ENGINE_JOBS_DIR/CREATIVE_ENGINE_ASSETS_DIR).

const QUALITY_THRESHOLD = Number(process.env.CREATIVE_LAB_QUALITY_THRESHOLD) || 85;
const MAX_RETRIES = Number(process.env.CREATIVE_LAB_MAX_RETRIES) || 3;
const SHORTLIST_SIZE = Number(process.env.CREATIVE_LAB_SHORTLIST_SIZE) || 4;

module.exports = { QUALITY_THRESHOLD, MAX_RETRIES, SHORTLIST_SIZE };
