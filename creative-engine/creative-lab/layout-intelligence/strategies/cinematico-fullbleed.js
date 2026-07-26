// Estrategia "cinematográfico full-bleed" — el hero es kind:'background-fill'
// (ocupa el canvas completo, incluidos los márgenes: es el fondo, no
// compite por hueco de grid). El resto de elementos flotan encima, en la
// franja inferior (título/cta) o en las esquinas (logo/precio).
// compositionId que mapean aquí: regla de tercios, capas de primer/segundo
// plano, línea de horizonte baja.

const { spanForTier, centerColStart, footerBleedBox, topRightCorner, fullCanvasBox, cellsToBox } = require('./_shared.js');

// `stackOrder` no se usa aquí — el hero es kind:'background-fill' (no
// apila con nada) y título/cta se anclan siempre a la franja inferior.
function computePlan(grid, tierByElement, elementIds, stackOrder) {
  const elements = [];

  if (elementIds.includes('hero')) {
    elements.push({ elementId: 'hero', kind: 'background-fill', box: fullCanvasBox(grid) });
  }

  if (elementIds.includes('logo')) {
    const span = spanForTier(grid, tierByElement.logo);
    elements.push({ elementId: 'logo', kind: 'chip', box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, 0, span.rowSpan) });
  }

  // Título/CTA anclados a la franja inferior (por encima del footer de
  // contacto), no al centro — es lo que da la sensación "cinematográfica".
  const titleSpan = elementIds.includes('title') ? spanForTier(grid, tierByElement.title) : null;
  const ctaSpan = elementIds.includes('cta') ? spanForTier(grid, tierByElement.cta) : null;
  const stackRows = (titleSpan ? titleSpan.rowSpan : 0) + (ctaSpan ? ctaSpan.rowSpan : 0);
  let cursorRow = grid.rows - stackRows;

  if (titleSpan) {
    elements.push({ elementId: 'title', kind: 'boxed', box: cellsToBox(grid, 0, Math.min(titleSpan.colSpan + 2, grid.columns), cursorRow, titleSpan.rowSpan) });
    cursorRow += titleSpan.rowSpan;
  }
  if (ctaSpan) {
    elements.push({ elementId: 'cta', kind: 'boxed', box: cellsToBox(grid, 0, ctaSpan.colSpan, cursorRow, ctaSpan.rowSpan) });
  }

  if (elementIds.includes('price')) {
    const span = spanForTier(grid, tierByElement.price);
    elements.push({ elementId: 'price', kind: 'boxed', box: topRightCorner(grid, span) });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [{ type: 'gradient-bottom' }] };
}

module.exports = { computePlan };
