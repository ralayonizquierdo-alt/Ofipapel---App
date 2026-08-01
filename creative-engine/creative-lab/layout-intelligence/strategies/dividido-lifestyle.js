// Estrategia "dividido lifestyle" — pantalla partida: el hero ocupa una
// banda horizontal superior (SPLIT_SCREEN_RATIO de las filas, config.js),
// el resto de elementos vive en la banda inferior restante.
// compositionId que mapean aquí: encuadre cerrado en el detalle, encuadre
// abierto con contexto, composición en L, asimetría equilibrada.

const { spanForTier, centerColStart, footerBleedBox, footerReservedRows, topRightCorner, cellsToBox, SPLIT_SCREEN_RATIO } = require('./_shared.js');

// `stackOrder`/`editorial` no se usan aquí — el hero siempre ocupa la
// banda superior completa (split screen) y el resto se centra en la
// banda inferior; no hay apilado vertical simétrico que romper.
// `editorial` se acepta solo por consistencia de firma con el resto de
// estrategias (todas reciben las mismas 6 posiciones).
function computePlan(grid, tierByElement, elementIds, stackOrder, artDirection, editorial) {
  const elements = [];
  const splitRow = Math.round(grid.rows * SPLIT_SCREEN_RATIO);

  if (elementIds.includes('hero')) {
    elements.push({ elementId: 'hero', kind: 'boxed', box: cellsToBox(grid, 0, grid.columns, 0, splitRow) });
  }

  if (elementIds.includes('logo')) {
    // La banda superior ES el hero — el logo colocado en su fila 0 vive
    // por definición dentro de la foto, nunca al lado (bug real: quedaba
    // solapado sin declarar). Mismo lenguaje que el precio: un logo
    // pequeño sobre la esquina de la foto es un recurso real de
    // publicidad (marca de agua discreta), no desorden — se marca
    // `overlaysHero` para que balance-score.js/design-director lo traten
    // como el mismo tipo de solape estructural permitido.
    const span = spanForTier(grid, tierByElement.logo);
    const heroEl = elements.find((el) => el.elementId === 'hero');
    const box = cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, 0, span.rowSpan);
    elements.push({ elementId: 'logo', kind: 'chip', box: heroEl ? { ...box, overlaysHero: true } : box });
  }

  if (elementIds.includes('price')) {
    // El hero ocupa aquí SIEMPRE el ancho completo de la banda superior
    // (pantalla partida) — nunca hay hueco libre a los lados, así que el
    // precio siempre acaba como badge sobre la esquina de la foto
    // (ver _shared.js#topRightCorner) — mismo lenguaje que el resto de
    // estrategias con hero ancho, no un caso especial de esta.
    const span = spanForTier(grid, tierByElement.price);
    const heroEl = elements.find((el) => el.elementId === 'hero');
    elements.push({ elementId: 'price', kind: 'boxed', box: topRightCorner(grid, span, undefined, heroEl && heroEl.box) });
  }

  // Banda inferior acotada: título+cta+iconos se encogen proporcionalmente
  // si no caben antes del footer — mismo criterio (y mismo bug real
  // encontrado en el barrido sintético) que stackVertically en
  // _shared.js, aplicado aquí porque esta estrategia apila a mano en vez
  // de reutilizar esa función (su geometría de banda partida no encaja
  // en su firma).
  const lowerStack = [];
  if (elementIds.includes('title')) lowerStack.push({ elementId: 'title', kind: 'boxed', span: spanForTier(grid, tierByElement.title) });
  if (elementIds.includes('cta')) lowerStack.push({ elementId: 'cta', kind: 'boxed', span: spanForTier(grid, tierByElement.cta) });
  if (elementIds.includes('icons')) lowerStack.push({ elementId: 'icons', kind: 'icon-row', span: spanForTier(grid, tierByElement.icons) });

  const startRow = splitRow + 1;
  const maxRow = grid.rows - footerReservedRows(grid, elementIds.includes('contactFooter'));
  const totalRows = lowerStack.reduce((sum, s) => sum + s.span.rowSpan, 0);
  const availableRows = Math.max(1, maxRow - startRow);
  const shrink = totalRows > availableRows ? availableRows / totalRows : 1;

  // Reparto de presupuesto restante, no redondeo independiente por
  // elemento — mismo criterio (y mismo bug real) que
  // _shared.js#stackVertically: redondear cada elemento por separado
  // puede acumular deriva y seguir invadiendo el footer pese al
  // encogimiento proporcional.
  let cursorRow = startRow;
  let remainingBudget = availableRows;
  let remainingItems = lowerStack.length;
  for (const { elementId, kind, span } of lowerStack) {
    remainingItems--;
    const idealRowSpan = Math.round(span.rowSpan * shrink);
    const rowSpan = Math.max(1, Math.min(idealRowSpan, remainingBudget - remainingItems));
    elements.push({ elementId, kind, box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, cursorRow, rowSpan) });
    cursorRow += rowSpan;
    remainingBudget -= rowSpan;
  }

  if (elementIds.includes('contactFooter')) {
    elements.push({ elementId: 'contactFooter', kind: 'footer-bleed', box: footerBleedBox(grid) });
  }

  return { elements, decorations: [] };
}

module.exports = { computePlan };
