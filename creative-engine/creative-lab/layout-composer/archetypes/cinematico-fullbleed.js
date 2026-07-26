// Arquetipo "cinematográfico full-bleed" — la imagen ocupa el 100% del
// encuadre, degradado dramático inferior, titular grande sobre la
// imagen. Compositions que mapean aquí: regla de tercios, capas de
// primer/segundo plano, línea de horizonte baja.

const { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton, priceBadge, contactFooter } = require('./_shared.js');

function buildHtml(data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis } = data;
  const palette = brand.palette || {};
  const accent = palette.accent || '#8DC41E';
  const hasCopy = Boolean(copy.title || copy.cta);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Creative Lab — cinematico-fullbleed</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: #111; overflow: hidden; }
  .bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
  .gradient { position: absolute; inset: 0; z-index: 2; background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.75) 100%); }
  .top { position: absolute; z-index: 3; top: ${Math.round(height * 0.04)}px; left: 0; right: 0; display: flex; justify-content: center; }
  .logo-chip { background: #fff; border-radius: 18px; padding: 12px 22px; box-shadow: 0 12px 30px rgba(0,0,0,0.3); }
  .title-wrap { position: absolute; z-index: 3; bottom: 10%; left: 7%; width: 86%; }
  .title { font-size: ${titleFontSize(width, textEmphasis) * 1.05}px; font-weight: 800; color: #fff; line-height: 1.05; text-shadow: 0 6px 24px rgba(0,0,0,0.6); }
</style></head>
<body><div class="frame">
  <img class="bg-img" src="file://${heroImagePath}">
  <div class="gradient"></div>
  <div class="top">${logoChip(brand, Math.round(height * 0.03))}</div>
  <div class="title-wrap">
    ${shouldShowTitle(textEmphasis, hasCopy) ? `<div class="title">${escapeHtml(copy.title || product.name)}</div>` : ''}
    ${ctaButton(copy.cta, accent, width)}
  </div>
  ${priceBadge(copy.price, accent, width)}
  ${contactFooter(brand.contact, width, height)}
</div></body></html>`;
}

module.exports = { buildHtml };
