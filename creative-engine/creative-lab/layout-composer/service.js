// Layout Composer — el paso final: toma el LayoutPlan que ya calculó y
// puntuó layout-intelligence/ (grid + jerarquía + tamaños relativos +
// márgenes + espacios en blanco + reglas de equilibrio, evaluado ANTES de
// existir ningún HTML) y lo convierte en la pieza real, renderizada a
// PNG. Nunca decide una posición por su cuenta — eso ya está resuelto
// cuando llega aquí.
//
// NUNCA reimplementa el render — delega en
// design-studio/scripts/render-html.js (Playwright/Chromium), mismo
// patrón ya usado por marketing-engine/07-maquetador y diseno-ofipapel.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE } = require('./config.js');
const { planLayout } = require('../layout-intelligence/service.js');
const { buildHtmlFromPlan } = require('./render-plan.js');

function renderHtmlToPng(htmlPath, outputPath, width, height) {
  execFileSync(
    process.execPath,
    [RENDER_SCRIPT, htmlPath, outputPath, String(width), String(height), String(RENDER_SCALE)],
    { env: { ...process.env, NODE_PATH: NODE_PATH_FOR_PLAYWRIGHT }, stdio: 'pipe' }
  );
}

/** Qué elementos hay que colocar, según qué datos existen de verdad — nunca se inventa un elemento sin dato detrás. */
function resolveElementIds(brief, preparedAssets, generationResult) {
  const ids = [];
  if (generationResult && generationResult.assetPath) ids.push('hero');
  if (preparedAssets.brand.logoPath) ids.push('logo');
  if (brief.copy.title || brief.product.name) ids.push('title');
  if (brief.copy.cta) ids.push('cta');
  if (brief.copy.price) ids.push('price');
  if (preparedAssets.brand.contact) ids.push('contactFooter');
  return ids;
}

/**
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts (el ganador)
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {object|null} generationResult - GENERATION_RESULT_SHAPE del proveedor (imagen real o placeholder)
 * @param {string} outputDir - directorio de la versión en creative-assets/ donde escribir layout.html + layout-final.png
 * @returns {{strategyId: string, layoutScore: object, layoutAttempts: object[], layoutPassed: boolean, textEmphasis: string, htmlPath: string, outputPath: string}}
 */
function composeLayout(concept, brief, preparedAssets, generationResult, outputDir) {
  if (!generationResult || !generationResult.assetPath) {
    throw new Error('layout-composer: no hay ningún asset generado (ni foto real ni placeholder) que componer.');
  }

  const canvas = { width: preparedAssets.dimensions.width, height: preparedAssets.dimensions.height };
  const elementIds = resolveElementIds(brief, preparedAssets, generationResult);

  const planned = planLayout(concept, brief, canvas, elementIds);

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
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'layout.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const outputPath = path.join(outputDir, 'layout-final.png');
  renderHtmlToPng(htmlPath, outputPath, canvas.width, canvas.height);

  return {
    strategyId: planned.strategyId,
    layoutScore: planned.score,
    layoutAttempts: planned.attempts,
    layoutPassed: planned.passed,
    textEmphasis: planned.textEmphasis,
    htmlPath, outputPath,
  };
}

module.exports = { composeLayout };
