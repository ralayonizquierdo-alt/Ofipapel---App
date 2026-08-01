// Rutas e integración con design-studio/scripts/render-html.js — el
// Maquetador NUNCA reimplementa el render, siempre delega en ese script ya
// existente (mismo patrón que design-studio/README.md documenta para
// cualquier consumidor de "salida standalone").

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RENDER_SCRIPT = path.join(REPO_ROOT, 'design-studio', 'scripts', 'render-html.js');

// Mismo NODE_PATH documentado en design-studio/README.md — playwright está
// instalado globalmente en las sesiones en la nube de Claude Code, no como
// dependencia local de este repo. En el Lambda real de Netlify ninguna de
// esas dos rutas existe (DT-16, `.claude/rax/DEUDA_TECNICA.md`); ahí lo que
// existe es `netlify/functions/node_modules/` (playwright-core +
// @sparticuz/chromium, declarados en `netlify/functions/package.json`).
// Node prueba cada entrada de NODE_PATH en orden y usa la primera que
// exista en disco — un solo valor válido en cada entorno, sin necesidad de
// detectar en qué entorno estamos desde aquí.
const NODE_PATH_FOR_PLAYWRIGHT = [
  '/opt/node22/lib/node_modules',
  path.join(REPO_ROOT, 'netlify', 'functions', 'node_modules'),
].join(path.delimiter);

const RENDER_SCALE = 1;

// Registro de plantillas inteligentes por layoutId — el punto de
// extensión que pieza-generica.js ya documentaba: un fichero nuevo en
// templates/ + una entrada aquí, cero cambios en service.js más allá de
// la búsqueda por layoutId (con 'layout-centrado' como default si el
// layoutId no está registrado, para no romper jobs existentes).
const TEMPLATES_BY_LAYOUT_ID = {
  'layout-centrado': require('./templates/pieza-generica.js'),
  'layout-diagonal': require('./templates/layout-diagonal.js'),
};
const DEFAULT_LAYOUT_ID = 'layout-centrado';

module.exports = { REPO_ROOT, RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE, TEMPLATES_BY_LAYOUT_ID, DEFAULT_LAYOUT_ID };
