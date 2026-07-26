// Arquetipo "centrado clásico" — producto centrado sobre placa, texto en
// franja inferior. Compositions que mapean aquí (config.js): simetría
// centrada, triangular estable, radial desde producto.

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
<title>Creative Lab — centrado-clasico</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: ${primary}; overflow: hidden; }
  .top { position: absolute; z-index: 3; top: ${Math.round(height * 0.04)}px; left: 0; right: 0; display: flex; justify-content: center; }
  .logo-chip { background: #fff; border-radius: 18px; padding: 12px 22px; box-shadow: 0 12px 30px rgba(0,0,0,0.3); }
  .product-plate {
    position: absolute; z-index: 2; top: 22%; left: 8%; width: 84%; height: 45%;
    background: radial-gradient(circle at 50% 42%, #ffffff 0%, #f2f8f2 70%);
    border-radius: 40px; box-shadow: 0 30px 70px rgba(0,0,0,0.35);
  }
  .product-img { position: absolute; z-index: 3; top: 24%; left: 0; width: 100%; height: 40%; object-fit: contain; }
  .title-wrap { position: absolute; z-index: 3; bottom: 12%; left: 6%; width: 88%; text-align: center; }
  .title { font-size: ${titleFontSize(width, textEmphasis)}px; font-weight: 800; color: #fff; line-height: 1.15; text-shadow: 0 4px 18px rgba(0,0,0,0.5); }
</style></head>
<body><div class="frame">
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
