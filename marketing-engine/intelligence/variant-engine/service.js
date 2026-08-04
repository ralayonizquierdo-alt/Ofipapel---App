// Variant Engine — genera varias propuestas creativas alternativas para la
// misma campaña, a partir de VARIANT_ARCHETYPES (config.js). NUNCA vuelve
// a ejecutar la lógica de recomendación: toma la Recommendation ya
// calculada por campaign-recommender/ y le aplica el delta de cada
// arquetipo elegible — es la aplicación concreta de "sin duplicar lógica".

const { VARIANT_SHAPE, assertShape } = require('../contracts.js');
const { VARIANT_ARCHETYPES } = require('./config.js');

const TICKET_RANK = { bajo: 0, medio: 1, alto: 2 };

/**
 * @param {object} productProfile - ver contracts.js → PRODUCT_PROFILE_SHAPE
 * @param {object} recommendation - ver contracts.js → RECOMMENDATION_SHAPE
 * @param {number} count
 * @returns {object[]} Variant[] — cada uno cumple VARIANT_SHAPE
 */
function generateVariants(productProfile, recommendation, count) {
  const activeEventIds = productProfile.seasonality.activeEvents.map((e) => e.id);

  const candidates = VARIANT_ARCHETYPES
    // No tiene sentido "sugerir como alternativa" el mismo enfoque que ya
    // es la recomendación principal.
    .filter((archetype) => archetype.knowledgeRef.name !== recommendation.campaignType)
    .filter((archetype) => isEligible(archetype, productProfile, activeEventIds))
    .map((archetype) => ({ archetype, score: scoreArchetype(archetype, productProfile, recommendation, activeEventIds) }))
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, count).map(({ archetype, score }) => toVariant(archetype, score, productProfile, recommendation));
}

function isEligible(archetype, productProfile, activeEventIds) {
  const { requiresEvent, allowIfCategory, minTicketBand } = archetype.eligibility;

  if (requiresEvent) {
    const eventActive = activeEventIds.includes(requiresEvent);
    const allowedByCategory = allowIfCategory.includes(productProfile.categoryKey);
    if (!eventActive && !allowedByCategory) return false;
  }

  if (minTicketBand && TICKET_RANK[productProfile.ticket.band] < TICKET_RANK[minTicketBand]) {
    return false;
  }

  return true;
}

function scoreArchetype(archetype, productProfile, recommendation, activeEventIds) {
  let score = 0;
  if (productProfile.strategyAffinity.includes(archetype.knowledgeRef.name)) score += 2;
  if (archetype.eligibility.requiresEvent && activeEventIds.includes(archetype.eligibility.requiresEvent)) score += 2;
  if (archetype.delta.objective === recommendation.objective) score += 1;
  return score;
}

function toVariant(archetype, score, productProfile, recommendation) {
  const variant = {
    id: archetype.id,
    archetype: archetype.id,
    label: archetype.label,
    knowledgeRef: archetype.knowledgeRef,
    reasoning: buildReasoning(archetype, score, productProfile, recommendation),
    jobInputOverrides: {
      postTypeOverride: archetype.delta.format,
      objective: archetype.delta.objective,
      creativeStyleHint: archetype.delta.creativeStyle,
      channel: recommendation.platform,
    },
  };

  assertShape(variant, VARIANT_SHAPE, 'variant');
  return variant;
}

function buildReasoning(archetype, score, productProfile, recommendation) {
  const reasons = [];
  if (productProfile.strategyAffinity.includes(archetype.knowledgeRef.name)) {
    reasons.push(`estrategia afín a "${productProfile.label}"`);
  }
  if (archetype.eligibility.requiresEvent) {
    reasons.push(`temporada activa (${archetype.eligibility.requiresEvent})`);
  }
  if (archetype.delta.objective === recommendation.objective) {
    reasons.push(`mismo objetivo que la recomendación principal (${recommendation.objective})`);
  }

  if (reasons.length === 0) {
    return `Ángulo alternativo de contraste frente a "${recommendation.campaignType}" (${archetype.knowledgeRef.doc}, ${archetype.knowledgeRef.section}) — útil para dar variedad de registro, no porque las señales del producto lo pidan especialmente.`;
  }

  return `Elegible por: ${reasons.join('; ')} (${archetype.knowledgeRef.doc}, ${archetype.knowledgeRef.section}).`;
}

module.exports = { generateVariants };
