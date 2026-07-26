// Layout Intelligence (Composition Engine) — punto de entrada único.
// Calcula una composición completa (grid + jerarquía + tamaños relativos
// + márgenes + espacios en blanco + reglas de equilibrio) y la puntúa
// ANTES de que exista ningún HTML que renderizar. Si no supera el
// umbral, se descarta y se prueba otra estrategia — determinista,
// acotado, nunca bloquea (mismo patrón exacto que
// creative-lab/index.js#runCreativeLab con QUALITY_THRESHOLD/MAX_RETRIES,
// aplicado aquí a la geometría en vez de al concepto).
//
// Desde el sprint "Art Direction Engine" (2026-07-26), este módulo ya NO
// decide solo: recibe una ArtDirectionDecision ya tomada
// (art-direction-engine/service.js#directArt) con el patrón editorial
// elegido, y ADAPTA el layout a esas reglas (margen, espacio en blanco,
// tamaño de la fotografía, orden de preferencia de estrategias) en vez de
// partir solo de `concept.compositionId`. Sigue funcionando sin
// `artDirection` (cae al criterio genérico anterior) para no romper
// consumidores que todavía no lo pasan.

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

/** Orden de estrategias a probar: si Art Direction Engine ya eligió un patrón (con sus `preferredStrategies`), ese orden manda — "el Composition Engine ya no decide solo, primero selecciona un patrón editorial, después adapta el layout". Sin patrón, cae al criterio anterior (compositionId del concepto). */
function resolveStrategyOrder(concept, artDirection) {
  if (artDirection && Array.isArray(artDirection.preferredStrategies) && artDirection.preferredStrategies.length > 0) {
    const preferred = artDirection.preferredStrategies.filter((id) => STRATEGIES[id]);
    const rest = STRATEGY_ROTATION.filter((id) => !preferred.includes(id));
    return [...preferred, ...rest];
  }
  const primaryStrategyId = STRATEGY_BY_COMPOSITION[concept.compositionId] || DEFAULT_STRATEGY;
  return rotationFrom(primaryStrategyId);
}

/**
 * @param {object} concept - concepto ganador (usa compositionId y textSpaceId)
 * @param {object} brief - CreativeBrief (usa artDirection.hierarchy)
 * @param {{width:number, height:number}} canvas
 * @param {string[]} elementIds - elementos a colocar, ya filtrados por Art Direction Engine (artDirection.keepElementIds)
 * @param {object} [artDirection] - salida de art-direction-engine/service.js#directArt (opcional, ver arriba)
 * @returns {{strategyId:string, planResult:object, score:object, grid:object, tierByElement:object, textEmphasis:string, attempts:object[], passed:boolean}}
 */
function planLayout(concept, brief, canvas, elementIds, artDirection) {
  const gridOptions = artDirection && artDirection.marginRatio ? { marginRatio: artDirection.marginRatio } : {};
  const grid = buildGrid(canvas.width, canvas.height, gridOptions);
  const { tierByElement, stackOrder, textEmphasis } = computeHierarchy(concept, brief, elementIds);
  const whitespaceTarget = artDirection && artDirection.whitespaceTarget;

  const order = resolveStrategyOrder(concept, artDirection).slice(0, Math.max(1, LAYOUT_MAX_RETRIES));

  const attempts = [];
  let best = null;

  for (const strategyId of order) {
    const planResult = STRATEGIES[strategyId].computePlan(grid, tierByElement, elementIds, stackOrder, artDirection);
    const score = scoreLayout(planResult, grid, tierByElement, whitespaceTarget);
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
