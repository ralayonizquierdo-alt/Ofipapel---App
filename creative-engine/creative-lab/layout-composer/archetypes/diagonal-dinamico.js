// Arquetipo "diagonal dinámico" — franja diagonal de acento, producto
// desplazado a un lado. Composition que mapea aquí: diagonal-dinamica.

const { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton, priceBadge, contactFooter } = require('./_shared.js');

function buildHtml(data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis } = data;
  const palette = brand.palette || {};
  const primary = palette.primary || '#1A5C1A';
  const accent = palette.accent || '#8DC41E';
  const hasCopy = Boolean(copy.title || copy.cta);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Creative Lab — diagonal-dinamico</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: #ffffff; overflow: hidden; }
  .diagonal-stripe {
    position: absolute; z-index: 1; top: -10%; left: -20%; width: 140%; height: 55%;
    background: linear-gradient(115deg, ${primary} 55%, ${accent} 100%);
    transform: rotate(-8deg); box-shadow: 0 30px 60px rgba(0,0,0,0.2);
  }
  .top { position: absolute; z-index: 3; top: ${Math.round(height * 0.04)}px; left: 0; right: 0; display: flex; justify-content: center; }
  .logo-chip { background: #fff; border-radius: 18px; padding: 12px 22px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
  .product-plate {
    position: absolute; z-index: 2; top: 32%; right: 6%; width: 72%; height: 32%;
    background: radial-gradient(circle at 50% 42%, #ffffff 0%, #f2f8f2 70%);
    border-radius: 40px; box-shadow: 0 30px 70px rgba(0,0,0,0.3);
  }
  .product-img { position: absolute; z-index: 3; top: 34%; right: 6%; width: 72%; height: 28%; object-fit: contain; }
  .title-wrap { position: absolute; z-index: 3; bottom: 8%; left: 6%; width: 88%; }
  .title { font-size: ${titleFontSize(width, textEmphasis)}px; font-weight: 800; color: ${primary}; line-height: 1.1; }
</style></head>
<body><div class="frame">
  <div class="diagonal-stripe"></div>
  <div class="top">${logoChip(brand, Math.round(height * 0.03))}</div>
  <div class="product-plate"></div>
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
