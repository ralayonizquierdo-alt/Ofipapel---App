// Sección "brand" — paleta resuelta (asset-pipeline/), tipografía,
// eslogan de contexto. Necesita `preparedAssets`, no solo el brief — los
// hexes de color y las rutas de logo/fondo se resuelven en Asset
// Pipeline, no aquí.

function build(brief, preparedAssets) {
  const brand = preparedAssets && preparedAssets.brand;
  if (!brand) return null;

  const parts = [`Marca: ${brand.label || (brief.brand && brief.brand.id) || ''}`];

  const hexes = brand.palette ? [brand.palette.primary, brand.palette.secondary, brand.palette.accent].filter(Boolean) : [];
  if (hexes.length > 0) parts.push(`Paleta de marca a respetar: ${hexes.join(', ')}`);

  if (brand.fonts && brand.fonts.body) parts.push(`Tipografía de referencia (si aplica composición tipográfica): ${brand.fonts.body}`);

  // Contexto de tono, no una instrucción de renderizar el texto — ver
  // sections/copy.js y el principio de composición posterior.
  if (brand.slogan) parts.push(`Eslogan de marca, como referencia de tono (no renderizar como texto): "${brand.slogan}"`);

  return { id: 'brand', label: 'Marca', text: parts.join('. ') };
}

module.exports = { build };
