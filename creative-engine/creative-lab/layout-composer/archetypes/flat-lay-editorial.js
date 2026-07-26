// Arquetipo "flat-lay editorial" — producto enmarcado dentro de un
// bloque de color, sensación de orden y curaduría. Compositions que
// mapean aquí: flat-lay, patrón por repetición, marco dentro del marco.

const { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton } = require('./_shared.js');

function buildHtml(data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis } = data;
  const palette = brand.palette || {};
  const primary = palette.primary || '#1A5C1A';
  const secondary = palette.secondary || primary;
  const accent = palette.accent || '#8DC41E';
  const hasCopy = Boolean(copy.title || copy.cta);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Creative Lab — flat-lay-editorial</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: #fff; overflow: hidden; padding: ${Math.round(width * 0.05)}px; }
  .border-frame { position: absolute; inset: ${Math.round(width * 0.05)}px; border: 3px solid ${secondary}; z-index: 1; }
  .top { position: relative; z-index: 3; padding-top: ${Math.round(height * 0.02)}px; display: flex; justify-content: center; }
  .logo-chip { background: transparent; padding: 0; }
  .product-frame {
    position: relative; z-index: 2; margin: ${Math.round(height * 0.08)}px auto 0; width: 70%; height: 42%;
    background: ${primary}0d; display: flex; align-items: center; justify-content: center;
  }
  .product-img { max-width: 85%; max-height: 85%; object-fit: contain; }
  .title-wrap { position: relative; z-index: 3; margin-top: ${Math.round(height * 0.06)}px; text-align: center; }
  .title { font-size: ${titleFontSize(width, textEmphasis)}px; font-weight: 700; color: ${primary}; line-height: 1.25; }
</style></head>
<body><div class="frame">
  <div class="border-frame"></div>
  <div class="top">${logoChip(brand, Math.round(height * 0.028))}</div>
  <div class="product-frame"><img class="product-img" src="file://${heroImagePath}"></div>
  <div class="title-wrap">
    ${shouldShowTitle(textEmphasis, hasCopy) ? `<div class="title">${escapeHtml(copy.title || product.name)}</div>` : ''}
    ${ctaButton(copy.cta, accent, width)}
  </div>
</div></body></html>`;
}

module.exports = { buildHtml };
