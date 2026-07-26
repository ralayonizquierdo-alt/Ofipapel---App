// Design Director Engine — la última revisión antes de renderizar.
// Art Direction Engine ya eligió un patrón; Composition Engine
// (layout-intelligence/) ya calculó y puntuó la geometría dentro de ese
// patrón. Este módulo revisa el RESULTADO combinado con los 14 criterios
// de crítica de dirección de arte pedidos explícitamente por el
// propietario, y puede vetar la pieza aunque la puntuación agregada sea
// alta — mismo mecanismo de veto ya usado en
// concept-generator/self-critique.js (Director de Arte Senior): ciertas
// faltas descalifican sin importar el número.

const { CRITERIA, centroidDeviation } = require('./criteria.js');
const { DESIGN_QUALITY_THRESHOLD, TEMPLATE_LOOK, bandFor } = require('./config.js');
const { boxArea } = require('../layout-intelligence/grid.js');

function buildContext(planned, artDirection, brief, canvas) {
  const elements = planned.planResult.elements;
  const byId = {};
  for (const el of elements) byId[el.elementId] = el;
  return {
    elements,
    byId,
    decorations: planned.planResult.decorations || [],
    grid: planned.grid,
    tierByElement: planned.tierByElement,
    strategyId: planned.strategyId,
    artDirection,
    brief,
    canvas,
    textEmphasis: planned.textEmphasis,
    heroOnPhoto: Boolean(byId.hero && byId.hero.kind === 'background-fill'),
  };
}

/**
 * "Debe rechazar automáticamente cualquier campaña que parezca una
 * plantilla automática" — combinación de estrategia más neutra posible
 * (centrado-clasico), alineación centrada, centroide casi exacto y sin
 * ningún recurso editorial (franja diagonal, marco, degradado). Una
 * pieza real de cualquiera de las otras 5 estrategias, o con algo de
 * tensión visual deliberada, nunca dispara esto.
 */
function detectTemplateLook(ctx) {
  if (ctx.strategyId !== TEMPLATE_LOOK.strategyId) return false;
  if (ctx.artDirection.alignment !== TEMPLATE_LOOK.alignment) return false;
  if (TEMPLATE_LOOK.requireNoDecorations && ctx.decorations.length > 0) return false;
  return centroidDeviation(ctx) <= TEMPLATE_LOOK.maxDeviation;
}

/** Reglas duras explícitas del propietario — descalifican sin importar la puntuación agregada. */
function detectHardIssues(ctx) {
  const issues = [];
  const hero = ctx.byId.hero;
  const title = ctx.byId.title;
  if (hero && title && boxArea(title.box) >= boxArea(hero.box)) {
    issues.push('El título compite en tamaño con el producto — el producto debe dominar siempre.');
  }
  if (ctx.brief.copy && ctx.brief.copy.price && !ctx.byId.price) {
    issues.push('Falta el precio en la pieza pese a existir en el brief — debe verse en menos de un segundo.');
  }
  return issues;
}

/**
 * @param {object} planned - salida de layout-intelligence/service.js#planLayout
 * @param {object} artDirection - ArtDirectionDecision usada para producir `planned`
 * @param {object} brief - CreativeBrief
 * @param {{width:number, height:number}} canvas
 * @returns {{total:number, band:string, passed:boolean, looksTemplated:boolean, hardIssues:string[], criteria:object}}
 */
function reviewComposition(planned, artDirection, brief, canvas) {
  const ctx = buildContext(planned, artDirection, brief, canvas);

  const criteria = {};
  for (const [name, fn] of Object.entries(CRITERIA)) criteria[name] = fn(ctx);
  const total = Math.max(0, Math.min(100, Object.values(criteria).reduce((sum, c) => sum + c.points, 0)));

  const looksTemplated = detectTemplateLook(ctx);
  const hardIssues = detectHardIssues(ctx);
  if (looksTemplated) {
    hardIssues.push('La composición es indistinguible de una plantilla automática (simétrica, centrada, sin tensión ni recurso editorial) — se rechaza aunque la puntuación agregada sea alta.');
  }

  return {
    total,
    band: bandFor(total),
    passed: hardIssues.length === 0 && total >= DESIGN_QUALITY_THRESHOLD,
    looksTemplated,
    hardIssues,
    criteria,
  };
}

module.exports = { reviewComposition };
