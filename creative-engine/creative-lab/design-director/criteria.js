// Los 14 criterios de crítica de dirección de arte pedidos explícitamente
// por el propietario. Cada uno es una función pura `(ctx) -> {points, detail}`,
// `points` ya escalado al peso de ese criterio (config.js#CRITERIA_WEIGHTS).
//
// Sin proveedor de IA con visión conectado (mismo caveat de RT-09 que ya
// consta en ARCHITECTURE.md), estos criterios son heurísticas GEOMÉTRICAS
// deterministas sobre el LayoutPlan ya calculado — no leen píxeles. Se
// reutiliza al máximo la matemática de layout-intelligence/grid.js (misma
// instrucción explícita del propietario: "reutiliza todo lo posible") en
// vez de duplicarla.
//
// ctx esperado (construido por service.js#buildContext):
//   { elements, byId, decorations, grid, tierByElement, strategyId,
//     artDirection, brief, canvas, textEmphasis, heroOnPhoto }

const { boxArea, overlaps, weightedCentroid, whitespaceRatio } = require('../layout-intelligence/grid.js');
const { TIER_ORDER } = require('../layout-intelligence/hierarchy.js');
const { HIERARCHY_TIER_SPANS } = require('../layout-intelligence/config.js');
const { CRITERIA_WEIGHTS, HEALTHY_TENSION_RANGE } = require('./config.js');

// Duplicado deliberado de layout-composer/render-helpers.js#titleFontSize
// (2 líneas) — importarlo crearía una dependencia en sentido contrario
// (layout-composer ya depende de design-director, no al revés). Mismo
// criterio de duplicación ya documentado varias veces en este repo
// (shapes.js, rutas de render).
const TITLE_SIZE_FACTOR = { dominante: 0.078, equilibrado: 0.06, minimo: 0.04 };
function titleFontSize(canvasWidth, textEmphasis) {
  return Math.round(canvasWidth * (TITLE_SIZE_FACTOR[textEmphasis] || TITLE_SIZE_FACTOR.equilibrado));
}

function foreground(elements) {
  return elements.filter((el) => el.kind !== 'background-fill');
}

function tierWeight(tier) {
  return TIER_ORDER.indexOf(tier) + 1; // minimo=1 ... dominante=4
}

/** Desviación (0-1) del centroide ponderado respecto al centro del canvas — misma métrica que layout-intelligence/balance-score.js#scoreVisualBalance, reutilizada aquí para dos criterios distintos (equilibrio y tensión visual leen la MISMA desviación con curvas de puntuación opuestas). */
function centroidDeviation(ctx) {
  const weighted = foreground(ctx.elements).map((el) => ({
    box: el.box,
    weight: tierWeight(ctx.tierByElement[el.elementId] || 'secundario') * boxArea(el.box),
  }));
  const centroid = weightedCentroid(weighted);
  if (!centroid) return 0;
  const cx = ctx.canvas.width / 2;
  const cy = ctx.canvas.height / 2;
  const halfDiagonal = Math.sqrt(cx * cx + cy * cy);
  return Math.sqrt((centroid.x - cx) ** 2 + (centroid.y - cy) ** 2) / halfDiagonal;
}

/** "El producto debe dominar claramente la composición" — cuanto más ocupa el hero el encuadre, más impacto. */
function impactoVisual(ctx) {
  const weight = CRITERIA_WEIGHTS.impactoVisual;
  const hero = ctx.byId.hero;
  if (!hero) return { points: 0, detail: 'Sin producto/hero — no hay protagonista que genere impacto.' };
  const ratio = boxArea(hero.box) / (ctx.canvas.width * ctx.canvas.height);
  return { points: Math.round(weight * Math.min(1, ratio / 0.5)), detail: `El producto ocupa ${(ratio * 100).toFixed(0)}% del encuadre.` };
}

/**
 * Estabilidad: cuanto más cerca del centro esté el peso visual global,
 * más equilibrada. Tolerancia calibrada contra piezas reales (verificado
 * con la campaña Muvip): composiciones asimétricas por estilo (lifestyle,
 * editorial) desvían el centroide de forma legítima sin sentirse
 * "descompensadas" — este criterio solo debe penalizar desequilibrio
 * EXTREMO; `tensionVisual` es quien valora la asimetría deliberada.
 */
function equilibrio(ctx) {
  const weight = CRITERIA_WEIGHTS.equilibrio;
  const deviation = centroidDeviation(ctx);
  return { points: Math.round(weight * Math.max(0, 1 - deviation / 0.55)), detail: `Desviación del centroide ponderado respecto al centro: ${(deviation * 100).toFixed(1)}%.` };
}

/** Dinamismo controlado: ni perfectamente centrado (estático) ni caótico — pico en HEALTHY_TENSION_RANGE. */
function tensionVisual(ctx) {
  const weight = CRITERIA_WEIGHTS.tensionVisual;
  const deviation = centroidDeviation(ctx);
  const { center, tolerance } = HEALTHY_TENSION_RANGE;
  return { points: Math.round(weight * Math.max(0, 1 - Math.abs(deviation - center) / tolerance)), detail: `Tensión visual — desviación ${(deviation * 100).toFixed(1)}% (zona sana ${(center * 100).toFixed(0)}%±${(tolerance * 100).toFixed(0)}%).` };
}

/** El tamaño debe bajar de forma consistente de un tier al siguiente (dominante > primario > secundario > mínimo) — una jerarquía que "salta" desordenadamente rompe el ritmo visual. */
function ritmo(ctx) {
  const weight = CRITERIA_WEIGHTS.ritmo;
  const byTier = {};
  for (const el of foreground(ctx.elements)) {
    const tier = ctx.tierByElement[el.elementId];
    if (!tier) continue;
    (byTier[tier] = byTier[tier] || []).push(boxArea(el.box));
  }
  const order = ['dominante', 'primario', 'secundario', 'minimo'];
  const present = order.filter((t) => byTier[t] && byTier[t].length).map((t) => byTier[t].reduce((a, b) => a + b, 0) / byTier[t].length);
  if (present.length < 2) return { points: weight, detail: 'Menos de 2 niveles de jerarquía presentes — nada que romper el ritmo.' };
  let satisfied = 0;
  for (let i = 0; i < present.length - 1; i++) if (present[i] > present[i + 1]) satisfied++;
  const ratio = satisfied / (present.length - 1);
  return { points: Math.round(weight * ratio), detail: `${satisfied}/${present.length - 1} transiciones de tamaño respetan el orden de jerarquía.` };
}

/**
 * Aire alrededor de los elementos — con fondo a sangre completa, el
 * respiro real vive DENTRO de la fotografía (cielo, pared, aire
 * alrededor del sujeto), no en el margen del overlay: los patrones
 * `full-bleed` (Nike, Poster, Lifestyle Premium) eligen a propósito un
 * margen mínimo, casi a sangre — penalizarlo como "poco aire" sería
 * evaluar el género equivocado (verificado contra la campaña Muvip real,
 * mismo criterio honesto ya aplicado en balance-score.js con el fix de
 * espacio en blanco del sprint anterior).
 */
function respiracion(ctx) {
  const weight = CRITERIA_WEIGHTS.respiracion;
  const marginRatio = (ctx.artDirection && ctx.artDirection.marginRatio) || 0.06;
  const marginScore = Math.min(1, marginRatio / 0.12);
  if (ctx.heroOnPhoto) {
    return { points: Math.round(weight * 0.85), detail: 'Fondo a sangre completa — el aire depende de la fotografía y del margen mínimo que el propio patrón eligió a propósito; no se penaliza aquí.' };
  }
  const boxes = foreground(ctx.elements).map((el) => el.box);
  const ratio = whitespaceRatio(boxes, ctx.grid);
  const target = (ctx.artDirection && ctx.artDirection.whitespaceTarget) || { min: 0.3, max: 0.65 };
  const mid = (target.min + target.max) / 2;
  const spread = (target.max - target.min) / 2 || 0.15;
  const whitespaceScore = Math.max(0, 1 - Math.abs(ratio - mid) / (spread * 1.6));
  return { points: Math.round(weight * (0.5 * marginScore + 0.5 * whitespaceScore)), detail: `Espacio en blanco ${(ratio * 100).toFixed(0)}% (objetivo ${(target.min * 100).toFixed(0)}-${(target.max * 100).toFixed(0)}%).` };
}

/** "El título nunca puede competir con el producto" — un único elemento claramente más grande que el resto. */
function puntoFocal(ctx) {
  const weight = CRITERIA_WEIGHTS.puntoFocal;
  const hero = ctx.byId.hero;
  if (!hero) return { points: 0, detail: 'Sin producto — no hay punto focal.' };
  const heroArea = boxArea(hero.box);
  const rivalAreas = foreground(ctx.elements).filter((el) => el.elementId !== 'hero').map((el) => boxArea(el.box));
  const rival = rivalAreas.length ? Math.max(...rivalAreas) : 0;
  if (rival === 0) return { points: weight, detail: 'El producto es el único elemento en primer plano — punto focal absoluto.' };
  const ratio = heroArea / rival;
  return { points: Math.round(weight * Math.min(1, Math.max(0, (ratio - 1) / 0.8))), detail: `El producto es ${ratio.toFixed(1)}x más grande que el segundo elemento más grande.` };
}

/** El título debe caber en su caja sin necesitar más líneas de las que la caja tiene alto para mostrar. */
function legibilidad(ctx) {
  const weight = CRITERIA_WEIGHTS.legibilidad;
  const title = ctx.byId.title;
  const text = (ctx.brief.copy && ctx.brief.copy.title) || (ctx.brief.product && ctx.brief.product.name) || '';
  if (!title || !text) return { points: weight, detail: 'Sin título que evaluar.' };
  const fontSize = titleFontSize(ctx.canvas.width, ctx.textEmphasis);
  const charsPerLine = Math.max(1, Math.floor(title.box.w / (fontSize * 0.56)));
  const linesNeeded = Math.ceil(text.length / charsPerLine);
  const linesAvailable = Math.max(1, Math.floor(title.box.h / (fontSize * 1.15)));
  const points = linesNeeded <= linesAvailable ? weight : Math.round(weight * Math.max(0, linesAvailable / linesNeeded));
  return { points, detail: `Título necesita ~${linesNeeded} línea(s), caben ${linesAvailable} en su caja.` };
}

/** El ojo debe leer de arriba a abajo: logo cerca de la parte superior, footer al fondo, título nunca por encima del producto. */
function recorridoVisual(ctx) {
  const weight = CRITERIA_WEIGHTS.recorridoVisual;
  const els = foreground(ctx.elements);
  if (els.length === 0) return { points: weight, detail: 'Sin elementos que ordenar.' };
  const maxY = Math.max(...els.map((el) => el.box.y + el.box.h));
  const minY = Math.min(...els.map((el) => el.box.y));
  const checks = [];
  if (ctx.byId.contactFooter) checks.push(ctx.byId.contactFooter.box.y + ctx.byId.contactFooter.box.h >= maxY - 1);
  if (ctx.byId.logo) checks.push(ctx.byId.logo.box.y <= minY + ctx.grid.cellHeight);
  if (ctx.byId.title && ctx.byId.hero && ctx.byId.hero.kind !== 'background-fill') checks.push(ctx.byId.title.box.y >= ctx.byId.hero.box.y);
  if (checks.length === 0) return { points: weight, detail: 'Sin suficientes elementos para evaluar el recorrido visual.' };
  const ratio = checks.filter(Boolean).length / checks.length;
  return { points: Math.round(weight * ratio), detail: `${checks.filter(Boolean).length}/${checks.length} comprobaciones de recorrido de arriba a abajo superadas.` };
}

/** Cada bloque debe pesar lo que su tier promete — compara el área real contra el área que HIERARCHY_TIER_SPANS espera para ese tier. */
function tamanoRelativo(ctx) {
  const weight = CRITERIA_WEIGHTS.tamanoRelativo;
  const canvasArea = ctx.canvas.width * ctx.canvas.height;
  const els = foreground(ctx.elements).filter((el) => ctx.tierByElement[el.elementId]);
  if (els.length === 0) return { points: weight, detail: 'Sin elementos con tier asignado.' };
  let totalDeviation = 0;
  for (const el of els) {
    const spans = HIERARCHY_TIER_SPANS[ctx.tierByElement[el.elementId]];
    const expectedRatio = spans ? spans.colRatio * spans.rowRatio : 0.05;
    const actualRatio = boxArea(el.box) / canvasArea;
    totalDeviation += Math.min(1, Math.abs(actualRatio - expectedRatio) / Math.max(0.02, expectedRatio));
  }
  const avgDeviation = totalDeviation / els.length;
  return { points: Math.round(weight * Math.max(0, 1 - avgDeviation)), detail: `Desviación media respecto al tamaño esperado por nivel de jerarquía: ${(avgDeviation * 100).toFixed(0)}%.` };
}

/** El espacio negativo debe repartirse (margen generoso) y no debe haber un bloque secundario que acapare el canvas. */
function espacioNegativo(ctx) {
  const weight = CRITERIA_WEIGHTS.espacioNegativo;
  const marginRatio = (ctx.artDirection && ctx.artDirection.marginRatio) || 0.06;
  const marginScore = ctx.heroOnPhoto ? 0.85 : Math.min(1, marginRatio / 0.10);
  const canvasArea = ctx.canvas.width * ctx.canvas.height;
  const nonHero = foreground(ctx.elements).filter((el) => el.elementId !== 'hero');
  const worstHog = nonHero.length ? Math.max(...nonHero.map((el) => boxArea(el.box) / canvasArea)) : 0;
  const hogScore = worstHog > 0.35 ? Math.max(0, 1 - (worstHog - 0.35) / 0.35) : 1;
  return { points: Math.round(weight * (0.5 * marginScore + 0.5 * hogScore)), detail: `Margen ${(marginRatio * 100).toFixed(0)}%, mayor bloque secundario ${(worstHog * 100).toFixed(0)}% del canvas.` };
}

/**
 * Menos elementos, más elegancia — la sobriedad es un criterio de
 * diseño, no una carencia. Calibrado contra el suelo REAL de una pieza
 * conforme a negocio: hero+price+contactFooter son innegociables (ver
 * art-direction-engine/service.js#PROTECTED_ELEMENTS), así que 5
 * elementos (+logo+title) es lo habitual, no un exceso — solo penaliza
 * de verdad a partir de 6.
 */
function elegancia(ctx) {
  const weight = CRITERIA_WEIGHTS.elegancia;
  const count = ctx.elements.length;
  return { points: Math.round(weight * Math.max(0.35, 1 - Math.max(0, count - 5) / 6)), detail: `${count} elementos en la pieza.` };
}

/** Cero solapes — un error que una campaña profesional real nunca comete. */
function limpieza(ctx) {
  const weight = CRITERIA_WEIGHTS.limpieza;
  const els = foreground(ctx.elements);
  let collisions = 0;
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (overlaps(els[i].box, els[j].box)) collisions++;
  return { points: Math.max(0, weight - collisions * Math.ceil(weight / 2)), detail: collisions === 0 ? 'Sin solapes entre elementos.' : `${collisions} par(es) de elementos solapados.` };
}

/** Márgenes generosos + pocos elementos se leen como calidad premium — mismo principio de diseño que "menos es más", mismo suelo realista de elementos que `elegancia()`. */
function sensacionPremium(ctx) {
  const weight = CRITERIA_WEIGHTS.sensacionPremium;
  const marginRatio = (ctx.artDirection && ctx.artDirection.marginRatio) || 0.06;
  const marginScore = ctx.heroOnPhoto ? 0.85 : Math.min(1, marginRatio / 0.11);
  const count = ctx.elements.length;
  const restraintScore = Math.max(0.35, 1 - Math.max(0, count - 5) / 6);
  return { points: Math.round(weight * (0.6 * marginScore + 0.4 * restraintScore)), detail: `Margen ${(marginRatio * 100).toFixed(0)}%, ${count} elementos.` };
}

/** "El precio debe verse en menos de un segundo" — presente, en la mitad superior (zona de escaneo habitual) y con tamaño real. */
function percepcionComercial(ctx) {
  const weight = CRITERIA_WEIGHTS.percepcionComercial;
  const price = ctx.byId.price;
  if (ctx.brief.copy && ctx.brief.copy.price && !price) {
    return { points: 0, detail: 'Hay precio en el brief pero no aparece en la pieza — fallo grave de percepción comercial.' };
  }
  if (!price) return { points: Math.round(weight * 0.6), detail: 'Sin precio en el brief — no aplica, puntuación neutra.' };
  const inTopHalf = price.box.y < ctx.canvas.height * 0.5;
  const fontSize = Math.max(16, Math.round(ctx.canvas.width * 0.03));
  const sizeOk = fontSize >= ctx.canvas.width * 0.024;
  const ctaBonus = ctx.byId.cta ? 0.1 : 0;
  const score = (inTopHalf ? 0.6 : 0.2) + (sizeOk ? 0.3 : 0) + ctaBonus;
  return { points: Math.round(weight * Math.min(1, score)), detail: `Precio ${inTopHalf ? 'en la mitad superior (se ve en menos de un segundo)' : 'fuera de la zona de escaneo habitual'}.` };
}

const CRITERIA = {
  impactoVisual, equilibrio, tensionVisual, ritmo, respiracion, puntoFocal,
  legibilidad, recorridoVisual, tamanoRelativo, espacioNegativo, elegancia,
  limpieza, sensacionPremium, percepcionComercial,
};

module.exports = { CRITERIA, centroidDeviation, foreground };
