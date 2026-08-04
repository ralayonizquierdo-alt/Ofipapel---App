// Estrategia "cinematográfico full-bleed" — el hero es kind:'background-fill'
// (ocupa el canvas completo, incluidos los márgenes: es el fondo, no
// compite por hueco de grid). El resto de elementos flotan encima, en la
// franja inferior (título/cta) o en las esquinas (logo/precio).
// compositionId que mapean aquí: regla de tercios, capas de primer/segundo
// plano, línea de horizonte baja.

const { spanForTier, centerColStart, footerBleedBox, footerReservedRows, topRightCorner, fullCanvasBox, cellsToBox } = require('./_shared.js');
const { overlaps } = require('../grid.js');

// `stackOrder`/`editorial` no se usan aquí — el hero es kind:'background-fill'
// (no apila con nada, ya ocupa el canvas entero, nada que romper de
// simetría) y título/cta/iconos se anclan siempre a la franja inferior.
// `editorial` se acepta solo por consistencia de firma con el resto de
// estrategias (todas reciben las mismas 6 posiciones).
function computePlan(grid, tierByElement, elementIds, stackOrder, artDirection, editorial) {
  const elements = [];

  if (elementIds.includes('hero')) {
    elements.push({ elementId: 'hero', kind: 'background-fill', box: fullCanvasBox(grid) });
  }

  if (elementIds.includes('logo')) {
    const span = spanForTier(grid, tierByElement.logo);
    elements.push({ elementId: 'logo', kind: 'chip', box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, 0, span.rowSpan) });
  }

  // Título/CTA/iconos anclados a la franja inferior (por encima del
  // footer de contacto), no al centro — es lo que da la sensación
  // "cinematográfica".
  const titleSpan = elementIds.includes('title') ? spanForTier(grid, tierByElement.title) : null;
  const ctaSpan = elementIds.includes('cta') ? spanForTier(grid, tierByElement.cta) : null;
  const iconsSpan = elementIds.includes('icons') ? spanForTier(grid, tierByElement.icons) : null;
  const stackRows = (titleSpan ? titleSpan.rowSpan : 0) + (ctaSpan ? ctaSpan.rowSpan : 0) + (iconsSpan ? iconsSpan.rowSpan : 0);
  let cursorRow = grid.rows - stackRows - footerReservedRows(grid, elementIds.includes('contactFooter'));

  if (titleSpan) {
    elements.push({ elementId: 'title', kind: 'boxed', box: cellsToBox(grid, 0, Math.min(titleSpan.colSpan + 2, grid.columns), cursorRow, titleSpan.rowSpan) });
    cursorRow += titleSpan.rowSpan;
  }
  if (ctaSpan) {
    elements.push({ elementId: 'cta', kind: 'boxed', box: cellsToBox(grid, 0, ctaSpan.colSpan, cursorRow, ctaSpan.rowSpan) });
    cursorRow += ctaSpan.rowSpan;
  }
  if (iconsSpan) {
    elements.push({ elementId: 'icons', kind: 'icon-row', box: cellsToBox(grid, 0, Math.min(iconsSpan.colSpan + 2, grid.columns), cursorRow, iconsSpan.rowSpan) });
  }

  if (elementIds.includes('price')) {
    // Bug real encontrado tras doblar el tamaño del logo (sprint "Design
    // Eye v1"): el logo centrado y el precio en la esquina superior
    // derecha comparten fila 0 — con el logo más ancho, sus columnas
    // empezaban a invadir las del precio. Si la esquina natural choca
    // con el logo ya colocado, el precio baja justo debajo de él en vez
    // de solaparse sin declarar.
    const span = spanForTier(grid, tierByElement.price);
    const naive = topRightCorner(grid, span);
    const logoEl = elements.find((el) => el.elementId === 'logo');
    let box = naive;
    if (logoEl && overlaps(naive, logoEl.box)) {
      const rowsBelowLogo = Math.ceil((logoEl.box.y + logoEl.box.h - grid.originY) / grid.cellHeight);
      box = cellsToBox(grid, grid.columns - span.colSpan, span.colSpan, rowsBelowLogo, span.rowSpan);
    }
    elements.push({ elementId: 'price', kind: 'boxed', box });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [{ type: 'gradient-bottom' }] };
}

module.exports = { computePlan };
