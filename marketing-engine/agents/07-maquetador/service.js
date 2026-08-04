// Maquetador — NUNCA diseña desde cero. Recibe imágenes, fondos y
// elementos (copy) ya decididos por los agentes anteriores y construye
// automáticamente la publicación usando una plantilla inteligente.
//
// A DIFERENCIA de los agentes 01/02/04/05/06 (simulados), este es
// INTEGRACIÓN REAL: delega el render en
// design-studio/scripts/render-html.js (Playwright/Chromium), exactamente
// igual que ya usa `diseno-ofipapel` — no hay "modo simulado" que activar
// más adelante, esto ya produce un archivo real hoy.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { REPO_ROOT, RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE, TEMPLATES_BY_LAYOUT_ID, DEFAULT_LAYOUT_ID } = require('./config.js');
const { jobDir: getJobDir } = require('../../core/job-store.js');

const AGENT_ID = 'maquetador';
const BRAND_KIT_PATH = path.join(REPO_ROOT, 'design-studio', 'brand-kit.json');

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  const brandKit = loadBrandKit();
  const brand = { ...brandKit[job.input.brand], __repoRoot: REPO_ROOT };

  const provider = job.state['proveedor-ia'];
  const { title, cta } = job.state.copywriter;
  const width = provider.width || 1080;
  const height = provider.height || 1920;

  const tmpDir = path.join(getJobDir(job.id), 'tmp');
  const assetsDir = path.join(getJobDir(job.id), 'assets');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  // Plantilla inteligente según lo que decidió 02-director-arte — ya no
  // una única plantilla fija para todas las campañas (ver
  // templates/pieza-generica.js, cabecera, y config.js#TEMPLATES_BY_LAYOUT_ID).
  const layoutId = (job.state['director-arte'] && job.state['director-arte'].layoutId) || DEFAULT_LAYOUT_ID;
  const { buildHtml } = TEMPLATES_BY_LAYOUT_ID[layoutId] || TEMPLATES_BY_LAYOUT_ID[DEFAULT_LAYOUT_ID];

  const html = buildHtml({
    brand,
    productName: job.input.productName,
    title,
    cta,
    assetPath: provider.assetPath,
    width,
    height,
  });

  const htmlPath = path.join(tmpDir, 'pieza.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const outputPath = path.join(assetsDir, 'pieza-final.png');
  renderHtmlToPng(htmlPath, outputPath, width, height);

  const output = {
    renderedAssetPath: outputPath,
    templateUsed: layoutId,
    width,
    height,
  };

  assertShape(output, OUTPUT_SHAPE, 'output');
  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function loadBrandKit() {
  delete require.cache[require.resolve(BRAND_KIT_PATH)];
  return require(BRAND_KIT_PATH);
}

function renderHtmlToPng(htmlPath, outputPath, width, height) {
  execFileSync(
    process.execPath,
    [RENDER_SCRIPT, htmlPath, outputPath, String(width), String(height), String(RENDER_SCALE)],
    {
      env: { ...process.env, NODE_PATH: NODE_PATH_FOR_PLAYWRIGHT },
      stdio: 'pipe',
    }
  );
}

module.exports = { run };
