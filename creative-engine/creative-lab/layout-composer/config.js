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
const NODE_PATH_FOR_PLAYWRIGHT = '/opt/node22/lib/node_modules';
const RENDER_SCALE = 1;

module.exports = { REPO_ROOT, RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE };
