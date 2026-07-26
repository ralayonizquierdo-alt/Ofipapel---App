// Helpers compartidos por las 6 estrategias — matemática de colocación
// reutilizable (centrar, anclar a una esquina, franja inferior a sangre)
// para que cada estrategia solo tenga que declarar SU regla de equilibrio
// distintiva, no repetir aritmética de grid 6 veces.

const { cellsToBox, fullCanvasBox } = require('../grid.js');
const { HIERARCHY_TIER_SPANS, SPLIT_SCREEN_RATIO, FRAME_INSET_CELLS } = require('../config.js');

/** Traduce un tier ('dominante'|'primario'|'secundario'|'minimo') a un span de columnas/filas real para este grid — nunca un número tecleado por elemento. */
function spanForTier(grid, tier) {
  const ratios = HIERARCHY_TIER_SPANS[tier] || HIERARCHY_TIER_SPANS.secundario;
  return {
    colSpan: Math.max(1, Math.round(ratios.colRatio * grid.columns)),
    rowSpan: Math.max(1, Math.round(ratios.rowRatio * grid.rows)),
  };
}

function centerColStart(grid, colSpan) {
  return Math.max(0, Math.round((grid.columns - colSpan) / 2));
}

/** Franja inferior a sangre completa (fuera del grid interior, incluye el margen) — altura derivada del tier 'minimo' (misma regla que cualquier otro tamaño, no un `height*0.05` tecleado). */
function footerBleedBox(grid) {
  const footerHeight = HIERARCHY_TIER_SPANS.minimo.rowRatio * grid.interiorHeight;
  return { x: 0, y: grid.canvasHeight - footerHeight, w: grid.canvasWidth, h: footerHeight };
}

/**
 * Esquina superior derecha, para el badge de precio — misma regla en
 * cualquier estrategia que la use. `maxRowSpan`, si se pasa, recorta la
 * altura para que nunca invada la fila donde arranca el elemento que
 * sigue en el apilado (p.ej. el hero, justo debajo de la fila de
 * logo/precio) — sin este límite, un precio con tier propio más alto que
 * el de la cabecera puede solaparse con el hero (detectado con el test
 * sintético antes de tocar layout-composer/, ver ARCHITECTURE.md).
 */
function topRightCorner(grid, span, maxRowSpan) {
  const rowSpan = maxRowSpan ? Math.min(span.rowSpan, maxRowSpan) : span.rowSpan;
  return cellsToBox(grid, grid.columns - span.colSpan, span.colSpan, 0, rowSpan);
}

/** Altura (en filas) de la cabecera reservada por el primer elemento del apilado — el precio en la esquina no debe superar esa altura para no invadir lo que viene después. */
function headerRowSpan(grid, stackOrder, tierByElement) {
  if (!stackOrder || stackOrder.length === 0) return 1;
  return spanForTier(grid, tierByElement[stackOrder[0]]).rowSpan;
}

/** Sub-grid "enmarcado": un borde de FRAME_INSET_CELLS celdas dentro del grid interior — usado por flat-lay-editorial para su sensación de "marco dentro del marco". Devuelve un grid derivado, mismas unidades que el original. */
function insetGrid(grid, cells = FRAME_INSET_CELLS) {
  const originX = grid.originX + cells * grid.cellWidth;
  const originY = grid.originY + cells * grid.cellHeight;
  return {
    ...grid,
    originX, originY,
    columns: grid.columns - 2 * cells,
    rows: grid.rows - 2 * cells,
    interiorWidth: grid.interiorWidth - 2 * cells * grid.cellWidth,
    interiorHeight: grid.interiorHeight - 2 * cells * grid.cellHeight,
  };
}

/**
 * Apila elementos en columna, centrados horizontalmente, en el ORDEN dado
 * (ver hierarchy.js#computeStackOrder — orden de lectura de arriba a
 * abajo, no de tamaño). Único sitio donde vive esta aritmética: las 3
 * estrategias que apilan verticalmente (centrado-clasico,
 * flotante-minimalista, flat-lay-editorial) la reutilizan en vez de
 * repetir el acumulado de `cursorRow` cada una por su cuenta.
 * @param {object} grid
 * @param {string[]} stackOrder - elementos a apilar, ya filtrados a los presentes
 * @param {Record<string,string>} tierByElement
 * @param {number} startRow
 * @param {(tier:string)=>string} [tierTransform] - p.ej. flotante-minimalista rebaja el tier del hero/título
 */
function stackVertically(grid, stackOrder, tierByElement, startRow, tierTransform = (t) => t) {
  const elements = [];
  let cursorRow = startRow;
  for (const elementId of stackOrder) {
    const span = spanForTier(grid, tierTransform(tierByElement[elementId], elementId));
    const kind = elementId === 'logo' ? 'chip' : 'boxed';
    elements.push({ elementId, kind, box: cellsToBox(grid, centerColStart(grid, span.colSpan), span.colSpan, cursorRow, span.rowSpan) });
    cursorRow += span.rowSpan;
  }
  return { elements, cursorRow };
}

module.exports = {
  spanForTier, centerColStart, footerBleedBox, topRightCorner, headerRowSpan, insetGrid,
  cellsToBox, fullCanvasBox, stackVertically, SPLIT_SCREEN_RATIO,
};
