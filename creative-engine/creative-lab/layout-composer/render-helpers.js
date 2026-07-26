// Helpers de RENDER — convierten una caja ya calculada por
// layout-intelligence/ (`{x,y,w,h}` en píxeles) en el marcado/estilo
// visual de cada tipo de elemento. Nunca deciden posición ni tamaño (eso
// ya lo decidió layout-intelligence/strategies/, guiado por
// art-direction-engine/) — solo cómo se ve dentro de la caja que les
// toca.
//
// Sprint "Art Direction Engine" (2026-07-26): se elimina por completo la
// "placa" (fondo radial + sombra pesada) que llevaba el hero y la
// "tarjeta" blanca con sombra del logo — el propietario las prohibió
// explícitamente ("cajas blancas gigantes", "tarjetas enormes"). El hero
// ahora se apoya directamente sobre el fondo, con una sombra sutil sobre
// la propia imagen (no un bloque detrás) salvo que el patrón editorial
// elegido pida explícitamente un marco (`allowCard`, solo 2 de los 15
// patrones — "framed-minimal" — y ni siquiera ahí es una tarjeta pesada,
// es una línea fina).
//
// Sprint "Design Evolution v2 / Component Library" (mismo día): este
// fichero deja de tener el ÚNICO tratamiento visual posible por
// elemento — cada función que lo tenía ahora pide una variante a
// ../component-library/ (determinista, por `variantSeed`) y delega el
// fragmento visual concreto en component-library/renderers.js. Sigue
// siendo el único sitio que sabe posicionar (`positionedDiv`) y el único
// que escapa texto (`escapeHtml`) — component-library nunca hace
// ninguna de las dos cosas.

const { selectVariant } = require('../component-library/service.js');
const {
  priceBadgeMarkup, ctaButtonMarkup, logoChipMarkup, contactFooterBackground,
  frameDecorationStyle, cornerBracketsMarkup, heroCardStyle, heroCardFilter,
  dividerMarkup, iconWrapperStyle, titleAccentMarkup,
} = require('../component-library/renderers.js');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escala subida y trackeada más apretada (letter-spacing negativo en
// titleMarkup) frente al 0.078/0.06/0.04 original — pero con mesura: un
// primer intento a 0.098/0.072/0.05 (crítica dura contra el nombre real
// del Ventilador Muvip, que es un SKU largo) hacía que el titular de 4
// líneas TAPARA al producto — rompe "el producto es el único
// protagonista", el peor pecado posible en esta campaña. `font-weight:700`
// en todo el fichero (nunca 800): el Outfit-Bold embebido
// (render-plan.js) ES weight 700 — pedir 800 fuerza un negrita
// sintético (blur, trazo desigual) en vez del fichero real ya cargado.
const TITLE_SIZE_FACTOR = { dominante: 0.086, equilibrado: 0.064, minimo: 0.045 };

// Nombres de producto reales varían muchísimo en longitud (de "AirPods
// Pro" a un SKU completo tipo "Ventilador Nebulizador 75W 40cm con Mando
// MUVIP - MV0596") — un solo ratio fijo para cualquier longitud de texto
// hacía que un titular largo se convirtiera en un bloque de 4 líneas que
// tapaba al producto, rompiendo "el producto es el único protagonista"
// (crítica dura contra el render real del Ventilador Muvip). Un titular
// corto conserva todo su impacto; uno largo se encoge, nunca por debajo
// de un suelo legible.
const LONG_TITLE_CHARS = 34;
const MIN_TITLE_SHRINK = 0.62;

function titleFontSize(canvasWidth, textEmphasis, textLength) {
  const base = canvasWidth * (TITLE_SIZE_FACTOR[textEmphasis] || TITLE_SIZE_FACTOR.equilibrado);
  if (!textLength || textLength <= LONG_TITLE_CHARS) return Math.round(base);
  const shrink = Math.max(MIN_TITLE_SHRINK, LONG_TITLE_CHARS / textLength);
  return Math.round(base * shrink);
}

function positionedDiv(box, innerHtml, extraStyle = '') {
  return `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;${extraStyle}">${innerHtml}</div>`;
}

/**
 * kind:'background-fill' cubre el canvas entero (cover, sin marco — es
 * el fondo). kind:'boxed' es la fotografía directamente sobre el fondo,
 * SIN placa ni sombra pesada detrás — solo un `drop-shadow` sutil sobre
 * la propia imagen para que no quede "pegada". `allowCard` (solo 2
 * patrones, ver art-direction-engine/patterns.js) pide una de las 3
 * variantes de `heroCard` (component-library/) — nunca una tarjeta con
 * degradado pesado, eso sigue prohibido.
 */
function heroMarkup(el, heroImagePath, allowCard, variantSeed) {
  if (!heroImagePath) return '';
  if (el.kind === 'background-fill') {
    return positionedDiv(el.box, `<img src="file://${heroImagePath}" style="width:100%;height:100%;object-fit:cover;display:block;">`, 'z-index:1;overflow:hidden;');
  }
  const cardVariant = allowCard ? selectVariant('heroCard', variantSeed) : null;
  const frameStyle = cardVariant ? heroCardStyle(cardVariant) : '';
  const filterStyle = heroCardFilter(cardVariant);
  return positionedDiv(
    el.box,
    `<img src="file://${heroImagePath}" style="width:100%;height:100%;object-fit:contain;display:block;${filterStyle}">`,
    `z-index:2;${frameStyle}`
  );
}

/** Sin tarjeta blanca — el logo se apoya en el fondo tal cual, en una de las 3 variantes de `logoChip` (component-library/): plano, insignia circular, o con marca de acento. */
function logoMarkup(el, brand, variantSeed) {
  if (!brand.logoPath) return '';
  const imgTag = `<img src="file://${brand.logoPath}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.25));">`;
  const variant = selectVariant('logoChip', variantSeed);
  const accent = brand.palette && brand.palette.accent ? brand.palette.accent : '#8DC41E';
  return positionedDiv(el.box, logoChipMarkup(variant, { imgTag, accent }), 'z-index:4;');
}

/**
 * Color de texto según lo que hay detrás: blanco + sombra sobre foto a
 * sangre completa (`onPhoto:true`, contraste variable, blanco es la
 * apuesta segura); color de marca oscuro sobre el fondo claro sólido que
 * usa el resto de estrategias (blanco casi invisible ahí — bug real
 * detectado mirando el render antes de darlo por bueno, ver
 * ARCHITECTURE.md).
 */
function titleMarkup(el, text, textEmphasis, canvasWidth, primary, onPhoto, variantSeed) {
  if (!text) return '';
  const fontSize = titleFontSize(canvasWidth, textEmphasis, text.length);
  const style = onPhoto
    ? `color:#fff;text-shadow:0 4px 18px rgba(0,0,0,0.45);`
    : `color:${primary};text-shadow:none;`;
  const accentVariant = selectVariant('titleAccent', variantSeed);
  const accentColor = onPhoto ? '#ffffff' : primary;
  const accentBar = titleAccentMarkup(accentVariant, el.box, accentColor);
  const titleBox = positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:${fontSize}px;font-weight:700;letter-spacing:-0.02em;line-height:1.05;${style}">${escapeHtml(text)}</div>`,
    'z-index:4;'
  );
  return accentBar + titleBox;
}

/** CTA en una de las 4 variantes de `ctaButton` (component-library/) — nunca siempre la misma píldora sólida. */
function ctaMarkup(el, cta, accent, primary, canvasWidth, variantSeed) {
  if (!cta) return '';
  const fontSize = Math.max(14, Math.round(canvasWidth * 0.026));
  const padding = Math.max(9, Math.round(canvasWidth * 0.011));
  const variant = selectVariant('ctaButton', variantSeed);
  const inner = ctaButtonMarkup(variant, { text: escapeHtml(cta), accent, primary, fontSize, padding });
  return positionedDiv(el.box, `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;">${inner}</div>`, 'z-index:4;');
}

/** Badge de precio en una de las 4 variantes de `priceBadge` (component-library/) — cubre también "cintas" (ribbon-corner) y "etiquetas" (outline-tag) como tratamientos visuales del mismo precio real, nunca copy nuevo. */
function priceMarkup(el, price, accent, primary, canvasWidth, variantSeed) {
  if (!price) return '';
  const fontSize = Math.max(16, Math.round(canvasWidth * 0.03));
  const variant = selectVariant('priceBadge', variantSeed);
  const inner = priceBadgeMarkup(variant, { text: escapeHtml(price), accent, primary, fontSize });
  return positionedDiv(el.box, `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;">${inner}</div>`, 'z-index:5;');
}

// Iconos Facebook/Instagram (viewBox 0 0 24 24, monocromo, hereda color
// vía `fill`) — genéricos, no enlazan a ningún perfil real (ver
// brand-kit.json#contact).
const SOCIAL_ICON_PATHS = {
  facebook: '<path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.45 2.91h-2.33v7.03C18.34 21.24 22 17.08 22 12.06z"/>',
  instagram: '<path d="M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.25.64-.42 1.37-.47 2.43C2 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.06.22 1.79.47 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.64.25 1.37.42 2.43.47C8.94 22 9.28 22 12 22s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.06-.22-1.79-.47-2.43-.26-.66-.6-1.22-1.16-1.77-.55-.56-1.11-.9-1.77-1.16-.64-.25-1.37-.42-2.43-.47C15.06 2.01 14.72 2 12 2zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.51.21 1.86.35.47.18.8.4 1.15.75.35.35.57.68.75 1.15.14.35.31.88.35 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.21 1.51-.35 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.35.14-.88.31-1.86.35-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.51-.21-1.86-.35-.47-.18-.8-.4-1.15-.75-.35-.35-.57-.68-.75-1.15-.14-.35-.31-.88-.35-1.86C3.81 14.99 3.8 14.67 3.8 12s.01-2.99.06-4.04c.04-.98.21-1.51.35-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.35-.14.88-.31 1.86-.35C9.01 3.81 9.33 3.8 12 3.8zm0 3.05a5.15 5.15 0 100 10.3 5.15 5.15 0 000-10.3zm0 8.5a3.35 3.35 0 110-6.7 3.35 3.35 0 010 6.7zm5.35-8.7a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z"/>',
};

function socialIconSvg(id, size, color) {
  const iconPath = SOCIAL_ICON_PATHS[id];
  if (!iconPath) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">${iconPath}</svg>`;
}

/**
 * Franja inferior en una de las 3 variantes de `contactFooter`
 * (component-library/): degradado (tratamiento anterior a este sprint),
 * barra sólida de color primario, o panel translúcido — nunca siempre el
 * mismo fondo. `solid-bar` usa siempre texto blanco (fondo sólido y
 * oscuro por diseño de marca); las otras dos ya partían de fondo oscuro
 * con foto/canvas detrás, mismo criterio que antes.
 */
function contactFooterMarkup(el, contact, primary, canvasWidth, variantSeed) {
  if (!contact) return '';
  const fontSize = Math.max(12, Math.round(canvasWidth * 0.021));
  const iconSize = Math.max(15, Math.round(canvasWidth * 0.024));
  const parts = [contact.phoneDisplay, contact.website, contact.address].filter(Boolean).map(escapeHtml);
  const text = parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const icons = (contact.socialIcons || [])
    .map((id) => socialIconSvg(id, iconSize, '#ffffff'))
    .join('<span style="display:inline-block;width:10px;"></span>');
  const variant = selectVariant('contactFooter', variantSeed);
  const background = contactFooterBackground(variant, primary);
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;${background}padding:0 ${Math.round(canvasWidth * 0.04)}px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;box-sizing:border-box;padding-bottom:${Math.round(canvasWidth * 0.012)}px;">
       <div style="color:#fff;font-size:${fontSize}px;font-weight:400;letter-spacing:0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${text}</div>
       <div style="display:flex;align-items:center;flex-shrink:0;">${icons}</div>
     </div>`,
    'z-index:6;'
  );
}

/**
 * Fila de iconos "documentación técnica premium" (Apple/Bosch/Sony/JBL/
 * Logitech/Brother) — a la vez la "caja de beneficios" del sistema (cada
 * icono+etiqueta es un beneficio real del producto, no un elemento
 * nuevo sin dato detrás). Mismo tamaño, mismo grosor de trazo (1.75,
 * fijado UNA vez aquí para los 6, nunca por icono), misma separación —
 * estructuralmente imposible que salgan inconsistentes entre sí. Una de
 * las 2 variantes de `iconSystem` (component-library/) decide si cada
 * icono lleva un fondo circular suave detrás o no.
 */
function iconRowMarkup(el, icons, primary, canvasWidth, variantSeed) {
  if (!icons || icons.length === 0) return '';
  const iconSize = Math.max(20, Math.round(canvasWidth * 0.032));
  const labelSize = Math.max(10, Math.round(canvasWidth * 0.015));
  const variant = selectVariant('iconSystem', variantSeed);
  const wrapperStyle = iconWrapperStyle(variant, primary);
  const items = icons
    .map(
      (icon) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0;">
        <div style="display:flex;align-items:center;justify-content:center;${wrapperStyle}">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icon.markup}</svg>
        </div>
        <span style="font-size:${labelSize}px;font-weight:400;letter-spacing:0.01em;color:${primary};text-align:center;line-height:1.2;">${escapeHtml(icon.label)}</span>
      </div>`
    )
    .join('');
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;display:flex;align-items:flex-start;justify-content:space-between;gap:${Math.round(canvasWidth * 0.02)}px;">${items}</div>`,
    'z-index:4;'
  );
}

function decorationMarkup(deco, primary, accent, variantSeed) {
  if (deco.type === 'frame-border') {
    const variant = selectVariant('frameDecoration', variantSeed);
    if (variant === 'corner-brackets') return cornerBracketsMarkup(deco.box);
    return positionedDiv(deco.box, '', `${frameDecorationStyle(variant)}z-index:1;pointer-events:none;`);
  }
  if (deco.type === 'gradient-bottom') {
    return `<div style="position:absolute;inset:0;z-index:2;background:linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.75) 100%);pointer-events:none;"></div>`;
  }
  if (deco.type === 'diagonal-accent') {
    // `flip` (strategies/diagonal-dinamico.js): cuando Editorial Design
    // Engine ancla el hero a la izquierda en vez de a la derecha, el
    // acento diagonal tiene que vivir en el lado contrario (junto al
    // texto, ahora a la derecha) con el corte diagonal en el borde
    // opuesto — mismo recurso, espejado, no una franja fija siempre en
    // el mismo sitio.
    if (deco.flip) {
      return `<div style="position:absolute;left:${deco.splitX}px;top:0;right:0;height:100%;background:linear-gradient(60deg, ${accent} 0%, ${primary} 20%, ${primary} 100%);z-index:1;clip-path:polygon(0 0, 100% 0, 100% 100%, 12% 100%);pointer-events:none;"></div>`;
    }
    return `<div style="position:absolute;left:0;top:0;width:${deco.splitX}px;height:100%;background:linear-gradient(120deg, ${primary} 0%, ${primary} 80%, ${accent} 100%);z-index:1;clip-path:polygon(0 0, 100% 0, 88% 100%, 0 100%);pointer-events:none;"></div>`;
  }
  if (deco.type === 'color-band') {
    // Caja ya calculada por layout-intelligence/service.js#applyColorBand
    // (píxeles reales) — aquí solo se pinta, mismo criterio que el resto
    // de decorations (el renderer nunca traduce edge/widthRatio).
    // z-index:2 (no 1): bug real encontrado renderizando 'mediamarkt-editorial'
    // — la banda vivía al mismo z-index que el hero a sangre completa
    // (kind:'background-fill', también z-index:1) y, al pintarse ANTES en
    // el DOM, quedaba completamente tapada por la foto. Mismo nivel que
    // 'gradient-bottom' (también pensado para pintarse sobre el hero).
    return positionedDiv(deco.box, '', `background:linear-gradient(180deg, ${accent} 0%, ${primary} 100%);z-index:2;pointer-events:none;`);
  }
  return '';
}

/** Línea fina opcional justo encima del footer de contacto — una de las 3 variantes de `divider` (component-library/), incluida 'none' (ausencia deliberada, cubre "divisores"). No es una `decoration` del LayoutPlan porque su posición depende del footer YA renderizado, no de una decisión de geometría — se calcula aquí, no en layout-intelligence/. */
function footerDividerMarkup(footerBox, primary, variantSeed) {
  const variant = selectVariant('divider', variantSeed);
  const box = { x: footerBox.x, y: footerBox.y - 2, w: footerBox.w, h: 2 };
  return dividerMarkup(variant, box, primary);
}

module.exports = {
  escapeHtml, titleFontSize,
  heroMarkup, logoMarkup, titleMarkup, ctaMarkup, priceMarkup, contactFooterMarkup, iconRowMarkup, decorationMarkup,
  footerDividerMarkup,
};
