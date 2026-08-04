// Product Intelligence — analiza el producto de un job y produce un
// ProductProfile: beneficios, objeciones, público objetivo, estacionalidad,
// ticket medio (banda), productos complementarios, emociones asociadas y
// argumentos de venta. Determinista, sin proveedor de IA — ver
// marketing-engine/intelligence/README.md.
//
// NUNCA decide tipo de publicación, canal ni CTA — eso es
// campaign-recommender/. Este componente solo describe el producto.

const { PRODUCT_PROFILE_SHAPE, assertShape } = require('../contracts.js');
const { PRODUCT_CATEGORY_PROFILES, COMMERCIAL_CALENDAR, KEYWORD_MATCH_THRESHOLD } = require('./config.js');
const { effectiveNow, toMonthDay } = require('../clock.js');

/**
 * @param {object} job - Job del motor (ver core/contracts/job.contract.js)
 * @returns {object} ProductProfile — cumple PRODUCT_PROFILE_SHAPE
 */
function analyzeProduct(job) {
  const { category, productName, description, targetDate } = job.input;

  const { profileKey, resolvedVia, confidence } = resolveCategory(category, productName, description);
  const profile = PRODUCT_CATEGORY_PROFILES[profileKey];

  const effectiveDate = parseDate(targetDate) || effectiveNow();
  const seasonality = resolveSeasonality(profile, effectiveDate);

  const output = {
    categoryKey: profileKey,
    resolvedVia,
    confidence,
    label: profile.label,
    benefits: profile.benefits,
    objections: profile.objections,
    audience: profile.audience,
    seasonality,
    ticket: profile.ticket,
    complementary: profile.complementary,
    emotions: profile.emotions,
    salesArguments: profile.salesArguments,
    strategyAffinity: profile.strategyAffinity,
  };

  assertShape(output, PRODUCT_PROFILE_SHAPE, 'productProfile');
  return output;
}

function resolveCategory(category, productName, description) {
  if (category && PRODUCT_CATEGORY_PROFILES[category] && category !== 'default') {
    return { profileKey: category, resolvedVia: 'directo', confidence: 1 };
  }

  const match = bestKeywordMatch(productName, description);
  if (match && match.score >= KEYWORD_MATCH_THRESHOLD) {
    return { profileKey: match.key, resolvedVia: 'keyword-hints', confidence: round2(match.score) };
  }

  return { profileKey: 'default', resolvedVia: 'fallback', confidence: 0 };
}

function bestKeywordMatch(productName, description) {
  const text = `${productName || ''} ${description || ''}`.toLowerCase();
  let best = null;

  for (const [key, profile] of Object.entries(PRODUCT_CATEGORY_PROFILES)) {
    if (key === 'default' || profile.keywordHints.length === 0) continue;

    const matched = profile.keywordHints.filter((hint) => text.includes(hint.toLowerCase()));
    if (matched.length === 0) continue;

    const score = matched.length / profile.keywordHints.length;
    if (!best || score > best.score) {
      best = { key, score };
    }
  }

  return best;
}

function resolveSeasonality(profile, effectiveDate) {
  const monthDay = toMonthDay(effectiveDate);

  const activeEvents = COMMERCIAL_CALENDAR
    .filter((event) => profile.seasonalEventIds.includes(event.id))
    .filter((event) => monthDayInRange(monthDay, event.from, event.to))
    .map((event) => ({ id: event.id, strategy: event.strategy, urgency: event.urgency }));

  const note = activeEvents.length > 0
    ? `Temporada activa: ${activeEvents.map((e) => e.strategy).join(', ')}.`
    : profile.seasonalityNoteDefault;

  return { activeEvents, note };
}

// Comparación en MM-DD, con soporte de rango que cruza fin de año (p. ej.
// un futuro evento "diciembre a enero") aunque ninguna entrada actual de
// COMMERCIAL_CALENDAR lo necesite todavía.
function monthDayInRange(monthDay, from, to) {
  if (from <= to) return monthDay >= from && monthDay <= to;
  return monthDay >= from || monthDay <= to;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { analyzeProduct };
