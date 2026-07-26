// CreativeBrief — el ÚNICO contrato de entrada de creative-engine/, y el
// mecanismo real de independencia frente a marketing-engine/. Refleja
// ESTRUCTURALMENTE lo que ya producen los agentes/inteligencia de
// marketing-engine (director-creativo, director-arte, fotógrafo,
// Product Intelligence, Campaign Recommender) sin importar ni un solo
// fichero de allí — quien quiera alimentar un CreativeBrief con datos
// reales de marketing-engine usa brief/from-marketing-engine.js (un
// mapper que tampoco importa nada), o puede construirlo a mano.

const { assertShape, enumOf, arrayOf, maybe } = require('../shared/shapes.js');

const BRAND_ID = enumOf('ofipapel', 'canarias-ink', 'falcontrol');
const CONTENT_CLASS = enumOf('photo', 'art', 'video', 'template');
const POST_TYPE = enumOf('foto', 'carrusel', 'reel', 'story');
const PLATFORM = enumOf('instagram', 'facebook', 'whatsapp', 'ambas');

const CREATIVE_BRIEF_SHAPE = {
  product: {
    name: 'string',
    description: 'string',
    category: 'string',
  },
  brand: {
    id: BRAND_ID,
  },
  // Refleja agents/01-director-creativo (marketing-engine): la decisión
  // creativa ya tomada — creative-engine nunca decide esto, solo la
  // traduce a lenguaje visual (ver prompt-composer/sections/).
  creativeDirection: {
    strategy: 'string',
    tone: 'string',
    graphicFamily: 'string',
  },
  // Refleja agents/02-director-arte.
  artDirection: {
    composition: 'string',
    hierarchy: arrayOf('string'),
    structure: 'string',
    layoutId: 'string',
  },
  // Refleja agents/04-fotografo-publicitario. fidelityRules es crítico
  // para el check "presenciaProducto" de creative-validator/.
  photography: {
    angle: 'string',
    background: 'string',
    lighting: 'string',
    notes: 'string',
    fidelityRules: arrayOf('string'),
  },
  // Refleja marketing-engine/intelligence/ (Product Intelligence) —
  // opcional porque no todo brief pasa por esa capa.
  productIntelligence: maybe({
    benefits: arrayOf('string'),
    emotions: arrayOf('string'),
    salesArguments: arrayOf('string'),
    audienceSegment: 'string',
    ticketBand: 'string',
  }),
  // Refleja marketing-engine/intelligence/ (Campaign Recommender) —
  // opcional por el mismo motivo.
  campaign: maybe({
    objective: 'string',
    campaignType: 'string',
    creativeStyle: 'string',
    postingWindow: maybe('string'),
  }),
  // Texto tal cual — creative-engine nunca genera ni reescribe copy, solo
  // reserva espacio para él (ver prompt-composer/sections/copy.js y el
  // principio de "composición posterior" en ARCHITECTURE.md).
  copy: {
    title: 'string',
    body: 'string',
    cta: 'string',
    hashtags: arrayOf('string'),
    price: maybe('string'),
  },
  format: {
    contentClass: CONTENT_CLASS,
    postType: POST_TYPE,
    platform: PLATFORM,
  },
};

/**
 * Valida un input y devuelve el CreativeBrief. Lanza si no cumple
 * CREATIVE_BRIEF_SHAPE — mismo criterio que core/contracts/job.contract.js
 * → createJob() en marketing-engine (validar en la frontera, fallar rápido
 * y con mensaje claro).
 * @param {object} input
 * @returns {object} CreativeBrief
 */
function createBrief(input) {
  assertShape(input, CREATIVE_BRIEF_SHAPE, 'brief');
  return input;
}

module.exports = { CREATIVE_BRIEF_SHAPE, BRAND_ID, CONTENT_CLASS, POST_TYPE, PLATFORM, createBrief };
