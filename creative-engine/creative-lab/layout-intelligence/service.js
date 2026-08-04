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
//
// Desde el sprint "Design Evolution v2 / Editorial Design Engine" (mismo
// día), también recibe una EditorialDecision opcional
// (editorial-design-engine/service.js#directEditorial): se reenvía tal
// cual a cada estrategia (rompe simetría, admite solapes acotados) y se
// aplica aquí mismo, tras calcular el plan, la sangre de canvas
// (`editorial.canvasBleed`) — extender la caja del hero hasta el borde
// físico del canvas en `editorial.bleedEdge`, "el producto invade el
// lienzo". Igual que `artDirection`, es opcional — sin ella el layout se
// comporta exactamente como antes de este sprint.

const { buildGrid, overlaps } = require('./grid.js');
const { computeHierarchy } = require('./hierarchy.js');
const { scoreLayout, isAllowedOverlap } = require('./balance-score.js');
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
 * Sangre de canvas: si Editorial Design Engine decidió que el producto
 * debe invadir el lienzo (`editorial.canvasBleed`), extiende la caja del
 * hero hasta tocar el borde físico del canvas en `editorial.bleedEdge`
 * (no solo hasta el margen estructural — eso ya lo permite `heroSpan`).
 * Nunca se aplica al hero `background-fill` (ya ocupa el canvas entero,
 * nada que extender) ni si no hay hero. Marca el elemento con `bleeds:true`
 * para que `balance-score.js#scoreMarginCompliance` lo exima del check de
 * margen igual que ya exime al footer a sangre — invadir el margen aquí
 * es la decisión, no un fallo.
 */
function applyCanvasBleed(planResult, grid, editorial) {
  if (!editorial || !editorial.canvasBleed) return planResult;
  const heroEl = planResult.elements.find((el) => el.elementId === 'hero' && el.kind !== 'background-fill');
  if (!heroEl) return planResult;

  const box = { ...heroEl.box };
  if (editorial.bleedEdge === 'left') {
    box.w += box.x;
    box.x = 0;
  } else if (editorial.bleedEdge === 'right') {
    box.w = grid.canvasWidth - box.x;
  } else if (editorial.bleedEdge === 'top') {
    box.h += box.y;
    box.y = 0;
  }

  // Salvaguarda (bug real encontrado probando el patrón 'amazon-premium':
  // flat-lay-editorial coloca el precio en la esquina superior del marco
  // interior, y extender el hero hasta el borde derecho del CANVAS lo
  // hacía invadir esa esquina — un solape no declarado, penalizado por
  // limpieza()). Si la caja extendida invade otro elemento de primer
  // plano que no está explícitamente permitido por editorial.allowOverlap,
  // NO se aplica la sangre — mejor un hero contenido que un precio/título
  // tapado por invadir el lienzo porque sí.
  const bledHero = { ...heroEl, box, bleeds: true };
  const others = planResult.elements.filter((el) => el.elementId !== 'hero' && el.kind !== 'background-fill' && el.kind !== 'footer-bleed');
  const introducesUnwantedOverlap = others.some(
    (other) => overlaps(bledHero.box, other.box) && !isAllowedOverlap(bledHero, other, editorial.allowOverlap)
  );
  if (introducesUnwantedOverlap) return planResult;

  const elements = planResult.elements.map((el) => (el.elementId === 'hero' ? bledHero : el));
  return { ...planResult, elements };
}

/**
 * Banda de color: si Editorial Design Engine decidió una
 * (`editorial.colorBand.enabled`), añade una decoración más al plan con
 * su caja YA calculada en píxeles — el renderer (render-helpers.js) solo
 * pinta un rectángulo, no conoce "edge"/"widthRatio", mismo criterio que
 * el resto de decorations (splitX ya viene en píxeles, nunca un
 * porcentaje que el renderer tenga que traducir).
 */
function applyColorBand(planResult, grid, editorial) {
  if (!editorial || !editorial.colorBand || !editorial.colorBand.enabled) return planResult;
  const { edge, widthRatio } = editorial.colorBand;
  let box = null;
  if (edge === 'left') box = { x: 0, y: 0, w: grid.canvasWidth * widthRatio, h: grid.canvasHeight };
  else if (edge === 'right') box = { x: grid.canvasWidth * (1 - widthRatio), y: 0, w: grid.canvasWidth * widthRatio, h: grid.canvasHeight };
  else if (edge === 'top') box = { x: 0, y: 0, w: grid.canvasWidth, h: grid.canvasHeight * widthRatio };
  else if (edge === 'bottom') box = { x: 0, y: grid.canvasHeight * (1 - widthRatio), w: grid.canvasWidth, h: grid.canvasHeight * widthRatio };
  if (!box) return planResult;

  const decorations = [...(planResult.decorations || []), { type: 'color-band', box }];
  return { ...planResult, decorations };
}

/**
 * Solape deliberado: `editorial.allowOverlap` (editorial-design-engine/)
 * es un PERMISO acotado ("cuándo superponer elementos" — instrucción
 * explícita del propietario), no solo una excepción de puntuación. Si el
 * par de elementos de la regla ya son vecinos (separados en un único eje,
 * sin hueco de por medio en el otro) pero NO se solapan todavía, se
 * empuja el primero hacia el segundo justo lo suficiente para invadirlo
 * — acotado a una fracción de `maxOverlapRatio` (0.6, deja margen bajo el
 * tope antes de que `balance-score.js#isAllowedOverlap` deje de admitirlo
 * por redondeo). Si los dos elementos no son vecinos en ningún eje (la
 * estrategia los colocó lejos), no se fuerza nada — un solape forzado a
 * través de un hueco grande dejaría de leerse como recurso editorial y
 * pasaría a verse como un error de posición.
 */
function nudgeTowardOverlap(a, b, maxOverlapRatio) {
  const verticalGap = a.y >= b.y + b.h ? a.y - (b.y + b.h) : (b.y >= a.y + a.h ? b.y - (a.y + a.h) : null);
  const horizontalGap = a.x >= b.x + b.w ? a.x - (b.x + b.w) : (b.x >= a.x + a.w ? b.x - (a.x + a.w) : null);

  const box = { ...a };
  if (verticalGap !== null && (horizontalGap === null || verticalGap <= horizontalGap)) {
    const penetration = Math.min(a.h, b.h) * maxOverlapRatio * 0.6;
    box.y = a.y >= b.y + b.h ? a.y - verticalGap - penetration : a.y + verticalGap + penetration;
  } else if (horizontalGap !== null) {
    const penetration = Math.min(a.w, b.w) * maxOverlapRatio * 0.6;
    box.x = a.x >= b.x + b.w ? a.x - horizontalGap - penetration : a.x + horizontalGap + penetration;
  }
  return box;
}

function applyDeliberateOverlap(planResult, editorial) {
  if (!editorial || !editorial.allowOverlap || editorial.allowOverlap.length === 0) return planResult;
  let elements = planResult.elements;

  for (const rule of editorial.allowOverlap) {
    const idxA = elements.findIndex((el) => el.elementId === rule.a);
    const idxB = elements.findIndex((el) => el.elementId === rule.b);
    if (idxA === -1 || idxB === -1) continue;
    const a = elements[idxA];
    const b = elements[idxB];
    if (overlaps(a.box, b.box)) continue; // ya se solapan por geometría natural — nada que forzar

    const nudgedBox = nudgeTowardOverlap(a.box, b.box, rule.maxOverlapRatio);
    if (!overlaps(nudgedBox, b.box)) continue; // no eran vecinos en ningún eje — no se fuerza a través de un hueco

    elements = elements.slice();
    elements[idxA] = { ...a, box: nudgedBox };
  }

  return elements === planResult.elements ? planResult : { ...planResult, elements };
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
 * @param {object} [editorial] - salida de editorial-design-engine/service.js#directEditorial (opcional, ver arriba)
 * @returns {{strategyId:string, planResult:object, score:object, grid:object, tierByElement:object, textEmphasis:string, attempts:object[], passed:boolean}}
 */
function planLayout(concept, brief, canvas, elementIds, artDirection, editorial) {
  const gridOptions = artDirection && artDirection.marginRatio ? { marginRatio: artDirection.marginRatio } : {};
  const grid = buildGrid(canvas.width, canvas.height, gridOptions);
  const { tierByElement, stackOrder, textEmphasis } = computeHierarchy(concept, brief, elementIds);
  const whitespaceTarget = artDirection && artDirection.whitespaceTarget;
  const allowOverlap = editorial && editorial.allowOverlap;

  const order = resolveStrategyOrder(concept, artDirection).slice(0, Math.max(1, LAYOUT_MAX_RETRIES));

  const attempts = [];
  let best = null;

  for (const strategyId of order) {
    const rawPlan = STRATEGIES[strategyId].computePlan(grid, tierByElement, elementIds, stackOrder, artDirection, editorial);
    const bledPlan = applyCanvasBleed(rawPlan, grid, editorial);
    const bandedPlan = applyColorBand(bledPlan, grid, editorial);
    const planResult = applyDeliberateOverlap(bandedPlan, editorial);
    const score = scoreLayout(planResult, grid, tierByElement, whitespaceTarget, allowOverlap);
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
