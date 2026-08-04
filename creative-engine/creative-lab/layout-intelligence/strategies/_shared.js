// Helpers compartidos por las 6 estrategias — matemática de colocación
// reutilizable (centrar, anclar a una esquina, franja inferior a sangre)
// para que cada estrategia solo tenga que declarar SU regla de equilibrio
// distintiva, no repetir aritmética de grid 6 veces.

const { cellsToBox, fullCanvasBox, overlaps } = require('../grid.js');
const { HIERARCHY_TIER_SPANS, SPLIT_SCREEN_RATIO, FRAME_INSET_CELLS } = require('../config.js');

/**
 * Filas de grid que hay que reservar para no invadir el footer de
 * contacto — bug real detectado con un patrón full-bleed + iconos: un
 * apilado anclado al fondo (cinematico-fullbleed) podía crecer hacia
 * arriba lo suficiente para que su último bloque terminara por debajo de
 * donde empieza `footerBleedBox()`, solapándose con ella.
 */
function footerReservedRows(grid, hasFooter) {
  if (!hasFooter) return 0;
  const footerHeightPx = HIERARCHY_TIER_SPANS.minimo.rowRatio * grid.interiorHeight;
  return Math.ceil(footerHeightPx / grid.cellHeight);
}

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

/**
 * Punto de partida horizontal: centrado por defecto, desplazado hacia la
 * zona de tensión cuando Editorial Design Engine decidió romper la
 * simetría (`editorial.breakSymmetry`) — "dejar de pensar en bloques
 * verticales" sin reescribir el apilado: el bloque sigue siendo vertical,
 * pero ya no cae siempre en el eje central. Desplazamiento acotado
 * (~12% del ancho del grid) para no salirse del margen.
 */
function offsetColStart(grid, colSpan, editorial) {
  const center = centerColStart(grid, colSpan);
  if (!editorial || !editorial.breakSymmetry) return center;
  const shiftCols = Math.max(1, Math.round(grid.columns * 0.12));
  const direction = editorial.tensionZone && editorial.tensionZone.includes('right') ? 1 : -1;
  return Math.max(0, Math.min(grid.columns - colSpan, center + direction * shiftCols));
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
 *
 * `heroBox`, si se pasa, hace la colocación consciente del hero real —
 * bug real encontrado con 'amazon-premium' (heroSize 0.80 centrado) y ya
 * latente con 'product-first'/'apple-style'/'hero-product'/
 * 'premium-retail'/'luxury-catalogue': un hero ancho y centrado invade
 * la esquina superior derecha donde vivía el precio, y la colocación
 * ciega (siempre la columna más a la derecha) no lo detectaba. Ahora:
 * 1) si queda hueco real a la derecha del hero, el precio vive ahí
 *    (nunca se solapa); 2) si no, se prueba el hueco a la izquierda;
 * 3) si el hero es tan ancho que no queda hueco en ningún lado, el
 *    precio se convierte en un badge pequeño ANCLADO SOBRE LA ESQUINA
 *    de la foto — mismo lenguaje que un precio/descuento superpuesto en
 *    retail real (Amazon, MediaMarkt) — marcado `overlaysHero:true` para
 *    que balance-score.js/design-director lo traten como solape
 *    estructural permitido, no como desorden.
 */
function topRightCorner(grid, span, maxRowSpan, heroBox) {
  const rowSpan = maxRowSpan ? Math.min(span.rowSpan, maxRowSpan) : span.rowSpan;
  const naive = cellsToBox(grid, grid.columns - span.colSpan, span.colSpan, 0, rowSpan);
  if (!heroBox || !overlaps(naive, heroBox)) return naive;

  const gapRight = grid.originX + grid.interiorWidth - (heroBox.x + heroBox.w);
  if (gapRight >= naive.w * 0.7) {
    const colsForGap = Math.max(1, Math.floor(gapRight / grid.cellWidth));
    return cellsToBox(grid, grid.columns - colsForGap, colsForGap, 0, rowSpan);
  }
  const gapLeft = heroBox.x - grid.originX;
  if (gapLeft >= naive.w * 0.7) {
    const colsForGap = Math.max(1, Math.floor(gapLeft / grid.cellWidth));
    return cellsToBox(grid, 0, colsForGap, 0, rowSpan);
  }

  const badgeWidth = naive.w * 0.62;
  const badgeHeight = naive.h * 0.72;
  return {
    x: grid.originX + grid.interiorWidth - badgeWidth,
    y: grid.originY,
    w: badgeWidth,
    h: badgeHeight,
    overlaysHero: true,
  };
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
 * Tamaño del hero: si Art Direction Engine ya decidió un tamaño concreto
 * para el patrón elegido (`artDirection.heroSize`), se usa tal cual —
 * "cuánto puede crecer una fotografía" es una decisión de Art Direction,
 * no de la estrategia de layout. Sin patrón (rutas legacy/sintéticas),
 * cae al tier genérico de siempre.
 */
function heroSpan(grid, tierByElement, artDirection) {
  if (artDirection && artDirection.heroSize) {
    return {
      colSpan: Math.max(1, Math.round(artDirection.heroSize.colRatio * grid.columns)),
      rowSpan: Math.max(1, Math.round(artDirection.heroSize.rowRatio * grid.rows)),
    };
  }
  return spanForTier(grid, tierByElement.hero);
}

/**
 * Apila elementos en columna, centrados horizontalmente, en el ORDEN dado
 * (ver hierarchy.js#computeStackOrder — orden de lectura de arriba a
 * abajo, no de tamaño). Único sitio donde vive esta aritmética: las 3
 * estrategias que apilan verticalmente (centrado-clasico,
 * flotante-minimalista, flat-lay-editorial) la reutilizan en vez de
 * repetir el acumulado de `cursorRow` cada una por su cuenta. El hero usa
 * siempre `heroSpan()` (tamaño de Art Direction Engine si existe),
 * `tierTransform` solo afecta al resto de elementos.
 * @param {object} grid
 * @param {string[]} stackOrder - elementos a apilar, ya filtrados a los presentes
 * @param {Record<string,string>} tierByElement
 * @param {number} startRow
 * @param {(tier:string)=>string} [tierTransform] - p.ej. flotante-minimalista rebaja el tier del título
 * @param {object} [artDirection] - ArtDirectionDecision (art-direction-engine/service.js#directArt)
 * @param {object} [editorial] - EditorialDecision (editorial-design-engine/service.js#directEditorial) — su `breakSymmetry` desplaza el apilado del centro
 * @param {number} [maxRow] - fila límite que el apilado NUNCA puede cruzar (normalmente `grid.rows - footerReservedRows(...)`) — bug real encontrado con 'product-first' (hero muy alto + título + cta): sin este límite, el apilado podía terminar por debajo de donde empieza el footer de contacto, solapándose con él.
 *
 * Recortar solo el ÚLTIMO elemento que no cabe (primer intento de este
 * mismo sprint) no basta: con `maxRow` ya alcanzado, cada elemento
 * siguiente sigue recibiendo un suelo de 1 fila y el cursor sigue
 * avanzando MÁS ALLÁ de `maxRow` de todas formas — confirmado con un
 * barrido sintético de los 17 patrones × 6 estrategias tras subir
 * `HIERARCHY_TIER_SPANS` (ver ARCHITECTURE.md, "Visual Quality
 * Revolution"): decenas de combinaciones seguían invadiendo el footer.
 * El encogimiento proporcional (segundo intento) tampoco basta del
 * todo: redondear CADA elemento por separado (`Math.round`) puede
 * acumular deriva — 4 elementos redondeando "hacia arriba" pueden sumar
 * una fila entera más que `availableRows` aunque el ratio de
 * encogimiento sea correcto (confirmado con el mismo barrido:
 * 'product-first'+'flotante-minimalista' seguía invadiendo el footer
 * por ~8px pese al encogimiento). Corregido con reparto de presupuesto
 * restante (nunca redondeo independiente): cada elemento se acota a lo
 * que queda de `availableRows` menos 1 fila reservada para cada
 * elemento que queda por colocar — garantiza que la suma NUNCA cruza
 * `maxRow`, mismo principio que el "método del resto mayor" de reparto
 * proporcional.
 */
function stackVertically(grid, stackOrder, tierByElement, startRow, tierTransform = (t) => t, artDirection, editorial, maxRow) {
  const spans = stackOrder.map((elementId) => ({
    elementId,
    span: elementId === 'hero' ? heroSpan(grid, tierByElement, artDirection) : spanForTier(grid, tierTransform(tierByElement[elementId], elementId)),
  }));

  const totalRows = spans.reduce((sum, s) => sum + s.span.rowSpan, 0);
  const availableRows = maxRow ? Math.max(1, maxRow - startRow) : totalRows;
  const shrink = totalRows > availableRows ? availableRows / totalRows : 1;

  const elements = [];
  let cursorRow = startRow;
  let remainingBudget = availableRows;
  let remainingItems = spans.length;
  for (const { elementId, span } of spans) {
    remainingItems--;
    const idealRowSpan = Math.round(span.rowSpan * shrink);
    const rowSpan = maxRow
      ? Math.max(1, Math.min(idealRowSpan, remainingBudget - remainingItems))
      : Math.max(1, idealRowSpan);
    const kind = elementId === 'logo' ? 'chip' : elementId === 'icons' ? 'icon-row' : 'boxed';
    elements.push({ elementId, kind, box: cellsToBox(grid, offsetColStart(grid, span.colSpan, editorial), span.colSpan, cursorRow, rowSpan) });
    cursorRow += rowSpan;
    remainingBudget -= rowSpan;
  }
  return { elements, cursorRow };
}

module.exports = {
  spanForTier, heroSpan, centerColStart, offsetColStart, footerBleedBox, footerReservedRows, topRightCorner, headerRowSpan, insetGrid,
  cellsToBox, fullCanvasBox, stackVertically, SPLIT_SCREEN_RATIO,
};
