// Estrategia "diagonal dinámico" — asimetría: el hero ocupa un bloque
// anclado a la derecha, el bloque de texto ocupa las columnas restantes a
// la izquierda. El punto de corte lo decide el span del elemento
// dominante (tier del hero), no un porcentaje tecleado — de ahí sale el
// acento diagonal que dibuja render-plan.js entre ambos bloques.
// compositionId que mapea aquí: diagonal-dinamica.

const { spanForTier, footerBleedBox, cellsToBox } = require('./_shared.js');

// `stackOrder` no se usa aquí (mismo parámetro que reciben las 6
// estrategias, ver strategies/index.js) — esta estrategia coloca por
// posición izquierda/derecha, no por apilado vertical, así que el orden
// de lectura no aplica a su geometría.
function computePlan(grid, tierByElement, elementIds, stackOrder) {
  const elements = [];

  const heroSpan = elementIds.includes('hero') ? spanForTier(grid, tierByElement.hero) : null;
  const heroColStart = heroSpan ? grid.columns - heroSpan.colSpan : grid.columns;
  const textColSpan = Math.max(3, heroColStart - 1); // -1 columna de calle entre ambos bloques

  if (elementIds.includes('logo')) {
    const span = spanForTier(grid, tierByElement.logo);
    elements.push({ elementId: 'logo', kind: 'chip', box: cellsToBox(grid, 0, span.colSpan, 0, span.rowSpan) });
  }

  if (heroSpan) {
    const heroRowStart = Math.max(0, Math.round((grid.rows - heroSpan.rowSpan) / 2));
    elements.push({ elementId: 'hero', kind: 'boxed', box: cellsToBox(grid, heroColStart, heroSpan.colSpan, heroRowStart, heroSpan.rowSpan) });
  }

  let cursorRow = Math.round(grid.rows * 0.42); // arranca el bloque de texto en la franja media — misma proporción para cualquier canvas
  if (elementIds.includes('title')) {
    const span = spanForTier(grid, tierByElement.title);
    elements.push({ elementId: 'title', kind: 'boxed', box: cellsToBox(grid, 0, Math.min(span.colSpan, textColSpan), cursorRow, span.rowSpan) });
    cursorRow += span.rowSpan;
  }

  if (elementIds.includes('cta')) {
    const span = spanForTier(grid, tierByElement.cta);
    elements.push({ elementId: 'cta', kind: 'boxed', box: cellsToBox(grid, 0, Math.min(span.colSpan, textColSpan), cursorRow, span.rowSpan) });
  }

  if (elementIds.includes('price')) {
    const span = spanForTier(grid, tierByElement.price);
    elements.push({ elementId: 'price', kind: 'boxed', box: cellsToBox(grid, grid.columns - span.colSpan, span.colSpan, 0, span.rowSpan) });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  // splitX en píxeles (no el índice de columna) — el renderer no conoce
  // el grid, solo geometría ya resuelta, mismo criterio que el resto del plan.
  const splitX = grid.originX + heroColStart * grid.cellWidth;
  return { elements, decorations: heroSpan ? [{ type: 'diagonal-accent', splitX }] : [] };
}

module.exports = { computePlan };
