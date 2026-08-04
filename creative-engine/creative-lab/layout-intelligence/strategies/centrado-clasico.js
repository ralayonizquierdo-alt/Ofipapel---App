// Estrategia "centrado clásico" — simetría: todo centrado horizontalmente,
// apilado verticalmente en el orden de lectura real (logo/hero/título/cta,
// ver hierarchy.js#computeStackOrder). compositionId que mapean aquí
// (config.js): simetría centrada, triangular estable, radial desde
// producto.

const { stackVertically, footerBleedBox, footerReservedRows, topRightCorner, headerRowSpan, spanForTier } = require('./_shared.js');

function computePlan(grid, tierByElement, elementIds, stackOrder, artDirection, editorial) {
  const maxRow = grid.rows - footerReservedRows(grid, elementIds.includes('contactFooter'));
  const { elements } = stackVertically(grid, stackOrder, tierByElement, 0, undefined, artDirection, editorial, maxRow);

  if (elementIds.includes('price')) {
    const span = spanForTier(grid, tierByElement.price);
    const heroEl = elements.find((el) => el.elementId === 'hero');
    elements.push({ elementId: 'price', kind: 'boxed', box: topRightCorner(grid, span, headerRowSpan(grid, stackOrder, tierByElement), heroEl && heroEl.box) });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [] };
}

module.exports = { computePlan };
