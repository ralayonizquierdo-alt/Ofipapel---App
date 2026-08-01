// Prompt Composer — construye automáticamente el prompt completo a partir
// del CreativeBrief y los recursos ya resueltos por Asset Pipeline. Nunca
// hay prompts escritos a mano: cada sección es un módulo independiente
// (sections/) que sabe traducir SU parte del brief a lenguaje visual, y
// este servicio solo las orquesta en el orden declarado.

const { SECTION_ORDER, NEGATIVE_PROMPT_TERMS, SECTION_JOIN } = require('./config.js');

const BUILDERS = {
  product: require('./sections/product.js'),
  'creative-direction': require('./sections/creative-direction.js'),
  photography: require('./sections/photography.js'),
  'art-direction': require('./sections/art-direction.js'),
  brand: require('./sections/brand.js'),
  'product-intelligence': require('./sections/product-intelligence.js'),
  campaign: require('./sections/campaign.js'),
  copy: require('./sections/copy.js'),
  format: require('./sections/format.js'),
};

/**
 * @param {object} brief - CreativeBrief (ver ../brief/contracts.js)
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @returns {{sections: object[], fullPrompt: string, negativePrompt: string, wordCount: number, tokensApprox: number}}
 */
function composePrompt(brief, preparedAssets) {
  const sections = SECTION_ORDER
    .map((id) => BUILDERS[id].build(brief, preparedAssets))
    .filter(Boolean); // secciones sin datos suficientes se omiten, no rompen nada

  const fullPrompt = sections.map((s) => s.text).join(SECTION_JOIN);
  const negativePrompt = NEGATIVE_PROMPT_TERMS.join(', ');
  const wordCount = fullPrompt.split(/\s+/).filter(Boolean).length;

  return {
    sections,
    fullPrompt,
    negativePrompt,
    wordCount,
    // Aproximación heurística (palabras × 1.3) — explícitamente NO un
    // tokenizador real. Sirve para tener una cifra orientativa sin añadir
    // una dependencia npm por esto.
    tokensApprox: Math.round(wordCount * 1.3),
  };
}

module.exports = { composePrompt };
