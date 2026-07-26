// Art Direction Engine — piensa como un director de arte ANTES de que
// Composition Engine (layout-intelligence/) toque un solo grid. Decide:
// qué patrón editorial encaja, qué elementos sobran, cuánto debe crecer
// la fotografía, cuánto aire necesita la pieza, y qué iconos (si acaso)
// aportan información real. Nunca calcula posiciones — eso lo sigue
// haciendo Composition Engine, ahora obedeciendo estas decisiones en vez
// de partir de cero.
//
// Orden real del pipeline (creative-lab/index.js#runCreativeLab):
// Creative Brief → Creative Lab (concepto ganador) → Art Direction Engine
// (este módulo) → Composition Engine (layout-intelligence/) → render
// (layout-composer/).

const { PATTERNS, DEFAULT_PATTERN_ID } = require('./patterns.js');
const { ICONS } = require('./icons.js');

// Elementos de negocio ya exigidos explícitamente por el propietario en
// un sprint anterior (precio, contacto, la foto en sí) — Art Direction
// Engine puede recortar CHROME visual (iconos, cta, logo, título si
// sobra), nunca contenido de negocio ya decidido. "Si un elemento no
// aporta valor, se elimina" se aplica al ornamento, no a lo que el
// propietario ya pidió explícitamente que apareciera.
const PROTECTED_ELEMENTS = new Set(['hero', 'price', 'contactFooter']);

// Orden de recorte cuando la pieza supera pattern.maxElements — se quita
// primero lo más prescindible. Los iconos NO encabezan la lista: solo
// llegan a ser candidatos cuando el patrón ya decidió que encajan
// (`allowIcons`) y hay señal real en el texto — si el propio patrón los
// quiso, no son lo primero que sobra. Un CTA de texto es más prescindible
// que una fila de iconos con información real, y ambos más que el logo.
const CUT_PRIORITY = ['cta', 'logo', 'icons', 'title'];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function normalizedTags(brief) {
  return [
    brief.product && brief.product.category,
    brief.productIntelligence && brief.productIntelligence.audienceSegment,
    brief.campaign && brief.campaign.campaignType,
    brief.campaign && brief.campaign.objective,
    brief.creativeDirection && brief.creativeDirection.graphicFamily,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
}

function tagOverlapScore(pattern, wantedTags) {
  return pattern.tags.reduce((sum, tag) => sum + (wantedTags.includes(tag) ? 1 : 0), 0);
}

/**
 * Elige el patrón editorial que mejor encaja — determinista (hash de
 * desempate, nunca Math.random, mismo criterio que concept-generator/).
 * Con fotografía real, prima que el patrón deje protagonismo real a la
 * foto (heroTreatment distinto de 'framed-minimal') — "cuando exista
 * fotografía lifestyle real, debe dominar la composición".
 * @param {object} concept
 * @param {object} brief
 * @param {boolean} hasRealPhoto
 */
function selectPattern(concept, brief, hasRealPhoto) {
  const wantedTags = normalizedTags(brief);

  const scored = PATTERNS.map((pattern) => {
    let score = tagOverlapScore(pattern, wantedTags) * 10;
    if (hasRealPhoto && pattern.heroTreatment !== 'framed-minimal') score += 5;
    if (hasRealPhoto && pattern.tags.includes('lifestyle')) score += 8;
    return { pattern, score, tie: hashString(`${pattern.id}::${concept.conceptId}`) };
  });

  scored.sort((a, b) => b.score - a.score || a.tie - b.tie);
  return scored[0] ? scored[0].pattern : PATTERNS.find((p) => p.id === DEFAULT_PATTERN_ID);
}

/**
 * "Todo elemento debe justificar su existencia. Si al quitarlo la imagen
 * mejora, ese elemento nunca debió estar." Recorta chrome visual hasta
 * caber en pattern.maxElements — nunca toca hero/price/contactFooter.
 * @param {string[]} elementIds
 * @param {object} pattern
 */
function decideElements(elementIds, pattern) {
  let kept = [...elementIds];
  for (const candidate of CUT_PRIORITY) {
    if (kept.length <= pattern.maxElements) break;
    if (kept.includes(candidate) && !PROTECTED_ELEMENTS.has(candidate)) {
      kept = kept.filter((id) => id !== candidate);
    }
  }
  return kept;
}

/**
 * Selecciona hasta pattern.maxIcons iconos — solo si el patrón los
 * admite Y hay señal real en el texto del brief (nunca relleno). "Cuándo
 * NO usarlos" se cumple por construcción: sin coincidencias, sin iconos.
 * @param {object} pattern
 * @param {object} brief
 */
function selectIcons(pattern, brief) {
  if (!pattern.allowIcons || pattern.maxIcons === 0) return [];

  const searchText = [
    brief.product && brief.product.description,
    ...((brief.productIntelligence && brief.productIntelligence.benefits) || []),
    ...((brief.productIntelligence && brief.productIntelligence.salesArguments) || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matched = ICONS.filter((icon) => icon.keywords.some((kw) => searchText.includes(kw)));
  return matched.slice(0, pattern.maxIcons);
}

/**
 * Punto de entrada único de Art Direction Engine.
 * @param {object} concept - concepto ganador de Creative Lab
 * @param {object} brief - CreativeBrief
 * @param {string[]} candidateElementIds - elementos con dato real detrás (hero/logo/title/cta/price/contactFooter), ver layout-composer/service.js#resolveElementIds
 * @param {boolean} hasRealPhoto - true si el hero es una fotografía real (no un placeholder abstracto)
 * @returns {object} ArtDirectionDecision
 */
function directArt(concept, brief, candidateElementIds, hasRealPhoto) {
  const pattern = selectPattern(concept, brief, hasRealPhoto);
  const icons = selectIcons(pattern, brief);
  const withIcons = icons.length > 0 ? [...candidateElementIds, 'icons'] : candidateElementIds;
  const keepElementIds = decideElements(withIcons, pattern);

  return {
    patternId: pattern.id,
    patternLabel: pattern.label,
    heroTreatment: pattern.heroTreatment,
    heroSize: pattern.heroSize,
    whitespaceTarget: pattern.whitespaceTarget,
    marginRatio: pattern.marginRatio,
    allowCard: pattern.allowCard,
    alignment: pattern.alignment,
    preferredStrategies: pattern.preferredStrategies,
    keepElementIds,
    icons: keepElementIds.includes('icons') ? icons : [],
    droppedElementIds: candidateElementIds.filter((id) => !keepElementIds.includes(id)),
  };
}

module.exports = { directArt, selectPattern, decideElements, selectIcons };
