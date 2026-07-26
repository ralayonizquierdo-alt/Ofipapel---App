// Registro de las 6 estrategias de equilibrio — mismo patrón que tenía
// layout-composer/config.js#ARCHETYPES, ahora apuntando a
// `computePlan(grid, tierByElement, elementIds)` (geometría) en vez de
// `buildHtml(data)` (HTML final).

const STRATEGIES = {
  'centrado-clasico': require('./centrado-clasico.js'),
  'diagonal-dinamico': require('./diagonal-dinamico.js'),
  'flotante-minimalista': require('./flotante-minimalista.js'),
  'flat-lay-editorial': require('./flat-lay-editorial.js'),
  'cinematico-fullbleed': require('./cinematico-fullbleed.js'),
  'dividido-lifestyle': require('./dividido-lifestyle.js'),
};

module.exports = { STRATEGIES };
