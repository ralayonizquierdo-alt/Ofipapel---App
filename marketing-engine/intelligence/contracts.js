// Formas de todo lo que produce marketing-engine/intelligence/, en un
// único fichero — mismo criterio que core/contracts/job.contract.js (que
// agrupa JOB_INPUT_SHAPE/JOB_SHAPE/AGENT_RESULT_SHAPE juntas porque son
// varias formas relacionadas de UN solo contrato), y deliberadamente NO el
// patrón interface.js por agente (un fichero de contrato por carpeta).
//
// La diferencia de fondo: cada agents/0N-*/interface.js existe porque ESE
// agente es un paso de pipeline independientemente sustituible que cruza
// la frontera de sobre uniforme que valida el orquestador
// (AGENT_RESULT_SHAPE). Los componentes de intelligence/ nunca cruzan esa
// frontera — no son pasos de PIPELINE, no tienen returnTo/reason, no se
// intercambian por id como los proveedores de core/providers/registry.js.
// Son una única capa cohesionada con un solo punto de entrada
// (intelligence/index.js). Cinco ficheros interface.js aquí serían
// ceremonia sin la razón que los justifica en agents/.

const { assertShape, enumOf, arrayOf, maybe } = require('../core/contracts/shapes.js');

// Mismos valores que core/contracts/job.contract.js (JOB_INPUT_SHAPE) —
// redeclarados aquí, no importados, por el mismo motivo por el que
// agents/01-director-creativo/interface.js redeclara su propio
// enumOf('foto','carrusel','reel') en vez de importar el de job.contract.js:
// cada contrato es responsable de su propia forma, aunque el vocabulario
// coincida. Si el vocabulario diverge alguna vez, cada capa lo nota por su
// cuenta al validar — no hay un import roto en cascada.
const POST_TYPE = enumOf('foto', 'carrusel', 'reel');
const OBJECTIVE = enumOf('vender', 'emocionar', 'sorprender', 'minimalista');
const CHANNEL = enumOf('instagram', 'facebook', 'whatsapp', 'ambas');
const TICKET_BAND = enumOf('bajo', 'medio', 'alto');

const PRODUCT_PROFILE_SHAPE = {
  categoryKey: 'string',
  resolvedVia: enumOf('directo', 'keyword-hints', 'fallback'),
  confidence: 'number',
  label: 'string',
  benefits: arrayOf('string'),
  objections: arrayOf({ objection: 'string', answeredBy: arrayOf('string') }),
  audience: {
    segment: 'string',
    role: 'string',
    buyingContext: 'string',
    decisionDriver: 'string',
  },
  seasonality: {
    activeEvents: arrayOf({ id: 'string', strategy: 'string', urgency: 'string' }),
    note: 'string',
  },
  ticket: {
    band: TICKET_BAND,
    impulseBuy: 'boolean',
    note: 'string',
  },
  complementary: arrayOf('string'),
  emotions: arrayOf('string'),
  salesArguments: arrayOf('string'),
  strategyAffinity: arrayOf('string'),
};

const RECOMMENDATION_SHAPE = {
  objective: OBJECTIVE,
  campaignType: 'string', // nombre de estrategia, ver knowledge/campaign-strategies.md
  format: POST_TYPE,
  platform: CHANNEL,
  creativeStyle: 'string',
  cta: 'string',
  postingWindow: 'string',
  variantCount: 'number',
  reasons: {
    objective: 'string',
    campaignType: 'string',
    format: 'string',
    platform: 'string',
    creativeStyle: 'string',
    cta: 'string',
    postingWindow: 'string',
    variantCount: 'string',
  },
  evidence: {
    biasApplied: 'boolean',
    sampleSize: 'number',
    note: 'string',
  },
  jobInputOverrides: {
    postTypeOverride: POST_TYPE,
    objective: OBJECTIVE,
    creativeStyleHint: 'string',
    channel: CHANNEL,
  },
};

const VARIANT_SHAPE = {
  id: 'string',
  archetype: 'string',
  label: 'string',
  knowledgeRef: { doc: 'string', section: 'string', name: 'string' },
  reasoning: 'string',
  jobInputOverrides: {
    postTypeOverride: POST_TYPE,
    objective: OBJECTIVE,
    creativeStyleHint: 'string',
    channel: CHANNEL,
  },
};

const SCORE_CRITERION_SHAPE = {
  id: 'string',
  points: 'number',
  earned: 'number',
  passed: 'boolean',
  detail: 'string',
  fix: maybe('string'),
};

const SCORE_DIMENSION_SHAPE = {
  id: 'string',
  label: 'string',
  weight: 'number',
  score: 'number',
  confidence: enumOf('medida', 'proxy'),
  criteria: arrayOf(SCORE_CRITERION_SHAPE),
};

const CREATIVE_SCORE_SHAPE = {
  total: 'number',
  band: enumOf('insuficiente', 'mejorable', 'bueno', 'excelente'),
  confidence: 'number',
  dimensions: arrayOf(SCORE_DIMENSION_SHAPE),
  strengths: arrayOf('string'),
  weaknesses: arrayOf({ dimension: 'string', criterion: 'string', detail: 'string', fix: 'string' }),
  scoredAt: 'string',
  version: 'string',
};

// Shadow Mode (ver mode.js): compara lo que intelligence/ habría decidido
// contra lo que el pipeline decidió DE VERDAD, campo a campo. No todos los
// campos de una Recommendation tienen un equivalente real en el pipeline
// hoy (p.ej. campaignType o variantCount no existen como decisión del
// pipeline) — en esos casos `actual` y `agree` van a null, nunca se
// inventa un valor para poder comparar.
const SHADOW_FIELD_SHAPE = {
  field: 'string',
  recommended: 'string',
  actual: maybe('string'),
  agree: maybe('boolean'),
  note: 'string',
};

const SHADOW_COMPARISON_SHAPE = {
  generatedAt: 'string',
  mode: enumOf('shadow', 'decision'),
  fields: arrayOf(SHADOW_FIELD_SHAPE),
  comparableCount: 'number',
  agreementCount: 'number',
  agreementRate: maybe('number'),
  summary: 'string',
};

// Learning Engine — solo estructura, ver learning-engine/service.js. Estas
// formas son las que un día alimentará un "registrar resultados" real
// desde el Almacén; hoy solo recordCampaign() escribe automáticamente
// (al final de cada pipeline, vía closeJob()) — recordOutcome() no la
// llama nada todavía.
const CAMPAIGN_RECORD_SHAPE = {
  jobId: 'string',
  recordedAt: 'string',
  version: 'string',
  input: {
    productName: 'string',
    categoryKey: 'string',
    brand: 'string',
    channel: 'string',
  },
  recommendation: {
    campaignType: 'string',
    format: POST_TYPE,
    platform: CHANNEL,
    postingWindow: 'string',
  },
  pipelineDecisions: {
    postType: POST_TYPE,
    tone: 'string',
    channel: CHANNEL,
    graphicFamily: 'string',
  },
  shadowComparison: maybe('object'),
  creativeScoreTotal: maybe('number'),
  outcome: maybe('object'),
};

const OUTCOME_SHAPE = {
  jobId: 'string',
  recordedAt: 'string',
  reach: maybe('number'),
  impressions: maybe('number'),
  clicks: maybe('number'),
  engagement: maybe('number'),
  sales: maybe('number'),
  revenue: maybe('number'),
  source: maybe('string'),
  notes: maybe('string'),
};

module.exports = {
  POST_TYPE,
  OBJECTIVE,
  CHANNEL,
  TICKET_BAND,
  PRODUCT_PROFILE_SHAPE,
  RECOMMENDATION_SHAPE,
  VARIANT_SHAPE,
  SHADOW_COMPARISON_SHAPE,
  CREATIVE_SCORE_SHAPE,
  CAMPAIGN_RECORD_SHAPE,
  OUTCOME_SHAPE,
  assertShape,
};
