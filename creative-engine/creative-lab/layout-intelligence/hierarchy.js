// Jerarquía visual computada — traduce datos que YA existen en el brief y
// en el concepto ganador a (a) un tier de TAMAÑO por elemento (dominante >
// primario > secundario > mínimo) y (b) un ORDEN DE APILADO de arriba a
// abajo para las estrategias que colocan los elementos en columna.
//
// IMPORTANTE (corregido tras verificación empírica — ver
// ARCHITECTURE.md): brief.artDirection.hierarchy NO es un ranking de
// importancia/tamaño. Es el orden de lectura de arriba a abajo que ya usa
// marketing-engine/agents/02-director-arte (p.ej.
// ['logo','producto','titular','eslogan'] para "logo arriba, producto en
// medio, texto abajo" — verificado contra sus dos presets reales en
// config.js). Una primera versión de este fichero lo trataba como tamaño
// (índice 0 = elemento más grande) y eso hacía que el LOGO saliera más
// grande que el producto — detectado con un test sintético antes de
// tocar layout-composer/, corregido aquí. El tamaño se decide con
// defaults fijos y sensatos (el producto es casi siempre el protagonista
// de un anuncio, el logo casi nunca), no con la posición en el array.

const { FIXED_TIER_BY_ELEMENT, TEXT_EMPHASIS_BY_TEXTSPACE, DEFAULT_TEXT_EMPHASIS } = require('./config.js');

const TIER_ORDER = ['minimo', 'secundario', 'primario', 'dominante'];

// Traducción de las etiquetas en español de marketing-engine a los
// elementIds que maneja creative-lab — "eslogan"/"badges de
// características"/"eyebrow" no tienen elemento propio hoy, se funden en
// la posición de "title" a efectos de orden (documentado, no un tamaño).
const HIERARCHY_LABEL_TO_ELEMENT = {
  logo: 'logo',
  'logo+oferta': 'logo',
  producto: 'hero',
  titular: 'title',
  eslogan: 'title',
  'badges de características': 'title',
  eyebrow: 'title',
  cta: 'cta',
  // 'oferta' deliberadamente NO se mapea a 'price': en las 6 estrategias
  // el precio es siempre un badge de esquina (ver strategies/_shared.js#topRightCorner),
  // nunca un elemento apilado en columna — mezclarlo en el stackOrder
  // complicaría las estrategias sin aportar nada.
};

// Tamaño por defecto — el producto es el protagonista visual de un
// anuncio; el logo es una marca de agua de identidad, no el hero.
const DEFAULT_TIER_BY_ELEMENT = { hero: 'dominante', title: 'primario', logo: 'minimo', cta: 'secundario' };

// Orden de apilado por defecto cuando brief.artDirection.hierarchy no
// cubre algún elemento presente (p.ej. price, que no está en el
// vocabulario de marketing-engine).
const DEFAULT_STACK_ORDER = ['logo', 'hero', 'title', 'cta'];

function clampTierIndex(idx) {
  return Math.max(0, Math.min(TIER_ORDER.length - 1, idx));
}

function upgrade(tier) {
  return TIER_ORDER[clampTierIndex(TIER_ORDER.indexOf(tier) + 1)];
}

function downgrade(tier) {
  return TIER_ORDER[clampTierIndex(TIER_ORDER.indexOf(tier) - 1)];
}

/** Orden de apilado de arriba a abajo: primero lo que brief.artDirection.hierarchy indica (traducido y filtrado a los elementos realmente presentes), luego cualquier elemento presente que ese array no mencionara, en el orden por defecto. */
function computeStackOrder(hierarchyLabels, elementIds) {
  const fromArtDirection = [];
  for (const label of hierarchyLabels || []) {
    const elementId = HIERARCHY_LABEL_TO_ELEMENT[label];
    if (elementId && elementIds.includes(elementId) && !fromArtDirection.includes(elementId)) {
      fromArtDirection.push(elementId);
    }
  }
  const rest = DEFAULT_STACK_ORDER.filter((id) => elementIds.includes(id) && !fromArtDirection.includes(id));
  return [...fromArtDirection, ...rest];
}

/**
 * @param {object} concept - concepto ganador (usa concept.textSpaceId)
 * @param {object} brief - CreativeBrief (usa brief.artDirection.hierarchy para el ORDEN, no el tamaño)
 * @param {string[]} elementIds - elementos que layout-composer necesita colocar (p.ej. ['hero','logo','title','cta','price','contactFooter'], según haya dato)
 * @returns {{tierByElement: Record<string,string>, stackOrder: string[], textEmphasis: string}}
 */
function computeHierarchy(concept, brief, elementIds) {
  const textEmphasis = TEXT_EMPHASIS_BY_TEXTSPACE[concept.textSpaceId] || DEFAULT_TEXT_EMPHASIS;
  const stackOrder = computeStackOrder(brief.artDirection && brief.artDirection.hierarchy, elementIds);

  const tierByElement = {};
  for (const elementId of elementIds) {
    let tier = FIXED_TIER_BY_ELEMENT[elementId] || DEFAULT_TIER_BY_ELEMENT[elementId] || 'secundario';

    // concept.textSpaceId ajusta específicamente el titular — el resto de
    // elementos no dependen del énfasis tipográfico del concepto.
    if (elementId === 'title') {
      if (textEmphasis === 'dominante') tier = upgrade(tier);
      else if (textEmphasis === 'minimo') tier = downgrade(tier);
    }

    tierByElement[elementId] = tier;
  }

  return { tierByElement, stackOrder, textEmphasis };
}

module.exports = { computeHierarchy, TIER_ORDER };
