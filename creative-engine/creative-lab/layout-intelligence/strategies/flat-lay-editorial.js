// Estrategia "flat-lay editorial" — "marco dentro del marco": todo vive
// dentro de un sub-grid con un borde propio (insetGrid), distinto del
// margen estructural del canvas — de ahí la sensación de pieza
// curada/enmarcada. compositionId que mapean aquí: flat-lay, patrón por
// repetición, marco dentro del marco.

const { stackVertically, footerBleedBox, headerRowSpan, insetGrid, cellsToBox, spanForTier } = require('./_shared.js');

function computePlan(grid, tierByElement, elementIds, stackOrder, artDirection) {
  const frame = insetGrid(grid);
  const { elements } = stackVertically(frame, stackOrder, tierByElement, 0, undefined, artDirection);

  if (elementIds.includes('price')) {
    const span = spanForTier(frame, tierByElement.price);
    const rowSpan = Math.min(span.rowSpan, headerRowSpan(frame, stackOrder, tierByElement));
    elements.push({ elementId: 'price', kind: 'boxed', box: cellsToBox(frame, frame.columns - span.colSpan, span.colSpan, 0, rowSpan) });
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
