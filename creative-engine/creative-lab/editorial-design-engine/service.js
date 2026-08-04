// Editorial Design Engine — decide recursos expresivos de dirección de
// arte que Art Direction Engine todavía no cubre: dónde crear tensión
// visual, cuándo romper la simetría, cuándo superponer elementos a
// propósito, cuándo dejar que el producto invada el lienzo, cuándo usar
// una banda de color. NO renderiza, NO genera imágenes, NO calcula
// geometría — eso lo siguen haciendo layout-composer/, los proveedores
// de imagen, y Composition Engine (layout-intelligence/)
// respectivamente. Este motor solo decide, sobre la base de lo que Art
// Direction Engine ya eligió (patrón, alineación) — nunca vuelve a
// decidir el patrón en sí, eso sería duplicar su responsabilidad.
//
// Orden real del pipeline (creative-lab/ARCHITECTURE.md, sprint "Design
// Evolution v2"): Creative Brief → Creative Lab → Art Direction Engine →
// Editorial Design Engine (este módulo) → Composition Engine
// (layout-intelligence/, obedece esta decisión igual que ya obedece la
// de Art Direction Engine) → Design Director Engine (revisa el
// resultado) → render (layout-composer/).

const {
  BREAK_SYMMETRY_ALIGNMENTS, TENSION_ZONE_BY_ALIGNMENT,
  OVERLAP_ALLOWANCE_PATTERNS, TITLE_HERO_MAX_OVERLAP_RATIO,
  BLEED_PATTERNS, COLOR_BAND_PATTERNS, COLOR_BAND_WIDTH_RATIO,
} = require('./config.js');

function resolveBleedEdge(tensionZone) {
  if (tensionZone.includes('left')) return 'left';
  if (tensionZone.includes('right')) return 'right';
  return 'top';
}

/**
 * @param {object} concept - concepto ganador de Creative Lab
 * @param {object} artDirection - ArtDirectionDecision de art-direction-engine/service.js#directArt
 * @returns {object} EditorialDecision — {breakSymmetry, tensionZone, allowOverlap, canvasBleed, bleedEdge, colorBand}
 */
function directEditorial(concept, artDirection) {
  const alignment = artDirection.alignment || 'center';
  const patternId = artDirection.patternId;

  const breakSymmetry = BREAK_SYMMETRY_ALIGNMENTS.includes(alignment);
  const tensionZone = TENSION_ZONE_BY_ALIGNMENT[alignment] || 'center';
  const bleedEdge = resolveBleedEdge(tensionZone);

  const allowOverlap = OVERLAP_ALLOWANCE_PATTERNS.includes(patternId)
    ? [{ a: 'title', b: 'hero', maxOverlapRatio: TITLE_HERO_MAX_OVERLAP_RATIO }]
    : [];

  const canvasBleed = BLEED_PATTERNS.includes(patternId);

  const colorBand = COLOR_BAND_PATTERNS.includes(patternId)
    ? { enabled: true, edge: bleedEdge === 'top' ? 'left' : bleedEdge, widthRatio: COLOR_BAND_WIDTH_RATIO }
    : { enabled: false, edge: null, widthRatio: 0 };

  return { breakSymmetry, tensionZone, allowOverlap, canvasBleed, bleedEdge, colorBand };
}

module.exports = { directEditorial };
