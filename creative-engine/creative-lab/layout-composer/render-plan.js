// Convierte un LayoutPlan (geometría ya calculada y puntuada por
// layout-intelligence/, guiada por art-direction-engine/) en el HTML
// final autocontenido — el ÚNICO renderer. No decide NINGUNA posición ni
// patrón: solo traduce cada `{elementId, kind, box}` ya resuelto al
// marcado/estilo de render-helpers.js.

const {
  escapeHtml, heroMarkup, logoMarkup, titleMarkup, ctaMarkup, priceMarkup, contactFooterMarkup, iconRowMarkup, decorationMarkup,
  footerDividerMarkup,
} = require('./render-helpers.js');

/**
 * @param {{elements: Array<{elementId:string,kind:string,box:object}>, decorations: object[]}} planResult
 * @param {{brand:object, product:object, copy:object, heroImagePath:string, width:number, height:number, textEmphasis:string, icons:object[], allowCard:boolean, variantSeed:string}} data
 * @returns {string} HTML autocontenido, listo para design-studio/scripts/render-html.js
 */
function buildHtmlFromPlan(planResult, data) {
  const { brand, product, copy, heroImagePath, width, height, textEmphasis, icons, allowCard, variantSeed } = data;
  const palette = brand.palette || {};
  const primary = palette.primary || '#1A5C1A';
  const accent = palette.accent || '#8DC41E';
  const background = palette.background || '#F7F9F7';

  const byId = {};
  for (const el of planResult.elements) byId[el.elementId] = el;

  const layers = [];
  for (const deco of planResult.decorations || []) layers.push(decorationMarkup(deco, primary, accent, variantSeed));
  if (byId.hero) layers.push(heroMarkup(byId.hero, heroImagePath, allowCard, variantSeed));
  if (byId.logo) layers.push(logoMarkup(byId.logo, brand, variantSeed));
  const heroOnPhoto = Boolean(byId.hero && byId.hero.kind === 'background-fill');
  if (byId.title) layers.push(titleMarkup(byId.title, copy.title || product.name, textEmphasis, width, primary, heroOnPhoto, variantSeed));
  if (byId.cta) layers.push(ctaMarkup(byId.cta, copy.cta, accent, primary, width, variantSeed));
  if (byId.icons) layers.push(iconRowMarkup(byId.icons, icons, heroOnPhoto ? '#ffffff' : primary, width, variantSeed));
  if (byId.price) layers.push(priceMarkup(byId.price, copy.price, accent, primary, width, variantSeed));
  if (byId.contactFooter) {
    layers.push(footerDividerMarkup(byId.contactFooter.box, primary, variantSeed));
    layers.push(contactFooterMarkup(byId.contactFooter, brand.contact, primary, width, variantSeed));
  }

  // El fondo base es el "background" de marca (claro) — funciona tanto
  // para hero:'boxed' (foto flotando sobre él) como para hero:'background-fill'
  // (queda oculto detrás de la foto, que cubre el 100% del canvas).
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Art Direction Engine — ${escapeHtml(product.name)}</title>
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
