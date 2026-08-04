// Configuración de Design Director Engine — mismo patrón de variables de
// entorno que el resto de umbrales del repo (CREATIVE_LAB_QUALITY_THRESHOLD,
// CREATIVE_LAB_LAYOUT_QUALITY_THRESHOLD...).
//
// Este es el gate MÁS estricto de los tres (Creative Lab decide el
// concepto, Composition Engine calcula la geometría, Design Director
// revisa el resultado combinado con criterio de dirección de arte) — de
// ahí un umbral más alto que el de Composition Engine.

const DESIGN_QUALITY_THRESHOLD = Number(process.env.CREATIVE_LAB_DESIGN_QUALITY_THRESHOLD) || 78;

// Cada reintento pide a Art Direction Engine un patrón editorial
// GENUINAMENTE distinto (excludePatternIds) — no repite composición
// dentro del mismo patrón, eso ya lo agotó Composition Engine
// internamente antes de llegar aquí. Acotado a 3: con 15 patrones
// disponibles, tres intentos ya cubren un abanico real sin arriesgar
// tiempo de generación desproporcionado.
const MAX_DESIGN_RETRIES = Number(process.env.CREATIVE_LAB_DESIGN_MAX_RETRIES) || 3;

// Pesos de los 14 criterios pedidos explícitamente por el propietario —
// suman 100. "El producto debe dominar la composición" se refleja en el
// peso más alto (puntoFocal); legibilidad y limpieza (nunca solapes,
// nunca texto ilegible) también pesan por encima de la media porque son
// errores que una campaña profesional real jamás comete.
const CRITERIA_WEIGHTS = {
  impactoVisual: 8,
  equilibrio: 7,
  tensionVisual: 6,
  ritmo: 6,
  respiracion: 7,
  puntoFocal: 9,
  legibilidad: 8,
  recorridoVisual: 6,
  tamanoRelativo: 7,
  espacioNegativo: 6,
  elegancia: 7,
  limpieza: 8,
  sensacionPremium: 7,
  percepcionComercial: 8,
};

// "Tensión visual" sana: ni perfectamente centrado (estático, aburrido)
// ni caótico. Pico de puntuación en este rango de desviación del
// centroide ponderado respecto al centro (misma métrica que
// layout-intelligence/balance-score.js#scoreVisualBalance, reutilizada
// aquí con una curva distinta — ver criteria.js).
const HEALTHY_TENSION_RANGE = { center: 0.20, tolerance: 0.22 };

// "Parece plantilla automática" — el veto explícito que pidió el
// propietario. Composición sospechosa de plantilla: estrategia más
// simétrica posible, alineación centrada, centroide casi exactamente en
// el centro (nada de tensión), y sin ningún recurso editorial
// (decoraciones — franja diagonal, marco, degradado). Cualquier pieza
// real de las 6 estrategias con algo de personalidad se libra de esto
// por construcción; solo la combinación más neutra posible lo dispara.
// maxDeviation calibrado contra la propia geometría del sistema (no un
// número arbitrario): incluso el apilado centrado más vainilla posible
// (logo→hero→título, todos centrados horizontalmente) tiene ~20% de
// desviación de centroide de forma estructural, porque el peso visual
// nunca queda perfectamente centrado en el eje vertical de un apilado —
// verificado con un caso sintético antes de fijar este número (una
// primera versión con 0.06 nunca disparaba el veto ni en el caso más
// plantilla posible). 0.22 sí lo atrapa sin penalizar composiciones con
// algo de personalidad real.
const TEMPLATE_LOOK = {
  strategyId: 'centrado-clasico',
  alignment: 'center',
  maxDeviation: 0.22,
  requireNoDecorations: true,
};

function bandFor(score) {
  if (score >= 85) return 'excelente';
  if (score >= 70) return 'bueno';
  if (score >= 50) return 'aceptable';
  return 'insuficiente';
}

module.exports = {
  DESIGN_QUALITY_THRESHOLD, MAX_DESIGN_RETRIES,
  CRITERIA_WEIGHTS, HEALTHY_TENSION_RANGE, TEMPLATE_LOOK,
  bandFor,
};
