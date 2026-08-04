// Convierte un LayoutPlan (geometría ya calculada y puntuada por
// layout-intelligence/, guiada por art-direction-engine/) en el HTML
// final autocontenido — el ÚNICO renderer. No decide NINGUNA posición ni
// patrón: solo traduce cada `{elementId, kind, box}` ya resuelto al
// marcado/estilo de render-helpers.js.

const {
  escapeHtml, heroMarkup, logoMarkup, titleMarkup, ctaMarkup, priceMarkup, contactFooterMarkup, iconRowMarkup, decorationMarkup,
  footerDividerMarkup,
} = require('./render-helpers.js');
const { FONT_DISPLAY_PATH, FONT_TEXT_PATH } = require('./config.js');
const { overlaps } = require('../layout-intelligence/grid.js');

/**
 * Bug real encontrado renderizando 'mediamarkt-editorial' con la
 * estrategia 'diagonal-dinamico': el titular decidía su color SOLO
 * mirando si el hero era una foto a sangre completa (`heroOnPhoto`) —
 * pero 'diagonal-dinamico' siempre pinta un degradado de marca
 * (primary→accent, decoration 'diagonal-accent') detrás del bloque de
 * texto, y 'mediamarkt-editorial' además puede añadir una banda de color
 * sólida ('color-band') en el mismo lado. En ambos casos el título caía
 * en color primary (verde oscuro) sobre un fondo también verde oscuro —
 * prácticamente ilegible. Esta función decide si el titular vive sobre
 * un fondo de marca oscuro (foto O decoración de color) para que
 * titleMarkup elija siempre texto claro ahí, nunca solo por ser foto.
 */
function titleNeedsLightText(titleBox, decorations, canvasWidth) {
  return decorations.some((deco) => {
    if (deco.type === 'color-band' && deco.box) return overlaps(titleBox, deco.box);
    if (deco.type === 'diagonal-accent') {
      const titleCenterX = titleBox.x + titleBox.w / 2;
      return deco.flip ? titleCenterX > deco.splitX : titleCenterX < deco.splitX;
    }
    return false;
  });
}

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
  const decorations = planResult.decorations || [];
  const titleOnDark = heroOnPhoto || (Boolean(byId.title) && titleNeedsLightText(byId.title.box, decorations, width));
  if (byId.title) layers.push(titleMarkup(byId.title, copy.title || product.name, textEmphasis, width, primary, titleOnDark, variantSeed));
  if (byId.cta) layers.push(ctaMarkup(byId.cta, copy.cta, accent, primary, width, variantSeed));
  if (byId.icons) {
    const iconsOnDark = heroOnPhoto || (Boolean(byId.icons) && titleNeedsLightText(byId.icons.box, decorations, width));
    layers.push(iconRowMarkup(byId.icons, icons, iconsOnDark ? '#ffffff' : primary, width, variantSeed));
  }
  if (byId.price) layers.push(priceMarkup(byId.price, copy.price, accent, primary, width, variantSeed));
  if (byId.contactFooter) {
    layers.push(footerDividerMarkup(byId.contactFooter.box, primary, variantSeed));
    layers.push(contactFooterMarkup(byId.contactFooter, brand.contact, primary, width, variantSeed));
  }

  // El fondo base es el "background" de marca (claro) — funciona tanto
  // para hero:'boxed' (foto flotando sobre él) como para hero:'background-fill'
  // (queda oculto detrás de la foto, que cubre el 100% del canvas).
  // Tipografía real embebida (Outfit, OFL) — antes se declaraba
  // 'Inter, sans-serif' sin ningún @font-face que la cargara: todo render
  // caía silenciosamente al sans genérico del contenedor (DejaVu/Liberation),
  // muy lejos del nivel de una pieza de agencia real. `font-display:block`
  // evita el parpadeo con fallback en el instante del screenshot.
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="hz:canvas-width" content="${width}"><meta name="hz:canvas-height" content="${height}">
<title>Art Direction Engine — ${escapeHtml(product.name)}</title>
<style>
  @font-face { font-family: 'Outfit'; src: url('file://${FONT_TEXT_PATH}') format('truetype'); font-weight: 400; font-style: normal; font-display: block; }
  @font-face { font-family: 'Outfit'; src: url('file://${FONT_DISPLAY_PATH}') format('truetype'); font-weight: 700; font-style: normal; font-display: block; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'Outfit', sans-serif; }
</style></head>
<body>
<div style="position:relative;width:${width}px;height:${height}px;background:${background};overflow:hidden;">
${layers.join('\n')}
</div>
</body></html>`;
}

module.exports = { buildHtmlFromPlan };
