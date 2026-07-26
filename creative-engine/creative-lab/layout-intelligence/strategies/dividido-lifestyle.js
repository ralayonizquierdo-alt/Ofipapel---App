// Estrategia "dividido lifestyle" — pantalla partida: el hero ocupa una
// banda horizontal superior (SPLIT_SCREEN_RATIO de las filas, config.js),
// el resto de elementos vive en la banda inferior restante.
// compositionId que mapean aquí: encuadre cerrado en el detalle, encuadre
// abierto con contexto, composición en L, asimetría equilibrada.

const { spanForTier, centerColStart, footerBleedBox, topRightCorner, cellsToBox, SPLIT_SCREEN_RATIO } = require('./_shared.js');

// `stackOrder` no se usa aquí — el hero siempre ocupa la banda superior
// completa (split screen) y el resto se centra en la banda inferior.
function computePlan(grid, tierByElement, elementIds, stackOrder) {
  const elements = [];
  const splitRow = Math.round(grid.rows * SPLIT_SCREEN_RATIO);

  if (elementIds.includes('hero')) {
    elements.push({ elementId: 'hero', kind: 'boxed', box: cellsToBox(grid, 0, grid.columns, 0, splitRow) });
  }

  if (elementIds.includes('logo')) {
    const span = spanForTier(grid, tierByElement.logo);
    elements.push({ elementId: 'logo', kind: 'chip', box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, 0, span.rowSpan) });
  }

  if (elementIds.includes('price')) {
    const span = spanForTier(grid, tierByElement.price);
    elements.push({ elementId: 'price', kind: 'boxed', box: topRightCorner(grid, span) });
  }

  let cursorRow = splitRow + 1;
  if (elementIds.includes('title')) {
    const span = spanForTier(grid, tierByElement.title);
    elements.push({ elementId: 'title', kind: 'boxed', box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, cursorRow, span.rowSpan) });
    cursorRow += span.rowSpan;
  }
  if (elementIds.includes('cta')) {
    const span = spanForTier(grid, tierByElement.cta);
    elements.push({ elementId: 'cta', kind: 'boxed', box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, cursorRow, span.rowSpan) });
    cursorRow += span.rowSpan;
  }
  if (elementIds.includes('icons')) {
    const span = spanForTier(grid, tierByElement.icons);
    elements.push({ elementId: 'icons', kind: 'icon-row', box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, cursorRow, span.rowSpan) });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [] };
}

module.exports = { computePlan };
