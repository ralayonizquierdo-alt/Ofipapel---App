// Estrategia "flotante minimalista" — espacio negativo dominante: hero y
// título ceden un tier de tamaño (nunca "dominante" en esta estrategia,
// es su rasgo distintivo) para dejar mucho margen respirado alrededor.
// compositionId que mapea aquí: espacio-negativo-dominante.

const { stackVertically, footerBleedBox, topRightCorner, headerRowSpan, spanForTier } = require('./_shared.js');
const { TIER_ORDER } = require('../hierarchy.js');

function downgradeOnceIfDominant(tier) {
  if (tier !== 'dominante') return tier;
  return TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
}

function computePlan(grid, tierByElement, elementIds, stackOrder) {
  const startRow = Math.round(grid.rows * 0.16); // respiro superior — parte del rasgo distintivo
  const { elements } = stackVertically(grid, stackOrder, tierByElement, startRow, downgradeOnceIfDominant);

  if (elementIds.includes('price')) {
    const span = spanForTier(grid, tierByElement.price);
    // El precio comparte cabecera con el primer elemento del apilado,
    // pero esta estrategia arranca en `startRow` (no en 0) — el límite de
    // altura debe respetar ese mismo desplazamiento.
    elements.push({ elementId: 'price', kind: 'boxed', box: topRightCorner(grid, span, startRow + headerRowSpan(grid, stackOrder, tierByElement)) });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [] };
}

module.exports = { computePlan };
