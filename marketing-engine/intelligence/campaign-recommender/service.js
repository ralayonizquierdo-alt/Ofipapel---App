// Campaign Recommender — a partir del ProductProfile (product-intelligence/)
// recomienda objetivo, tipo de campaña, formato, plataforma, estilo
// creativo, CTA, horario y número de variantes, SIEMPRE con una razón por
// campo. No decide nada de la pieza final (eso es 01-director-creativo y
// el resto del pipeline) — en modo 'shadow' (por defecto, ver
// ../mode.js) esta recomendación es puramente informativa y se compara
// después con lo que el pipeline decidió de verdad (compareToActual, más
// abajo), nunca lo sustituye.

const { RECOMMENDATION_SHAPE, SHADOW_COMPARISON_SHAPE, assertShape } = require('../contracts.js');
const { FORMAT_BY_STRATEGY, STYLE_BY_OBJECTIVE, CTA_BY_OBJECTIVE, POSTING_WINDOWS, VARIANT_COUNT_BY_TICKET } = require('./config.js');
const { getRecommendationBias } = require('../learning-engine/service.js');
const { currentMode } = require('../mode.js');

const URGENCY_RANK = { ninguna: 0, baja: 1, media: 2, alta: 3, maxima: 4 };

/**
 * @param {object} productProfile - ver contracts.js → PRODUCT_PROFILE_SHAPE
 * @param {object} job - Job del motor
 * @returns {object} Recommendation — cumple RECOMMENDATION_SHAPE
 */
function recommend(productProfile, job) {
  const input = job.input;

  // campaignType se resuelve ANTES que objective, y objective se deriva del
  // MISMO evento de calendario que decidió campaignType (si lo hay) — no
  // del evento más urgente de la lista si es uno distinto. Sin este orden,
  // una campaña podía recomendar "Lifestyle" (tono cercano, sin urgencia,
  // knowledge/campaign-strategies.md §2) con un objetivo "vender" (CTA
  // agresivo) si había OTRO evento más urgente activo a la vez — coherente
  // por separado, incoherente entre sí.
  const campaignType = resolveCampaignType(productProfile);
  const objective = resolveObjective(productProfile, input, campaignType.drivingEvent);
  const format = resolveFormat(campaignType.value, input);
  const platform = resolvePlatform(productProfile, input);
  const creativeStyle = resolveCreativeStyle(campaignType.value, objective.value, input);
  const cta = resolveCta(objective.value);
  const postingWindow = resolvePostingWindow(platform.value, productProfile);
  const variantCount = resolveVariantCount(productProfile);

  const bias = getRecommendationBias(productProfile);

  const output = {
    objective: objective.value,
    campaignType: campaignType.value,
    format: format.value,
    platform: platform.value,
    creativeStyle: creativeStyle.value,
    cta: cta.value,
    postingWindow: postingWindow.value,
    variantCount: variantCount.value,
    reasons: {
      objective: objective.reason,
      campaignType: campaignType.reason,
      format: format.reason,
      platform: platform.reason,
      creativeStyle: creativeStyle.reason,
      cta: cta.reason,
      postingWindow: postingWindow.reason,
      variantCount: variantCount.reason,
    },
    evidence: { biasApplied: bias.biasApplied, sampleSize: bias.sampleSize, note: bias.reason },
    jobInputOverrides: {
      postTypeOverride: format.value,
      objective: objective.value,
      creativeStyleHint: creativeStyle.value,
      channel: platform.value,
    },
  };

  assertShape(output, RECOMMENDATION_SHAPE, 'recommendation');
  return output;
}

// drivingEvent: el mismo evento (o null) que decidió campaignType — ver
// nota en recommend(). Cuando existe, objective se deriva de SU urgencia,
// nunca de la del evento más urgente si es uno distinto.
function resolveObjective(productProfile, input, drivingEvent) {
  if (input.objective) {
    return { value: input.objective, reason: 'El usuario ya eligió el objetivo al crear la campaña — se respeta tal cual.' };
  }

  if (drivingEvent) {
    if (URGENCY_RANK[drivingEvent.urgency] >= URGENCY_RANK.alta) {
      return {
        value: 'vender',
        reason: `La campaña recomendada ("${drivingEvent.strategy}") tiene fecha límite — señal directa hacia "vender" (knowledge/creative-playbook.md §3).`,
      };
    }
    return {
      value: 'emocionar',
      reason: `La campaña recomendada ("${drivingEvent.strategy}") es una fecha afectiva sin urgencia de precio — "emocionar, con una capa de venta al final" (knowledge/creative-playbook.md §3).`,
    };
  }

  // Fase 4 ("terminar el cerebro"): la única señal real y ya existente
  // para "resolver un problema" — product-intelligence/config.js ya
  // declaraba 'Problema → Solución' como afinidad de electrodomésticos
  // antes de que nada la consumiera. Se comprueba antes que
  // técnico/ticket-alto: un producto puede ser técnico Y resolver una
  // molestia concreta a la vez, y la molestia es la señal más específica
  // de las dos.
  if (productProfile.strategyAffinity.includes('Problema → Solución')) {
    return {
      value: 'resolver-problema',
      reason: `"${productProfile.label}" tiene afinidad real con la estrategia "Problema → Solución" — la molestia que resuelve es un argumento más fuerte que la ficha técnica (knowledge/campaign-strategies.md).`,
    };
  }

  const technical = /técnic|verificable/i.test(productProfile.audience.decisionDriver);
  if (technical || productProfile.ticket.band === 'alto') {
    return {
      value: 'minimalista',
      reason: 'El producto se compra por especificación/ficha técnica, no por deseo — señal hacia "minimalismo/informar" (knowledge/creative-playbook.md §3).',
    };
  }

  if (productProfile.categoryKey === 'oferta') {
    return { value: 'vender', reason: 'Categoría "oferta": es una situación comercial de venta por definición, con o sin evento de calendario activo.' };
  }

  return {
    value: 'emocionar',
    reason: 'Sin urgencia activa ni perfil técnico — "emocionar" es el registro por defecto para un negocio local (knowledge/creative-playbook.md §2).',
  };
}

function resolveCampaignType(productProfile) {
  const activeEvents = productProfile.seasonality.activeEvents;

  if (activeEvents.length > 0) {
    const matched = activeEvents.find((e) => productProfile.strategyAffinity.includes(e.strategy));
    if (matched) {
      return {
        value: matched.strategy,
        drivingEvent: matched,
        reason: `Coincide con la temporada activa (${matched.strategy}) y es una estrategia afín a "${productProfile.label}" (knowledge/campaign-strategies.md).`,
      };
    }
    return {
      value: activeEvents[0].strategy,
      drivingEvent: activeEvents[0],
      reason: `Temporada activa (${activeEvents[0].strategy}) — se prioriza el calendario comercial aunque no sea la afinidad por defecto de esta categoría.`,
    };
  }

  const fallback = productProfile.strategyAffinity[0];
  return {
    value: fallback,
    drivingEvent: null,
    reason: `Sin temporada activa — se usa la estrategia de mayor afinidad para "${productProfile.label}" (knowledge/campaign-strategies.md).`,
  };
}

function resolveFormat(campaignType, input) {
  if (input.postTypeOverride) {
    return { value: input.postTypeOverride, reason: 'El usuario ya eligió el tipo de publicación al crear la campaña — se respeta tal cual.' };
  }

  const format = FORMAT_BY_STRATEGY[campaignType] || 'foto';
  return { value: format, reason: `Formato recomendado para la estrategia "${campaignType}" (knowledge/campaign-strategies.md).` };
}

function resolvePlatform(productProfile, input) {
  if (input.channel) {
    return { value: input.channel, reason: 'El usuario ya eligió el canal al crear la campaña — se respeta tal cual.' };
  }

  const technical = /técnic|verificable/i.test(productProfile.audience.decisionDriver);
  if (technical) {
    return {
      value: 'facebook',
      reason: 'Producto técnico/informativo — Facebook tolera mejor el texto explicativo y su público suele ser algo mayor (knowledge/social-media-playbook.md §1).',
    };
  }

  return {
    value: 'instagram',
    reason: 'Instagram es el canal principal por defecto para construir marca y generar deseo (knowledge/social-media-playbook.md §1).',
  };
}

function resolveCreativeStyle(campaignType, objective, input) {
  if (input.creativeStyleHint) {
    return { value: input.creativeStyleHint, reason: 'El usuario ya describió un estilo creativo al crear la campaña — se respeta tal cual.' };
  }

  const style = STYLE_BY_OBJECTIVE[objective] || STYLE_BY_OBJECTIVE.emocionar;
  return { value: `${campaignType}, con un enfoque ${style}`, reason: `Combina la estrategia recomendada con el tono del objetivo "${objective}" (knowledge/creative-playbook.md §2).` };
}

function resolveCta(objective) {
  const cta = CTA_BY_OBJECTIVE[objective] || CTA_BY_OBJECTIVE.emocionar;
  return { value: cta, reason: `Tipo de CTA coherente con el objetivo "${objective}" (knowledge/copywriting-playbook.md §4).` };
}

function resolvePostingWindow(platform, productProfile) {
  const entry = POSTING_WINDOWS[platform] || POSTING_WINDOWS.ambas;
  const urgent = productProfile.seasonality.activeEvents.some((e) => URGENCY_RANK[e.urgency] >= URGENCY_RANK.alta);
  const urgencyNote = urgent ? ' Con urgencia activa, conviene además reforzar con una Story en las horas siguientes a la publicación.' : '';

  return {
    value: entry.window,
    reason: `Heurística general por canal (${entry.note}) — todavía no hay datos propios de rendimiento por horario, ver learning-engine/.${urgencyNote}`,
  };
}

function resolveVariantCount(productProfile) {
  const count = VARIANT_COUNT_BY_TICKET[productProfile.ticket.band] || VARIANT_COUNT_BY_TICKET.medio;
  return { value: count, reason: `Banda de ticket "${productProfile.ticket.band}" — ${count} variantes equilibran cobertura de ángulos creativos y esfuerzo de revisión.` };
}

/**
 * Frase en lenguaje natural — la capacidad objetivo del propietario. Vive
 * aquí (no en el CLI) para que cualquier futuro consumidor (app, informe)
 * pueda reutilizarla sin duplicar la lógica de construir el texto.
 * @param {object} recommendation
 * @param {object} productProfile
 * @returns {string}
 */
function explain(recommendation, productProfile) {
  const evidenceClause = recommendation.evidence.sampleSize > 0
    ? `Hay ${recommendation.evidence.sampleSize} campañas comparables registradas, pero el sistema todavía no aprende de ellas automáticamente (ver ROADMAP_V2.md).`
    : 'Todavía sin resultados propios registrados — esta recomendación se apoya solo en criterio (marketing-engine/knowledge/), no en datos.';

  return (
    `Para este producto (${productProfile.label}) recomiendo un ${recommendation.format} ` +
    `«${recommendation.campaignType}» para ${recommendation.platform} el ${recommendation.postingWindow}, ` +
    `porque ${lowerFirst(recommendation.reasons.campaignType)} ${evidenceClause}`
  );
}

function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

// === INICIO: SHADOW MODE — comparación, nunca sustitución ===
// Compara la Recommendation contra las decisiones REALES que tomó el
// pipeline para este job. Se llama al final del pipeline (intelligence/
// index.js → closeJob()), cuando job.state['director-creativo'] y
// job.state.copywriter ya son definitivos — nunca antes, para no comparar
// contra un estado que un bucle de vuelta (guardian-marca/control-calidad)
// todavía podría cambiar.
//
// Campos sin equivalente real en el pipeline hoy (campaignType,
// variantCount) van con actual:null, agree:null — nunca se inventa un
// valor solo para poder compararlo.
// === FIN: SHADOW MODE ===
function compareToActual(recommendation, job) {
  const directorCreativo = job.state['director-creativo'] || {};
  const copy = job.state.copywriter || {};

  const fields = [
    fieldComparison('format', recommendation.format, directorCreativo.postType || null, 'Tipo de publicación decidido por 01-director-creativo (CATEGORY_RULES + overrides del usuario).'),
    fieldComparison('platform', recommendation.platform, directorCreativo.channel || null, 'Canal decidido por 01-director-creativo.'),
    fieldComparison(
      'objective',
      recommendation.objective,
      job.input.objective || null,
      job.input.objective
        ? 'El usuario fijó el objetivo explícitamente en el formulario.'
        : 'El pipeline no decide un "objetivo" explícito cuando el usuario no lo fija — solo deriva el tono directamente de CATEGORY_RULES, sin pasar por un campo comparable.'
    ),
    fieldComparison('cta', recommendation.cta, copy.cta || null, 'CTA final decidido por 06-copywriter (CTA_BY_CHANNEL).'),
    fieldComparison('campaignType', recommendation.campaignType, null, 'El pipeline no elige un nombre de estrategia de campaña hoy — es un concepto exclusivo de intelligence/.'),
    fieldComparison('variantCount', String(recommendation.variantCount), null, 'El pipeline no genera variantes hoy — cifra exclusiva de intelligence/variant-engine/.'),
  ];

  const comparable = fields.filter((f) => f.actual !== null);
  const agreementCount = comparable.filter((f) => f.agree).length;

  const comparison = {
    generatedAt: new Date().toISOString(),
    mode: currentMode(),
    fields,
    comparableCount: comparable.length,
    agreementCount,
    agreementRate: comparable.length > 0 ? round2(agreementCount / comparable.length) : null,
    summary: buildSummary(comparable, agreementCount),
  };

  assertShape(comparison, SHADOW_COMPARISON_SHAPE, 'shadowComparison');
  return comparison;
}

function fieldComparison(field, recommended, actual, note) {
  const agree = actual === null ? null : normalize(actual) === normalize(recommended);
  return { field, recommended: String(recommended), actual: actual === null ? null : String(actual), agree, note };
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}

function buildSummary(comparable, agreementCount) {
  if (comparable.length === 0) {
    return 'Sin campos comparables en este job — no se puede evaluar el acuerdo entre la recomendación y la decisión real.';
  }

  const disagreements = comparable.filter((f) => !f.agree).map((f) => `${f.field} (recomendado: "${f.recommended}", real: "${f.actual}")`);

  if (disagreements.length === 0) {
    return `Acuerdo total: los ${comparable.length} campos comparables coinciden con la decisión real del pipeline.`;
  }

  return `${agreementCount}/${comparable.length} campos comparables coinciden. Discrepancias: ${disagreements.join('; ')}.`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { recommend, explain, compareToActual };
