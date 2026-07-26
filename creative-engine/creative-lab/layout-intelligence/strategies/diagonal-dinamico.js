// Estrategia "diagonal dinámico" — asimetría: el hero ocupa un bloque
// anclado a la derecha, el bloque de texto ocupa las columnas restantes a
// la izquierda. El punto de corte lo decide el span del hero (tamaño de
// Art Direction Engine si existe, si no el tier genérico), no un
// porcentaje tecleado — de ahí sale el acento diagonal que dibuja
// render-plan.js entre ambos bloques.
// compositionId que mapea aquí: diagonal-dinamica.

const { spanForTier, heroSpan, footerBleedBox, cellsToBox } = require('./_shared.js');

// `stackOrder` no se usa aquí — esta estrategia coloca por posición
// izquierda/derecha, no por apilado vertical, así que el orden de
// lectura no aplica a su geometría. `editorial.tensionZone` sí decide
// DE QUÉ LADO va cada bloque: por defecto el hero ancla a la derecha,
// pero si Editorial Design Engine puso la tensión en 'top-left', se
// invierte (hero a la izquierda, texto a la derecha) — variedad real,
// no una regla fija tecleada una vez.
function computePlan(grid, tierByElement, elementIds, stackOrder, artDirection, editorial) {
  const elements = [];
  const heroOnLeft = Boolean(editorial && editorial.tensionZone === 'top-left');

  const hero = elementIds.includes('hero') ? heroSpan(grid, tierByElement, artDirection) : null;
  const heroColStart = hero ? (heroOnLeft ? 0 : grid.columns - hero.colSpan) : grid.columns;
  const textColStart = heroOnLeft && hero ? hero.colSpan + 1 : 0;
  const textColSpan = hero ? Math.max(3, grid.columns - hero.colSpan - 1) : grid.columns;

  if (elementIds.includes('logo')) {
    const span = spanForTier(grid, tierByElement.logo);
    const logoColStart = heroOnLeft ? grid.columns - span.colSpan : 0;
    elements.push({ elementId: 'logo', kind: 'chip', box: cellsToBox(grid, logoColStart, span.colSpan, 0, span.rowSpan) });
  }

  if (hero) {
    const heroRowStart = Math.max(0, Math.round((grid.rows - hero.rowSpan) / 2));
    elements.push({ elementId: 'hero', kind: 'boxed', box: cellsToBox(grid, heroColStart, hero.colSpan, heroRowStart, hero.rowSpan) });
  }

  let cursorRow = Math.round(grid.rows * 0.42); // arranca el bloque de texto en la franja media — misma proporción para cualquier canvas
  if (elementIds.includes('title')) {
    const span = spanForTier(grid, tierByElement.title);
    elements.push({ elementId: 'title', kind: 'boxed', box: cellsToBox(grid, textColStart, Math.min(span.colSpan, textColSpan), cursorRow, span.rowSpan) });
    cursorRow += span.rowSpan;
  }

  if (elementIds.includes('cta')) {
    const span = spanForTier(grid, tierByElement.cta);
    elements.push({ elementId: 'cta', kind: 'boxed', box: cellsToBox(grid, textColStart, Math.min(span.colSpan, textColSpan), cursorRow, span.rowSpan) });
    cursorRow += span.rowSpan;
  }

  if (elementIds.includes('icons')) {
    const span = spanForTier(grid, tierByElement.icons);
    elements.push({ elementId: 'icons', kind: 'icon-row', box: cellsToBox(grid, textColStart, Math.min(span.colSpan, textColSpan), cursorRow, span.rowSpan) });
  }

  if (elementIds.includes('price')) {
    const span = spanForTier(grid, tierByElement.price);
    const priceColStart = heroOnLeft ? 0 : grid.columns - span.colSpan;
    elements.push({ elementId: 'price', kind: 'boxed', box: cellsToBox(grid, priceColStart, span.colSpan, 0, span.rowSpan) });
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  // splitX en píxeles (no el índice de columna) — el renderer no conoce
  // el grid, solo geometría ya resuelta, mismo criterio que el resto del plan.
  const splitX = grid.originX + (heroOnLeft ? heroColStart + hero.colSpan : heroColStart) * grid.cellWidth;
  return { elements, decorations: hero ? [{ type: 'diagonal-accent', splitX, flip: heroOnLeft }] : [] };
}

module.exports = { computePlan };
