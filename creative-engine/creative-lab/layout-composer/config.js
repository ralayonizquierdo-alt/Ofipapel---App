// Layout Composer — el componente que faltaba: convierte la decisión de
// Creative Lab (concepto ganador: estilo, composición, iluminación,
// escenario, paleta, espacio de texto) en una plantilla HTML realmente
// distinta, no una única tarjeta genérica. Reutiliza
// design-studio/scripts/render-html.js (Playwright/Chromium) — el mismo
// motor de render que ya usa marketing-engine/07-maquetador y
// diseno-ofipapel, nunca reimplementado.
//
// Duplica (a propósito, mismo criterio ya documentado en varios sitios
// de este repo) las constantes REPO_ROOT/RENDER_SCRIPT/NODE_PATH que
// también tiene marketing-engine/07-maquetador/config.js — NO se
// importan de ahí: creative-lab/ no puede depender de marketing-engine/
// (independencia ya establecida y verificada por grep en todo
// creative-engine/).

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RENDER_SCRIPT = path.join(REPO_ROOT, 'design-studio', 'scripts', 'render-html.js');
const NODE_PATH_FOR_PLAYWRIGHT = '/opt/node22/lib/node_modules';
const RENDER_SCALE = 1;

// compositionId (15, cobertura completa de libraries/compositions.js) ->
// arquetipo de layout (6, en archetypes/). Agrupa composiciones con
// afinidad visual real, no 1:1 — evita 15 plantillas casi idénticas.
const COMPOSITION_TO_ARCHETYPE = {
  'simetria-centrada': 'centrado-clasico',
  'triangular-estable': 'centrado-clasico',
  'radial-desde-producto': 'centrado-clasico',
  'diagonal-dinamica': 'diagonal-dinamico',
  'flat-lay': 'flat-lay-editorial',
  'patron-repeticion': 'flat-lay-editorial',
  'marco-dentro-del-marco': 'flat-lay-editorial',
  'espacio-negativo-dominante': 'flotante-minimalista',
  'regla-tercios': 'cinematico-fullbleed',
  'capas-primer-segundo-plano': 'cinematico-fullbleed',
  'linea-horizonte-baja': 'cinematico-fullbleed',
  'encuadre-cerrado-detalle': 'dividido-lifestyle',
  'encuadre-abierto-contexto': 'dividido-lifestyle',
  'composicion-en-l': 'dividido-lifestyle',
  'asimetria-equilibrada': 'dividido-lifestyle',
};
const DEFAULT_ARCHETYPE = 'centrado-clasico';

// textSpaceId (7, cobertura completa de libraries/typographic-hierarchies.js)
// -> énfasis tipográfico, aplicado dentro de cualquier arquetipo (eje
// independiente de qué arquetipo se eligió).
const TEXT_EMPHASIS_BY_TEXTSPACE = {
  'titular-dominante': 'dominante',
  'texto-superior-cta-inferior': 'dominante',
  'texto-centrado-sobre-fondo': 'dominante',
  'texto-lateral': 'equilibrado',
  'logo-dominante': 'equilibrado',
  'minimo-texto-hero': 'minimo',
  'sin-texto-solo-marca': 'minimo',
};
const DEFAULT_TEXT_EMPHASIS = 'equilibrado';

const ARCHETYPES = {
  'centrado-clasico': require('./archetypes/centrado-clasico.js'),
  'diagonal-dinamico': require('./archetypes/diagonal-dinamico.js'),
  'flotante-minimalista': require('./archetypes/flotante-minimalista.js'),
  'flat-lay-editorial': require('./archetypes/flat-lay-editorial.js'),
  'cinematico-fullbleed': require('./archetypes/cinematico-fullbleed.js'),
  'dividido-lifestyle': require('./archetypes/dividido-lifestyle.js'),
};

module.exports = {
  REPO_ROOT, RENDER_SCRIPT, NODE_PATH_FOR_PLAYWRIGHT, RENDER_SCALE,
  COMPOSITION_TO_ARCHETYPE, DEFAULT_ARCHETYPE,
  TEXT_EMPHASIS_BY_TEXTSPACE, DEFAULT_TEXT_EMPHASIS,
  ARCHETYPES,
};
