// Sección "format" — especificación técnica. Siempre última (los tokens
// técnicos de calidad/resolución pesan menos si van primero, y aquí no
// compiten por atención con el sujeto). Necesita `preparedAssets` para
// las dimensiones ya resueltas por Asset Pipeline.

function build(brief, preparedAssets) {
  const dims = preparedAssets && preparedAssets.dimensions;
  const contentClass = brief.format && brief.format.contentClass;

  const parts = [];
  if (dims) parts.push(`Formato ${dims.width}×${dims.height}px (${dims.format}, plataforma: ${dims.platform})`);
  if (contentClass) parts.push(`Tipo de contenido: ${contentClass}`);
  parts.push('alta calidad, nítido, listo para publicación');

  return { id: 'format', label: 'Formato técnico', text: parts.join('. ') };
}

module.exports = { build };
