// Sección "campaign" — refleja marketing-engine/intelligence/ (Campaign
// Recommender). Igual que product-intelligence.js: corta, solo contexto
// visual/de tono, nunca datos de negocio en bruto (variantCount, CTA
// sugerido, etc. no pintan nada en un prompt de imagen).

function build(brief) {
  const c = brief.campaign;
  if (!c) return null;

  const parts = [];
  if (c.campaignType) parts.push(`Estilo de campaña: ${c.campaignType}`);
  if (c.creativeStyle) parts.push(c.creativeStyle);

  if (parts.length === 0) return null;
  return { id: 'campaign', label: 'Campaña', text: parts.join('. ') };
}

module.exports = { build };
