// Arquetipo "dividido lifestyle" — pantalla partida, imagen a un lado,
// bloque de texto al otro. Compositions que mapean aquí: encuadre
// cerrado en el detalle, encuadre abierto con contexto, composición en
// L, asimetría equilibrada.

const { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton, priceBadge, contactFooter } = require('./_shared.js');

function buildHtml(data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis } = data;
  const palette = brand.palette || {};
  const primary = palette.primary || '#1A5C1A';
  const accent = palette.accent || '#8DC41E';
  const hasCopy = Boolean(copy.title || copy.cta);
  const splitHeight = Math.round(height * 0.58);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Creative Lab — dividido-lifestyle</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
  .frame { position: relative; width: ${width}px; height: ${height}px; background: #fff; overflow: hidden; }
  .top-half { position: absolute; top: 0; left: 0; width: 100%; height: ${splitHeight}px; overflow: hidden; }
  .top-half img { width: 100%; height: 100%; object-fit: cover; }
  .bottom-half {
    position: absolute; top: ${splitHeight}px; left: 0; width: 100%; height: ${height - splitHeight}px;
    background: ${primary}; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0 8%;
  }
  .top { position: absolute; z-index: 3; top: ${Math.round(height * 0.03)}px; left: 0; right: 0; display: flex; justify-content: center; }
  .logo-chip { background: #fff; border-radius: 18px; padding: 10px 20px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
  .title { font-size: ${titleFontSize(width, textEmphasis)}px; font-weight: 700; color: #fff; line-height: 1.2; text-align: center; }
</style></head>
<body><div class="frame">
  <div class="top-half"><img src="file://${heroImagePath}"></div>
  <div class="top">${logoChip(brand, Math.round(height * 0.028))}</div>
  <div class="bottom-half">
    ${shouldShowTitle(textEmphasis, hasCopy) ? `<div class="title">${escapeHtml(copy.title || product.name)}</div>` : ''}
    ${ctaButton(copy.cta, accent, width)}
  </div>
  ${priceBadge(copy.price, accent, width)}
  ${contactFooter(brand.contact, width, height)}
</div></body></html>`;
}

module.exports = { buildHtml };
