// Balance Score — puntúa un LayoutPlan (geometría pura, ver strategies/)
// ANTES de renderizar nada. Mismo patrón de pesos-suman-100 + banda que
// concept-score/config.js, aplicado a composición en vez de a concepto.
// Todos los checks son de PLAN (números), nunca de píxeles — mismo
// criterio honesto que `evaluatedOn:'plan'` en creative-validator/.

const { boxArea, overlaps, withinBounds, whitespaceRatio, weightedCentroid } = require('./grid.js');
const { TIER_ORDER } = require('./hierarchy.js');
const { WHITESPACE_TARGET, CONTRAST_TARGET, BALANCE_MAX_DEVIATION, SCORE_WEIGHTS, bandFor } = require('./config.js');

function tierWeight(tier) {
  return TIER_ORDER.indexOf(tier) + 1; // minimo=1 ... dominante=4
}

// El fondo pleno (kind:'background-fill') no compite por hueco ni cuenta
// como "clutter" — es el fondo, no un elemento en primer plano.
function isForeground(el) {
  return el.kind !== 'background-fill';
}

function scoreMarginCompliance(elements, grid) {
  // El footer a sangre completa se sale del margen A PROPÓSITO (bleed) —
  // no es una violación, es su forma de estar.
  const checkable = elements.filter((el) => el.kind !== 'background-fill' && el.kind !== 'footer-bleed');
  if (checkable.length === 0) return { points: SCORE_WEIGHTS.marginCompliance, detail: 'Sin elementos que comprobar (todo es fondo pleno o franja a sangre).' };
  const compliant = checkable.filter((el) => withinBounds(el.box, grid));
  const ratio = compliant.length / checkable.length;
  return {
    points: Math.round(ratio * SCORE_WEIGHTS.marginCompliance),
    detail: `${compliant.length}/${checkable.length} elementos respetan el margen estructural.`,
  };
}

function scoreWhitespace(elements, grid, whitespaceTarget) {
  // Con fondo a sangre completa (foto ocupando el 100% del canvas), el
  // "espacio en blanco" es una propiedad de la propia fotografía (cielo,
  // pared, aire alrededor del sujeto) — esta métrica solo mide huecos
  // entre CAJAS, no puede ver dentro de una imagen. Penalizar aquí
  // convertía toda pieza full-bleed en "demasiado vacía" por definición
  // (bug real: el hero se excluye del cálculo por ser fondo, así que
  // logo+título+cta ocupando poco espacio parecía "78% de vacío" aunque
  // la foto llenara el encuadre entero). Se concede el máximo y se deja
  // constancia explícita, mismo criterio honesto que el resto de checks.
  const hasBackgroundFill = elements.some((el) => el.kind === 'background-fill');
  if (hasBackgroundFill) {
    return { points: SCORE_WEIGHTS.whitespaceBalance, detail: 'Fondo a sangre completa — el espacio en blanco es una propiedad de la fotografía, no de las cajas superpuestas; no se puede medir ni penalizar aquí.' };
  }

  const boxes = elements.filter(isForeground).map((el) => el.box);
  const ratio = whitespaceRatio(boxes, grid);
  const { min, max } = whitespaceTarget || WHITESPACE_TARGET;
  if (ratio >= min && ratio <= max) {
    return { points: SCORE_WEIGHTS.whitespaceBalance, detail: `Espacio en blanco ${(ratio * 100).toFixed(0)}% — dentro del rango sano (${min * 100}-${max * 100}%).` };
  }
  const distance = ratio < min ? min - ratio : ratio - max;
  const points = Math.max(0, Math.round(SCORE_WEIGHTS.whitespaceBalance * (1 - distance / 0.3)));
  return { points, detail: `Espacio en blanco ${(ratio * 100).toFixed(0)}% — fuera del rango sano (${min * 100}-${max * 100}%), ${ratio < min ? 'composición saturada' : 'composición demasiado vacía'}.` };
}

function scoreHierarchyContrast(elements, tierByElement) {
  const areas = elements
    .filter(isForeground)
    .map((el) => boxArea(el.box));
  if (areas.length < 2) return { points: SCORE_WEIGHTS.hierarchyContrast, detail: 'Un único elemento en primer plano — nada que contrastar.' };
  const ratio = Math.max(...areas) / Math.max(1, Math.min(...areas));
  const { min, max } = CONTRAST_TARGET;
  if (ratio >= min && ratio <= max) {
    return { points: SCORE_WEIGHTS.hierarchyContrast, detail: `Contraste de área ${ratio.toFixed(1)}x — jerarquía visible (rango sano ${min}-${max}x).` };
  }
  const distance = ratio < min ? min - ratio : Math.min(1, (ratio - max) / max);
  const points = Math.max(0, Math.round(SCORE_WEIGHTS.hierarchyContrast * (1 - distance)));
  return { points, detail: `Contraste de área ${ratio.toFixed(1)}x — ${ratio < min ? 'jerarquía plana, todo pesa igual' : 'desproporción excesiva'} (rango sano ${min}-${max}x).` };
}

function scoreVisualBalance(elements, grid, tierByElement) {
  const weighted = elements
    .filter(isForeground)
    .map((el) => ({ box: el.box, weight: tierWeight(tierByElement[el.elementId] || 'secundario') * boxArea(el.box) }));
  const centroid = weightedCentroid(weighted);
  if (!centroid) return { points: SCORE_WEIGHTS.visualBalance, detail: 'Sin elementos ponderables — se concede el máximo por defecto.' };

  const cx = grid.canvasWidth / 2;
  const cy = grid.canvasHeight / 2;
  const halfDiagonal = Math.sqrt(cx * cx + cy * cy);
  const deviation = Math.sqrt((centroid.x - cx) ** 2 + (centroid.y - cy) ** 2) / halfDiagonal;

  const points = Math.max(0, Math.round(SCORE_WEIGHTS.visualBalance * (1 - Math.min(1, deviation / BALANCE_MAX_DEVIATION))));
  return { points, detail: `Desviación del centroide ponderado respecto al centro: ${(deviation * 100).toFixed(1)}% (máximo aceptable ${BALANCE_MAX_DEVIATION * 100}%).` };
}

function scoreOverlap(elements) {
  // El fondo pleno puede solaparse con cualquier overlay a propósito
  // (es su función); el resto de pares no deberían solaparse.
  const checkable = elements.filter(isForeground);
  let collisions = 0;
  for (let i = 0; i < checkable.length; i++) {
    for (let j = i + 1; j < checkable.length; j++) {
      if (overlaps(checkable[i].box, checkable[j].box)) collisions++;
    }
  }
  const points = Math.max(0, SCORE_WEIGHTS.overlapPenalty - collisions * 8);
  return { points, detail: collisions === 0 ? 'Sin solapes entre elementos en primer plano.' : `${collisions} par(es) de elementos solapados.` };
}

/**
 * @param {{elements: Array<{elementId:string,kind:string,box:object}>, decorations: object[]}} planResult
 * @param {object} grid - salida de grid.js#buildGrid
 * @param {Record<string,string>} tierByElement - salida de hierarchy.js#computeHierarchy
 * @param {{min:number,max:number}} [whitespaceTarget] - override por patrón editorial (art-direction-engine/), si no se pasa usa config.js#WHITESPACE_TARGET
 */
function scoreLayout(planResult, grid, tierByElement, whitespaceTarget) {
  const { elements } = planResult;

  const checks = {
    marginCompliance: scoreMarginCompliance(elements, grid),
    whitespaceBalance: scoreWhitespace(elements, grid, whitespaceTarget),
    hierarchyContrast: scoreHierarchyContrast(elements, tierByElement),
    visualBalance: scoreVisualBalance(elements, grid, tierByElement),
    overlapPenalty: scoreOverlap(elements),
  };

  const total = Object.values(checks).reduce((sum, c) => sum + c.points, 0);

  return { total, band: bandFor(total), checks };
}

module.exports = { scoreLayout };
