// Rutas e integración con design-studio/scripts/render-html.js — el
// Maquetador NUNCA reimplementa el render, siempre delega en ese script ya
// existente (mismo patrón que design-studio/README.md documenta para
// cualquier consumidor de "salida standalone").

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RENDER_SCRIPT = path.join(REPO_ROOT, 'design-studio', 'scripts', 'render-html.js');

// Mismo NODE_PATH documentado en design-studio/README.md — playwright está
// instalado globalmente en las sesiones en la nube de Claude Code, no como
// dependencia local de este repo.
const NODE_PATH_FOR_PLAYWRIGHT = '/opt/node22/lib/node_modules';

const RENDER_SCALE = 1;

module.exports = { REPO_ROOT, RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE };
