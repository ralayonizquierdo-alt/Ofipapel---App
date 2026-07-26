// Layout Intelligence — punto de entrada único. Calcula una composición
// completa (grid + jerarquía + tamaños relativos + márgenes + espacios en
// blanco + reglas de equilibrio) y la puntúa ANTES de que exista ningún
// HTML que renderizar. Si no supera el umbral, se descarta y se prueba
// otra estrategia — determinista, acotado, nunca bloquea (mismo patrón
// exacto que creative-lab/index.js#runCreativeLab con QUALITY_THRESHOLD/
// MAX_RETRIES, aplicado aquí a la geometría en vez de al concepto).

const { buildGrid } = require('./grid.js');
const { computeHierarchy } = require('./hierarchy.js');
const { scoreLayout } = require('./balance-score.js');
const { STRATEGIES } = require('./strategies/index.js');
const {
  STRATEGY_BY_COMPOSITION, DEFAULT_STRATEGY, STRATEGY_ROTATION,
  LAYOUT_QUALITY_THRESHOLD, LAYOUT_MAX_RETRIES,
} = require('./config.js');

/** Rotación determinista arrancando en `startId` y dando la vuelta — nunca se repite la misma estrategia dos veces en el mismo intento de planificación. */
function rotationFrom(startId) {
  const idx = STRATEGY_ROTATION.indexOf(startId);
  const start = idx === -1 ? 0 : idx;
  return [...STRATEGY_ROTATION.slice(start), ...STRATEGY_ROTATION.slice(0, start)];
}

/**
 * @param {object} concept - concepto ganador (usa compositionId y textSpaceId)
 * @param {object} brief - CreativeBrief (usa artDirection.hierarchy)
 * @param {{width:number, height:number}} canvas
 * @param {string[]} elementIds - elementos a colocar, p.ej. ['hero','logo','title','cta','price','contactFooter'] según haya dato
 * @returns {{strategyId:string, planResult:object, score:object, grid:object, tierByElement:object, textEmphasis:string, attempts:object[], passed:boolean}}
 */
function planLayout(concept, brief, canvas, elementIds) {
  const grid = buildGrid(canvas.width, canvas.height);
  const { tierByElement, stackOrder, textEmphasis } = computeHierarchy(concept, brief, elementIds);

  const primaryStrategyId = STRATEGY_BY_COMPOSITION[concept.compositionId] || DEFAULT_STRATEGY;
  const order = rotationFrom(primaryStrategyId).slice(0, Math.max(1, LAYOUT_MAX_RETRIES));

  const attempts = [];
  let best = null;

  for (const strategyId of order) {
    const planResult = STRATEGIES[strategyId].computePlan(grid, tierByElement, elementIds, stackOrder);
    const score = scoreLayout(planResult, grid, tierByElement);
    attempts.push({ strategyId, total: score.total, band: score.band });

    if (!best || score.total > best.score.total) {
      best = { strategyId, planResult, score };
    }
    if (score.total >= LAYOUT_QUALITY_THRESHOLD) {
      return { ...best, grid, tierByElement, stackOrder, textEmphasis, attempts, passed: true };
    }
  }

  // Se agotaron los intentos sin superar el umbral — nunca un bucle
  // infinito. Se devuelve el mejor plan visto, marcado honestamente como
  // no aprobado (mismo criterio que needsHumanReview en runCreativeLab).
  return { ...best, grid, tierByElement, stackOrder, textEmphasis, attempts, passed: false };
}

module.exports = { planLayout };
