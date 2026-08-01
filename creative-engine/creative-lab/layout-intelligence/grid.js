// Grid — matemática pura de composición. Ninguna función de este fichero
// conoce brand/copy/producto: solo números (columnas, filas, cajas en
// píxeles). Es la base sobre la que strategies/ decide DÓNDE va cada
// elemento, y balance-score.js decide si esa decisión es buena — ninguna
// coordenada aparece tecleada a mano en ningún punto del sistema.

const EPSILON = 0.01;

/**
 * Construye un grid interior (tras descontar un margen estructural en
 * los 4 bordes) para un canvas real. `rows` se deriva del aspect ratio
 * para que las celdas sean ~cuadradas en cualquier formato (1080×1350,
 * 1200×630, 1080×1080, 1080×1920 — ver asset-pipeline/config.js#FORMAT_DIMENSIONS),
 * nunca un número de filas fijo que distorsionaría formatos muy
 * apaisados o muy verticales.
 * @param {number} width - ancho real del canvas en px
 * @param {number} height - alto real del canvas en px
 * @param {{columns?: number, marginRatio?: number}} [options]
 */
function buildGrid(width, height, options = {}) {
  const { GRID_COLUMNS, MARGIN_RATIO } = require('./config.js');
  const columns = options.columns || GRID_COLUMNS;
  const marginRatio = options.marginRatio ?? MARGIN_RATIO;

  const marginPx = marginRatio * Math.min(width, height);
  const interiorWidth = width - 2 * marginPx;
  const interiorHeight = height - 2 * marginPx;
  const cellWidth = interiorWidth / columns;
  const rows = Math.max(1, Math.round(interiorHeight / cellWidth));
  const cellHeight = interiorHeight / rows;

  return {
    canvasWidth: width, canvasHeight: height,
    columns, rows,
    originX: marginPx, originY: marginPx,
    cellWidth, cellHeight,
    interiorWidth, interiorHeight,
  };
}

/** Convierte un rango de celdas (índices desde 0) en una caja real en píxeles, recortada a los límites del grid interior. */
function cellsToBox(grid, colStart, colSpan, rowStart, rowSpan) {
  const col = Math.max(0, Math.min(colStart, grid.columns - 1));
  const row = Math.max(0, Math.min(rowStart, grid.rows - 1));
  const spanCols = Math.max(1, Math.min(colSpan, grid.columns - col));
  const spanRows = Math.max(1, Math.min(rowSpan, grid.rows - row));

  return {
    x: grid.originX + col * grid.cellWidth,
    y: grid.originY + row * grid.cellHeight,
    w: spanCols * grid.cellWidth,
    h: spanRows * grid.cellHeight,
  };
}

/** Caja que ocupa el canvas completo, incluidos los márgenes — para elementos kind:'background-fill' (el hero cuando es fondo pleno no compite por hueco de grid). */
function fullCanvasBox(grid) {
  return { x: 0, y: 0, w: grid.canvasWidth, h: grid.canvasHeight };
}

function boxArea(box) {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

/** Intersección estricta de rectángulos — dos cajas que solo se tocan en el borde NO se consideran solapadas. */
function overlaps(a, b) {
  return !(
    a.x + a.w <= b.x + EPSILON ||
    b.x + b.w <= a.x + EPSILON ||
    a.y + a.h <= b.y + EPSILON ||
    b.y + b.h <= a.y + EPSILON
  );
}

/** Área de la intersección entre dos cajas (0 si no se solapan) — usado para medir CUÁNTO se solapan dos elementos, no solo si lo hacen (ver editorial-design-engine/#allowOverlap: un solape deliberado y acotado es un recurso, uno grande sigue siendo desorden). */
function overlapArea(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

/** Fracción del área de `box` que queda cubierta por `other` — 0-1. */
function overlapRatio(box, other) {
  const area = boxArea(box);
  if (area === 0) return 0;
  return overlapArea(box, other) / area;
}

/** ¿La caja cabe dentro de la zona interior del grid (respeta el margen)? */
function withinBounds(box, grid) {
  return (
    box.x >= grid.originX - EPSILON &&
    box.y >= grid.originY - EPSILON &&
    box.x + box.w <= grid.originX + grid.interiorWidth + EPSILON &&
    box.y + box.h <= grid.originY + grid.interiorHeight + EPSILON
  );
}

/**
 * Aproximación de espacio en blanco: 1 - (suma de áreas / área de
 * canvas), capada a [0,1]. Es una aproximación deliberada (suma simple,
 * no unión real de polígonos) — válida porque las cajas "foreground" no
 * deben solaparse entre sí (lo fuerza `overlapPenalty` en
 * balance-score.js); documentado aquí para quien lea esto y espere una
 * unión geométrica exacta.
 */
function whitespaceRatio(boxes, grid) {
  const canvasArea = grid.canvasWidth * grid.canvasHeight;
  const occupied = boxes.reduce((sum, box) => sum + boxArea(box), 0);
  return 1 - Math.min(1, occupied / canvasArea);
}

/** Centroide ponderado de un conjunto de cajas (peso = importancia visual del elemento, p.ej. tier × área) — usado por balance-score.js para medir equilibrio. */
function weightedCentroid(boxesWithWeight) {
  const totalWeight = boxesWithWeight.reduce((sum, b) => sum + b.weight, 0);
  if (totalWeight === 0) return null;
  const cx = boxesWithWeight.reduce((sum, b) => sum + (b.box.x + b.box.w / 2) * b.weight, 0) / totalWeight;
  const cy = boxesWithWeight.reduce((sum, b) => sum + (b.box.y + b.box.h / 2) * b.weight, 0) / totalWeight;
  return { x: cx, y: cy };
}

module.exports = {
  buildGrid, cellsToBox, fullCanvasBox, boxArea, overlaps, overlapArea, overlapRatio, withinBounds,
  whitespaceRatio, weightedCentroid,
};
