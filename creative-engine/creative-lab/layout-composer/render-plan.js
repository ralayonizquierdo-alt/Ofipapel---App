// Convierte un LayoutPlan (geometría ya calculada y puntuada por
// layout-intelligence/) en el HTML final autocontenido — el ÚNICO
// renderer, sustituye a los 6 `archetypes/*.js` retirados en el sprint
// "Layout Intelligence". No decide NINGUNA posición: solo traduce cada
// `{elementId, kind, box}` ya resuelto al marcado/estilo de
// render-helpers.js.

const {
  escapeHtml, heroMarkup, logoMarkup, titleMarkup, ctaMarkup, priceMarkup, contactFooterMarkup, decorationMarkup,
} = require('./render-helpers.js');

/**
 * @param {{elements: Array<{elementId:string,kind:string,box:object}>, decorations: object[]}} planResult
 * @param {{brand:object, product:object, copy:object, heroImagePath:string, width:number, height:number, textEmphasis:string}} data
 * @returns {string} HTML autocontenido, listo para design-studio/scripts/render-html.js
 */
function buildHtmlFromPlan(planResult, data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis } = data;
  const palette = brand.palette || {};
  const primary = palette.primary || '#1A5C1A';
  const accent = palette.accent || '#8DC41E';
  const background = palette.background || '#F7F9F7';

  const byId = {};
  for (const el of planResult.elements) byId[el.elementId] = el;

  const layers = [];
  for (const deco of planResult.decorations || []) layers.push(decorationMarkup(deco, primary, accent));
  if (byId.hero) layers.push(heroMarkup(byId.hero, heroImagePath));
  if (byId.logo) layers.push(logoMarkup(byId.logo, brand));
  const heroOnPhoto = Boolean(byId.hero && byId.hero.kind === 'background-fill');
  if (byId.title) layers.push(titleMarkup(byId.title, copy.title || product.name, textEmphasis, width, primary, heroOnPhoto));
  if (byId.cta) layers.push(ctaMarkup(byId.cta, copy.cta, accent, width));
  if (byId.price) layers.push(priceMarkup(byId.price, copy.price, accent, width));
  if (byId.contactFooter) layers.push(contactFooterMarkup(byId.contactFooter, brand.contact, width));

  // El fondo base es el "background" de marca (claro) — funciona tanto
  // para hero:'boxed' (foto flotando sobre él) como para hero:'background-fill'
  // (queda oculto detrás de la foto, que cubre el 100% del canvas).
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Layout Intelligence — ${escapeHtml(product.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Inter', sans-serif; }
</style></head>
<body>
<div style="position:relative;width:${width}px;height:${height}px;background:${background};overflow:hidden;">
${layers.join('\n')}
</div>
</body></html>`;
}

module.exports = { buildHtmlFromPlan };
