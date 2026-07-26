// Layout Composer — el paso final: toma la revisión de Design Director
// Engine (../design-director/) sobre la combinación ArtDirectionDecision
// + LayoutPlan, y renderiza la pieza que superó su criterio a PNG. Nunca
// decide una posición, un patrón, ni si una composición es suficientemente
// buena por su cuenta — todo eso ya está resuelto cuando llega aquí.
//
// Orden real del pipeline (creative-lab/ARCHITECTURE.md, sprint "Design
// Director Engine"): Creative Brief → Creative Lab → Art Direction Engine
// → Composition Engine (layout-intelligence/) → Design Director Engine
// (revisa, puede forzar un patrón distinto) → aquí (render).
//
// NUNCA reimplementa el render — delega en
// design-studio/scripts/render-html.js (Playwright/Chromium), mismo
// patrón ya usado por marketing-engine/07-maquetador y diseno-ofipapel.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE } = require('./config.js');
const { planLayout } = require('../layout-intelligence/service.js');
const { directArt } = require('../art-direction-engine/service.js');
const { reviewComposition } = require('../design-director/service.js');
const { MAX_DESIGN_RETRIES } = require('../design-director/config.js');
const { buildHtmlFromPlan } = require('./render-plan.js');

function renderHtmlToPng(htmlPath, outputPath, width, height) {
  execFileSync(
    process.execPath,
    [RENDER_SCRIPT, htmlPath, outputPath, String(width), String(height), String(RENDER_SCALE)],
    { env: { ...process.env, NODE_PATH: NODE_PATH_FOR_PLAYWRIGHT }, stdio: 'pipe' }
  );
}

/** Qué elementos tienen dato real detrás — Art Direction Engine decide después cuáles sobreviven de verdad (art-direction-engine/service.js#decideElements). Nunca se inventa un elemento sin dato. */
function resolveCandidateElementIds(brief, preparedAssets, generationResult) {
  const ids = [];
  if (generationResult && generationResult.assetPath) ids.push('hero');
  if (preparedAssets.brand.logoPath) ids.push('logo');
  if (brief.copy.title || brief.product.name) ids.push('title');
  if (brief.copy.cta) ids.push('cta');
  if (brief.copy.price) ids.push('price');
  if (preparedAssets.brand.contact) ids.push('contactFooter');
  return ids;
}

/** Foto real (png/jpg vía simulated.provider.js#useRealPhoto, o un proveedor real futuro) vs placeholder abstracto (svg) — Art Direction Engine solo maximiza el protagonismo de la fotografía cuando es real de verdad. */
function isRealPhoto(generationResult) {
  return Boolean(generationResult && generationResult.format && generationResult.format !== 'svg');
}

/**
 * Bucle de revisión: Design Director Engine puntúa la composición con
 * los 14 criterios de crítica de dirección de arte. Si no aprueba (o veta
 * por regla dura / "parece plantilla"), se pide a Art Direction Engine un
 * patrón editorial GENUINAMENTE distinto (nunca el mismo dos veces) y se
 * vuelve a calcular y puntuar — acotado, determinista, nunca bloquea.
 * Igual que el resto de umbrales del sistema, si se agotan los intentos
 * sin aprobar se usa honestamente la mejor puntuación vista, nunca se
 * lanza una excepción por esto.
 */
function reviewLoop(concept, brief, canvas, candidateElementIds, hasRealPhoto) {
  const excludePatternIds = [];
  let best = null;

  for (let attempt = 1; attempt <= Math.max(1, MAX_DESIGN_RETRIES); attempt++) {
    const artDirection = directArt(concept, brief, candidateElementIds, hasRealPhoto, excludePatternIds);
    const planned = planLayout(concept, brief, canvas, artDirection.keepElementIds, artDirection);
    const review = reviewComposition(planned, artDirection, brief, canvas);

    if (!best || review.total > best.review.total) best = { artDirection, planned, review };
    if (review.passed) return best;

    excludePatternIds.push(artDirection.patternId);
  }

  return best;
}

/**
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts (el ganador)
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {object|null} generationResult - GENERATION_RESULT_SHAPE del proveedor (imagen real o placeholder)
 * @param {string} outputDir - directorio de la versión en creative-assets/ donde escribir layout.html + layout-final.png
 * @returns {{strategyId:string, patternId:string, layoutScore:object, layoutAttempts:object[], layoutPassed:boolean, designReview:object, textEmphasis:string, htmlPath:string, outputPath:string}}
 */
function composeLayout(concept, brief, preparedAssets, generationResult, outputDir) {
  if (!generationResult || !generationResult.assetPath) {
    throw new Error('layout-composer: no hay ningún asset generado (ni foto real ni placeholder) que componer.');
  }

  const canvas = { width: preparedAssets.dimensions.width, height: preparedAssets.dimensions.height };
  const candidateElementIds = resolveCandidateElementIds(brief, preparedAssets, generationResult);
  const hasRealPhoto = isRealPhoto(generationResult);

  const { artDirection, planned, review } = reviewLoop(concept, brief, canvas, candidateElementIds, hasRealPhoto);

  const html = buildHtmlFromPlan(planned.planResult, {
    brand: {
      label: preparedAssets.brand.label,
      palette: preparedAssets.brand.palette,
      logoPath: preparedAssets.brand.logoPath,
      contact: preparedAssets.brand.contact,
    },
    product: { name: brief.product.name },
    copy: { title: brief.copy.title, cta: brief.copy.cta, price: brief.copy.price || null },
    heroImagePath: generationResult.assetPath,
    width: canvas.width,
    height: canvas.height,
    textEmphasis: planned.textEmphasis,
    icons: artDirection.icons,
    allowCard: artDirection.allowCard,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'layout.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const outputPath = path.join(outputDir, 'layout-final.png');
  renderHtmlToPng(htmlPath, outputPath, canvas.width, canvas.height);

  return {
    strategyId: planned.strategyId,
    patternId: artDirection.patternId,
    patternLabel: artDirection.patternLabel,
    droppedElementIds: artDirection.droppedElementIds,
    layoutScore: planned.score,
    layoutAttempts: planned.attempts,
    layoutPassed: planned.passed,
    designReview: review,
    textEmphasis: planned.textEmphasis,
    htmlPath, outputPath,
  };
}

module.exports = { composeLayout };
