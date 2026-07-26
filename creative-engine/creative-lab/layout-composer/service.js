// Layout Composer — convierte el concepto ganador (estilo, composición,
// escenario, paleta, espacio de texto) en una pieza HTML real, renderizada
// a PNG. Es la pieza que faltaba entre "Creative Lab decide" y "se ve
// reflejado en la imagen final": antes de esto, el maquetado final
// siempre era el mismo cartel, sin importar qué concepto hubiera ganado.
//
// NUNCA reimplementa el render — delega en
// design-studio/scripts/render-html.js (Playwright/Chromium), mismo
// patrón ya usado por marketing-engine/07-maquetador y diseno-ofipapel.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE,
  COMPOSITION_TO_ARCHETYPE, DEFAULT_ARCHETYPE,
  TEXT_EMPHASIS_BY_TEXTSPACE, DEFAULT_TEXT_EMPHASIS,
  ARCHETYPES,
} = require('./config.js');

function selectArchetype(concept) {
  return COMPOSITION_TO_ARCHETYPE[concept.compositionId] || DEFAULT_ARCHETYPE;
}

function selectTextEmphasis(concept) {
  return TEXT_EMPHASIS_BY_TEXTSPACE[concept.textSpaceId] || DEFAULT_TEXT_EMPHASIS;
}

function renderHtmlToPng(htmlPath, outputPath, width, height) {
  execFileSync(
    process.execPath,
    [RENDER_SCRIPT, htmlPath, outputPath, String(width), String(height), String(RENDER_SCALE)],
    { env: { ...process.env, NODE_PATH: NODE_PATH_FOR_PLAYWRIGHT }, stdio: 'pipe' }
  );
}

/**
 * @param {object} concept - salida de concept-generator/service.js#generateConcepts (el ganador)
 * @param {object} brief - CreativeBrief
 * @param {object} preparedAssets - salida de asset-pipeline/service.js#prepareAssets
 * @param {object|null} generationResult - GENERATION_RESULT_SHAPE del proveedor (imagen real o placeholder)
 * @param {string} outputDir - directorio de la versión en creative-assets/ donde escribir layout.html + layout-final.png
 * @returns {{archetype: string, textEmphasis: string, htmlPath: string, outputPath: string}}
 */
function composeLayout(concept, brief, preparedAssets, generationResult, outputDir) {
  if (!generationResult || !generationResult.assetPath) {
    throw new Error('layout-composer: no hay ningún asset generado (ni foto real ni placeholder) que componer.');
  }

  const archetype = selectArchetype(concept);
  const textEmphasis = selectTextEmphasis(concept);
  const { buildHtml } = ARCHETYPES[archetype];

  const html = buildHtml({
    brand: {
      label: preparedAssets.brand.label,
      palette: preparedAssets.brand.palette,
      logoPath: preparedAssets.brand.logoPath,
      contact: preparedAssets.brand.contact,
    },
    product: { name: brief.product.name },
    copy: { title: brief.copy.title, cta: brief.copy.cta, price: brief.copy.price || null },
    heroImagePath: generationResult.assetPath,
    width: preparedAssets.dimensions.width,
    height: preparedAssets.dimensions.height,
    textEmphasis,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'layout.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const outputPath = path.join(outputDir, 'layout-final.png');
  renderHtmlToPng(htmlPath, outputPath, preparedAssets.dimensions.width, preparedAssets.dimensions.height);

  return { archetype, textEmphasis, htmlPath, outputPath };
}

module.exports = { composeLayout, selectArchetype, selectTextEmphasis };
