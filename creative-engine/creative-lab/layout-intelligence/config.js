// Configuración de Layout Intelligence — mismo patrón de variables de
// entorno que creative-lab/config.js (CREATIVE_LAB_QUALITY_THRESHOLD/
// MAX_RETRIES), aplicado aquí a la geometría del layout en vez de a la
// elección del concepto.

const GRID_COLUMNS = Number(process.env.CREATIVE_LAB_LAYOUT_GRID_COLUMNS) || 12;

// Banda de margen estructural, como fracción del lado corto del canvas —
// se resta ANTES de repartir columnas/filas (ver grid.js#buildGrid), no
// es una comprobación a posteriori.
const MARGIN_RATIO = 0.06;

// Fracción del canvas que debe quedar sin ocupar por elementos
// "foreground" (ver hierarchy.js) — ni saturado (<min) ni desperdiciado
// (>max). "foreground" excluye kind:'background-fill' (el hero cuando
// ocupa todo el encuadre no cuenta como "clutter").
const WHITESPACE_TARGET = { min: 0.30, max: 0.65 };

// Rango sano de contraste de área entre el elemento de mayor tier y el de
// menor tier presentes en el plan (excluyendo kind:'background-fill') —
// por debajo de `min` la jerarquía no se nota; por encima de `max` es
// desproporcionado sin aportar más claridad. `max` calibrado contra
// HIERARCHY_TIER_SPANS real (dominante vs. mínimo da ~24-30x según
// aspect ratio, verificado con el test sintético de
// layout-intelligence/ — un logo MUY pequeño frente al producto es
// correcto, no un defecto a penalizar).
const CONTRAST_TARGET = { min: 1.4, max: 40 };

// Desviación máxima "aceptable" del centroide ponderado respecto al
// centro del canvas, como fracción de la media diagonal — deliberadamente
// generosa porque las estrategias asimétricas (diagonal, dividido) tienen
// desviación intencionada; una estrategia simétrica la tendrá cerca de 0
// por construcción, no porque se le exija aquí.
const BALANCE_MAX_DEVIATION = 0.35;

// Umbral de puntuación (0-100, ver balance-score.js) y reintentos
// acotados antes de renderizar — mismo criterio exacto que
// creative-lab/config.js#QUALITY_THRESHOLD/MAX_RETRIES, aplicado a la
// geometría del layout: si el plan no supera el umbral, se descarta y se
// prueba la siguiente estrategia (nunca la misma dos veces, nunca bucle
// infinito).
const LAYOUT_QUALITY_THRESHOLD = Number(process.env.CREATIVE_LAB_LAYOUT_QUALITY_THRESHOLD) || 70;
const LAYOUT_MAX_RETRIES = Number(process.env.CREATIVE_LAB_LAYOUT_MAX_RETRIES) || 4;

// Tier de jerarquía visual -> tamaño relativo, expresado como fracción
// del grid INTERIOR (tras descontar márgenes) — nunca un porcentaje del
// canvas tecleado a mano por elemento. hierarchy.js resuelve qué tier le
// toca a cada elemento; grid.js#cellsToBox convierte estos ratios en
// columnas/filas reales según GRID_COLUMNS y el aspect ratio del canvas.
const HIERARCHY_TIER_SPANS = {
  dominante: { colRatio: 0.62, rowRatio: 0.46 },
  primario: { colRatio: 0.42, rowRatio: 0.16 },
  secundario: { colRatio: 0.30, rowRatio: 0.10 },
  minimo: { colRatio: 0.20, rowRatio: 0.06 },
};

// price/cta/contactFooter no están en el vocabulario de jerarquía de
// marketing-engine (brief.artDirection.hierarchy) — reciben un tier fijo
// documentado en vez de fingir que se derivan de una fuente que no los
// conoce (ver hierarchy.js).
const FIXED_TIER_BY_ELEMENT = {
  price: 'secundario',
  cta: 'secundario',
  contactFooter: 'minimo',
  icons: 'secundario',
};

// compositionId (15, cobertura completa de libraries/compositions.js) ->
// estrategia de equilibrio (6, en strategies/). Migrado tal cual desde
// layout-composer/config.js#COMPOSITION_TO_ARCHETYPE (mismo agrupamiento
// por afinidad visual ya curado y ya referenciado en ARCHITECTURE.md/
// DECISIONES.md — no se renombra sin motivo).
const STRATEGY_BY_COMPOSITION = {
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
const DEFAULT_STRATEGY = 'centrado-clasico';

// Parámetros propios de estrategias concretas — declarados aquí (no
// tecleados dentro del fichero de la estrategia) para que sean tan
// inspeccionables/ajustables como el resto de reglas de composición.
const SPLIT_SCREEN_RATIO = 0.58; // dividido-lifestyle: fracción de filas que ocupa la mitad superior (foto)
const FRAME_INSET_CELLS = 1; // flat-lay-editorial: borde en celdas de grid entre el margen estructural y el "marco" interior

// Orden de rotación determinista para los reintentos — si la estrategia
// primaria no supera el umbral, se prueba la siguiente de esta lista
// (arrancando justo después de la primaria, dando la vuelta), nunca al
// azar. Mismo criterio de determinismo que concept-generator/ (hash, no
// Math.random en ningún punto del repo).
const STRATEGY_ROTATION = [
  'centrado-clasico', 'diagonal-dinamico', 'flotante-minimalista',
  'flat-lay-editorial', 'cinematico-fullbleed', 'dividido-lifestyle',
];

// textSpaceId (7, cobertura completa de libraries/typographic-hierarchies.js)
// -> énfasis tipográfico del titular. Migrado tal cual desde
// layout-composer/config.js#TEXT_EMPHASIS_BY_TEXTSPACE.
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

function bandFor(score) {
  if (score >= 85) return 'excelente';
  if (score >= 70) return 'bueno';
  if (score >= 50) return 'aceptable';
  return 'insuficiente';
}

// Pesos de balance-score.js — suman 100, mismo criterio que
// concept-score/config.js#WEIGHTS.
const SCORE_WEIGHTS = {
  marginCompliance: 20,
  whitespaceBalance: 25,
  hierarchyContrast: 20,
  visualBalance: 20,
  overlapPenalty: 15,
};

module.exports = {
  GRID_COLUMNS, MARGIN_RATIO, WHITESPACE_TARGET, CONTRAST_TARGET, BALANCE_MAX_DEVIATION,
  LAYOUT_QUALITY_THRESHOLD, LAYOUT_MAX_RETRIES,
  HIERARCHY_TIER_SPANS, FIXED_TIER_BY_ELEMENT,
  STRATEGY_BY_COMPOSITION, DEFAULT_STRATEGY, STRATEGY_ROTATION,
  TEXT_EMPHASIS_BY_TEXTSPACE, DEFAULT_TEXT_EMPHASIS,
  SPLIT_SCREEN_RATIO, FRAME_INSET_CELLS,
  SCORE_WEIGHTS,
  bandFor,
};
