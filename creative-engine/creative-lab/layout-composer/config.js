// Layout Composer — desde el sprint "Layout Intelligence" (2026-07-26)
// este módulo SOLO orquesta y renderiza; ya no decide posiciones (eso
// vive en layout-intelligence/, ver su config.js para
// grid/jerarquía/estrategias/umbral). Aquí solo quedan las constantes de
// RENDER (reutiliza design-studio/scripts/render-html.js — Playwright/
// Chromium — el mismo motor que ya usa marketing-engine/07-maquetador y
// diseno-ofipapel, nunca reimplementado).
//
// Duplica (a propósito, mismo criterio ya documentado en varios sitios de
// este repo) las constantes REPO_ROOT/RENDER_SCRIPT/NODE_PATH que también
// tiene marketing-engine/07-maquetador/config.js — NO se importan de ahí:
// creative-lab/ no puede depender de marketing-engine/ (independencia ya
// establecida y verificada por grep en todo creative-engine/).

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RENDER_SCRIPT = path.join(REPO_ROOT, 'design-studio', 'scripts', 'render-html.js');

// En el Lambda real de Netlify ni '/opt/node22/...' ni el Chromium de las
// sesiones en la nube existen (DT-16, `.claude/rax/DEUDA_TECNICA.md`) — ahí
// existe `netlify/functions/node_modules/` (playwright-core +
// @sparticuz/chromium, `netlify/functions/package.json`). Node prueba cada
// entrada de NODE_PATH en orden y usa la primera que exista en disco.
const NODE_PATH_FOR_PLAYWRIGHT = [
  '/opt/node22/lib/node_modules',
  path.join(REPO_ROOT, 'netlify', 'functions', 'node_modules'),
].join(path.delimiter);

const RENDER_SCALE = 1;

// Tipografía real (Outfit, OFL) en vez de 'Inter' sin @font-face — el
// nombre estaba declarado pero nunca cargado, así que todo render caía
// al sans-serif genérico del sistema (bug real de calidad visual: ver
// render-plan.js). Rutas absolutas de fichero, mismo criterio que
// heroImagePath/logoPath (`file://`), no requiere red durante el render.
const FONT_DISPLAY_PATH = path.join(REPO_ROOT, 'design-studio', 'fonts', 'Outfit-Bold.ttf');
const FONT_TEXT_PATH = path.join(REPO_ROOT, 'design-studio', 'fonts', 'Outfit-Regular.ttf');

module.exports = { REPO_ROOT, RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE, FONT_DISPLAY_PATH, FONT_TEXT_PATH };
