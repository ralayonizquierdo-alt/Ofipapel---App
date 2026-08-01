// Sección "creative-direction" — refleja la decisión de
// 01-director-creativo (marketing-engine): estrategia, tono, familia
// gráfica. Traducción directa, no hay nada que interpretar aquí.

function build(brief) {
  const { strategy, tone, graphicFamily } = brief.creativeDirection || {};
  if (!strategy && !tone && !graphicFamily) return null;

  const parts = [];
  if (strategy) parts.push(strategy);
  if (tone) parts.push(`Tono visual: ${tone}`);
  if (graphicFamily) parts.push(`Familia gráfica: ${graphicFamily}`);

  return { id: 'creative-direction', label: 'Dirección creativa', text: parts.join('. ') };
}

module.exports = { build };
