// Arquetipo "flotante minimalista" — espacio negativo dominante, producto
// pequeño y flotante, texto mínimo. Composition que mapea aquí:
// espacio-negativo-dominante.

const { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton, priceBadge, contactFooter } = require('./_shared.js');

function buildHtml(data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis } = data;
  const palette = brand.palette || {};
  const accent = palette.accent || '#8DC41E';
  const background = palette.background || '#F7F9F7';
  const hasCopy = Boolean(copy.title || copy.cta);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Creative Lab — flotante-minimalista</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: ${background}; overflow: hidden; }
  .top { position: absolute; z-index: 3; top: ${Math.round(height * 0.05)}px; left: 0; right: 0; display: flex; justify-content: center; }
  .logo-chip { background: transparent; padding: 0; }
  .product-img {
    position: absolute; z-index: 2; top: 16%; left: 25%; width: 50%; height: 28%; object-fit: contain;
    filter: drop-shadow(0 30px 40px rgba(0,0,0,0.15));
  }
  .title-wrap { position: absolute; z-index: 3; bottom: 12%; left: 10%; width: 80%; text-align: center; }
  .title { font-size: ${titleFontSize(width, textEmphasis)}px; font-weight: 600; color: #1a1a1a; line-height: 1.3; letter-spacing: 0.02em; }
</style></head>
<body><div class="frame">
  <div class="top">${logoChip(brand, Math.round(height * 0.025))}</div>
  <img class="product-img" src="file://${heroImagePath}">
  <div class="title-wrap">
    ${shouldShowTitle(textEmphasis, hasCopy) ? `<div class="title">${escapeHtml(copy.title || product.name)}</div>` : ''}
    ${ctaButton(copy.cta, accent, width)}
  </div>
  ${priceBadge(copy.price, accent, width)}
  ${contactFooter(brand.contact, width, height)}
</div></body></html>`;
}

module.exports = { buildHtml };
