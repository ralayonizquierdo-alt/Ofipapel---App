// Component Library — selección determinista de variante. Nunca decide
// posición (layout-intelligence/) ni contenido (brief) — solo QUÉ
// tratamiento visual usar para un elemento que ya tiene caja y datos
// reales, a partir de una semilla (normalmente conceptId+patternId, ver
// layout-composer/render-plan.js#buildHtmlFromPlan) para que la misma
// campaña siempre se vea igual (reproducible) pero campañas distintas
// casi nunca coincidan en la misma variante para el mismo componente.

const { VARIANT_IDS } = require('./variants.js');

// Duplicado deliberado de hashString (mismo patrón ya usado en
// art-direction-engine/service.js y concept-generator/service.js: cada
// módulo de selección determinista repite estas 3 líneas en vez de crear
// un util compartido para tan poco código).
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {string} componentType - uno de config.js#COMPONENT_TYPES
 * @param {string} seed - normalmente `${conceptId}::${patternId}`
 * @returns {string|null} id de variante (variants.js#VARIANT_IDS), o null si el tipo no existe
 */
function selectVariant(componentType, seed) {
  const options = VARIANT_IDS[componentType];
  if (!options || options.length === 0) return null;
  const idx = hashString(`${componentType}::${seed || ''}`) % options.length;
  return options[idx];
}

module.exports = { selectVariant };
