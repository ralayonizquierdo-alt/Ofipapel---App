// Creative Score — puntúa una campaña ya terminada (0-100) antes de que el
// propietario la apruebe en el Almacén. Nunca es una puerta: control-calidad
// (agents/08-control-calidad/) sigue siendo el único paso que puede
// bloquear una pieza; una puntuación de 12/100 igual produce la pieza y se
// muestra tal cual, para que el propietario decida con esa información.
//
// === INICIO: DIMENSIONES PROXY (heurísticas, no medición real) ===
// impactoVisual, atencion, conversion y encajeAudiencia NO se pueden medir
// de verdad con los datos estructurados del pipeline: haría falta visión
// por IA sobre el PNG generado (impacto visual) y resultados reales de
// campañas publicadas (atención/conversión/audiencia). Se calculan con
// señales indirectas documentadas criterio a criterio en config.js, y cada
// dimensión sale marcada confidence:'proxy' en el resultado — nunca se
// presentan como si fueran una medición real.
// Puntos de enganche futuros:
//   - impactoVisual → visión por IA sobre maquetador.renderedAssetPath
//   - atencion/conversion/encajeAudiencia → learning-engine/ cuando
//     sampleSize ≥ MIN_SAMPLE_SIZE (ver learning-engine/config.js)
// === FIN: DIMENSIONES PROXY ===

const { CREATIVE_SCORE_SHAPE, assertShape } = require('../contracts.js');
const { DIMENSIONS, BANDS } = require('./config.js');

const VERSION = '1';

/**
 * @param {object} job - Job del motor, con job.state completo y (si existe) job.intelligence
 * @returns {object} CreativeScore — cumple CREATIVE_SCORE_SHAPE
 */
function scoreCampaign(job) {
  const ctx = buildContext(job);
  const dimensions = DIMENSIONS.map((dim) => evaluateDimension(dim, ctx));

  const total = Math.round(dimensions.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0));
  const confidence = round2(dimensions.filter((d) => d.confidence === 'medida').reduce((s, d) => s + d.weight, 0) / 100);
  const band = resolveBand(total);
  const { strengths, weaknesses } = deriveInsights(dimensions);

  const output = {
    total,
    band,
    confidence,
    dimensions,
    strengths,
    weaknesses,
    scoredAt: new Date().toISOString(),
    version: VERSION,
  };

  assertShape(output, CREATIVE_SCORE_SHAPE, 'creativeScore');
  return output;
}

function buildContext(job) {
  const state = job.state || {};
  return {
    input: job.input || {},
    directorCreativo: state['director-creativo'] || {},
    directorArte: { hierarchy: [], ...state['director-arte'] },
    guardianMarca: { checks: [], approved: false, ...state['guardian-marca'] },
    copy: state.copywriter || {},
    maquetador: state.maquetador || {},
    providerResult: state['proveedor-ia'] || {},
    productProfile: job.intelligence && job.intelligence.productProfile,
    recommendation: job.intelligence && job.intelligence.recommendation,
  };
}

function evaluateDimension(dim, ctx) {
  const criteria = dim.criteria.map((criterion) => {
    let raw = 0;
    try {
      raw = criterion.evaluate(ctx);
    } catch {
      raw = 0;
    }
    const result = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    const earned = Math.round(criterion.points * result * 100) / 100;
    const passed = result >= 0.999;

    let detail = '';
    try {
      detail = criterion.detail(ctx);
    } catch {
      detail = criterion.id;
    }

    return { id: criterion.id, points: criterion.points, earned, passed, detail, fix: passed ? null : criterion.fix };
  });

  const score = Math.round(criteria.reduce((sum, c) => sum + c.earned, 0));
  return { id: dim.id, label: dim.label, weight: dim.weight, score, confidence: dim.confidence, criteria };
}

function resolveBand(total) {
  const match = BANDS.find((b) => total <= b.max);
  return (match || BANDS[BANDS.length - 1]).band;
}

function deriveInsights(dimensions) {
  const strengths = dimensions.filter((d) => d.score >= 80).map((d) => `${d.label} (${d.score}/100)`);

  const allCriteria = [];
  dimensions.forEach((d) => {
    d.criteria.forEach((c) => {
      const lost = c.points - c.earned;
      if (lost > 0) allCriteria.push({ dimension: d.label, criterion: c.id, detail: c.detail, fix: c.fix || '', lost });
    });
  });

  const weaknesses = allCriteria
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 3)
    .map(({ dimension, criterion, detail, fix }) => ({ dimension, criterion, detail, fix }));

  return { strengths, weaknesses };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { scoreCampaign };
