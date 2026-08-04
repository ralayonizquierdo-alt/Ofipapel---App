// Estrategia "flat-lay editorial" — "marco dentro del marco": todo vive
// dentro de un sub-grid con un borde propio (insetGrid), distinto del
// margen estructural del canvas — de ahí la sensación de pieza
// curada/enmarcada. compositionId que mapean aquí: flat-lay, patrón por
// repetición, marco dentro del marco.

const { stackVertically, footerBleedBox, footerReservedRows, headerRowSpan, insetGrid, spanForTier, topRightCorner } = require('./_shared.js');

function computePlan(grid, tierByElement, elementIds, stackOrder, artDirection, editorial) {
  const frame = insetGrid(grid);
  // footerReservedRows() se calcula sobre `grid` (el footer real está
  // tasado en HIERARCHY_TIER_SPANS.minimo del CANVAS, no del marco
  // interior) pero el recuento de filas resultante es válido también
  // para `frame`: insetGrid() nunca toca cellHeight, solo origin/columns/
  // rows/interior — misma unidad de fila en ambos.
  const maxRow = frame.rows - footerReservedRows(grid, elementIds.includes('contactFooter'));
  const { elements } = stackVertically(frame, stackOrder, tierByElement, 0, undefined, artDirection, editorial, maxRow);

  if (elementIds.includes('price')) {
    const span = spanForTier(frame, tierByElement.price);
    const rowSpan = Math.min(span.rowSpan, headerRowSpan(frame, stackOrder, tierByElement));
    const heroEl = elements.find((el) => el.elementId === 'hero');
    elements.push({ elementId: 'price', kind: 'boxed', box: topRightCorner(frame, span, rowSpan, heroEl && heroEl.box) });
  }

  // El footer sigue a sangre completa del CANVAS (no del marco interior) —
  // es la única pieza que rompe el marco a propósito, mismo criterio que
  // en el resto de estrategias.
  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [{ type: 'frame-border', box: { x: frame.originX, y: frame.originY, w: frame.interiorWidth, h: frame.interiorHeight } }] };
}

module.exports = { computePlan };
