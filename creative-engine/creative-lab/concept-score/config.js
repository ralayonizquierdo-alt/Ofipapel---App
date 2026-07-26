// Pesos de la Capa 1 (evaluación de plan, gratuita — sin llamar a ningún
// proveedor). Suman 100. Configurables aquí, sin tocar service.js.

const WEIGHTS = {
  baseValidator: 60, // reutiliza los 6 checks de creative-engine/creative-validator/ (branding, legibilidad, presencia de producto, espacio de logo, espacio de textos, composición)
  referenceQuality: 25, // impacto visual medio de las referencias mezcladas (visualImpactLevel)
  originality: 15, // el concepto SIEMPRE cumple la norma de variación propia (invariante de concept-generator/) — puntuación fija, documentado más abajo
};

function bandFor(score) {
  if (score >= 85) return 'excelente';
  if (score >= 70) return 'bueno';
  if (score >= 50) return 'aceptable';
  return 'insuficiente';
}

module.exports = { WEIGHTS, bandFor };
