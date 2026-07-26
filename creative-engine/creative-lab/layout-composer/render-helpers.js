// Helpers de RENDER — convierten una caja ya calculada por
// layout-intelligence/ (`{x,y,w,h}` en píxeles) en el marcado/estilo
// visual de cada tipo de elemento. Nunca deciden posición ni tamaño (eso
// ya lo decidió layout-intelligence/strategies/) — solo cómo se ve dentro
// de la caja que les toca. Sustituye a archetypes/_shared.js (retirado en
// el sprint "Layout Intelligence": las posiciones ya no se escriben a
// mano por arquetipo).

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TITLE_SIZE_FACTOR = { dominante: 0.078, equilibrado: 0.06, minimo: 0.04 };

function titleFontSize(canvasWidth, textEmphasis) {
  return Math.round(canvasWidth * (TITLE_SIZE_FACTOR[textEmphasis] || TITLE_SIZE_FACTOR.equilibrado));
}

function positionedDiv(box, innerHtml, extraStyle = '') {
  return `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;${extraStyle}">${innerHtml}</div>`;
}

/** kind:'background-fill' cubre el canvas entero (cover); kind:'boxed' es una placa clara con sombra y la foto en contain dentro — mismo lenguaje visual que ya tenían los arquetipos retirados. */
function heroMarkup(el, heroImagePath) {
  if (!heroImagePath) return '';
  if (el.kind === 'background-fill') {
    return positionedDiv(el.box, `<img src="file://${heroImagePath}" style="width:100%;height:100%;object-fit:cover;display:block;">`, 'z-index:1;overflow:hidden;');
  }
  return positionedDiv(
    el.box,
    `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 42%, #ffffff 0%, #f2f8f2 70%);border-radius:24px;box-shadow:0 24px 60px rgba(0,0,0,0.28);"></div>
     <img src="file://${heroImagePath}" style="position:relative;width:100%;height:100%;object-fit:contain;display:block;">`,
    'z-index:2;'
  );
}

function logoMarkup(el, brand) {
  if (!brand.logoPath) return '';
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;background:#fff;border-radius:16px;box-shadow:0 10px 26px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;">
       <img src="file://${brand.logoPath}" style="max-width:82%;max-height:70%;object-fit:contain;display:block;">
     </div>`,
    'z-index:4;'
  );
}

/**
 * Color de texto según lo que hay detrás: blanco + sombra sobre foto a
 * sangre completa (`onPhoto:true`, contraste variable, blanco es la
 * apuesta segura); color de marca oscuro sobre el fondo claro sólido que
 * usa el resto de estrategias (blanco casi invisible ahí — bug real
 * detectado mirando el render antes de darlo por bueno, ver
 * ARCHITECTURE.md).
 */
function titleMarkup(el, text, textEmphasis, canvasWidth, primary, onPhoto) {
  if (!text) return '';
  const fontSize = titleFontSize(canvasWidth, textEmphasis);
  const style = onPhoto
    ? `color:#fff;text-shadow:0 4px 18px rgba(0,0,0,0.45);`
    : `color:${primary};text-shadow:none;`;
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:${fontSize}px;font-weight:800;line-height:1.15;${style}">${escapeHtml(text)}</div>`,
    'z-index:4;'
  );
}

function ctaMarkup(el, cta, accent, canvasWidth) {
  if (!cta) return '';
  const fontSize = Math.max(14, Math.round(canvasWidth * 0.028));
  const padding = Math.max(10, Math.round(canvasWidth * 0.013));
  return positionedDiv(
    el.box,
    `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;">
       <div style="background:${accent};color:#1a1a1a;font-weight:800;font-size:${fontSize}px;padding:${padding}px ${Math.round(padding * 2.4)}px;border-radius:999px;white-space:nowrap;">${escapeHtml(cta)}</div>
     </div>`,
    'z-index:4;'
  );
}

function priceMarkup(el, price, accent, canvasWidth) {
  if (!price) return '';
  const fontSize = Math.max(16, Math.round(canvasWidth * 0.032));
  return positionedDiv(
    el.box,
    `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;">
       <div style="background:${accent};color:#1a1a1a;font-weight:800;font-size:${fontSize}px;padding:0 18px;border-radius:16px;box-shadow:0 10px 24px rgba(0,0,0,0.35);white-space:nowrap;">${escapeHtml(price)}</div>
     </div>`,
    'z-index:5;'
  );
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

function contactFooterMarkup(el, contact, canvasWidth) {
  if (!contact) return '';
  const fontSize = Math.max(12, Math.round(canvasWidth * 0.022));
  const iconSize = Math.max(16, Math.round(canvasWidth * 0.026));
  const parts = [contact.phoneDisplay, contact.website, contact.address].filter(Boolean).map(escapeHtml);
  const text = parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const icons = (contact.socialIcons || [])
    .map((id) => socialIconSvg(id, iconSize, '#ffffff'))
    .join('<span style="display:inline-block;width:10px;"></span>');
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;background:rgba(0,0,0,0.55);padding:0 ${Math.round(canvasWidth * 0.04)}px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-sizing:border-box;">
       <div style="color:#fff;font-size:${fontSize}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${text}</div>
       <div style="display:flex;align-items:center;flex-shrink:0;">${icons}</div>
     </div>`,
    'z-index:6;'
  );
}

function decorationMarkup(deco, primary, accent) {
  if (deco.type === 'frame-border') {
    return positionedDiv(deco.box, '', `border:3px solid ${accent};border-radius:4px;z-index:1;pointer-events:none;`);
  }
  if (deco.type === 'gradient-bottom') {
    return `<div style="position:absolute;inset:0;z-index:2;background:linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.75) 100%);pointer-events:none;"></div>`;
  }
  if (deco.type === 'diagonal-accent') {
    return `<div style="position:absolute;left:0;top:0;width:${deco.splitX}px;height:100%;background:linear-gradient(120deg, ${primary} 0%, ${primary} 80%, ${accent} 100%);z-index:1;clip-path:polygon(0 0, 100% 0, 88% 100%, 0 100%);pointer-events:none;"></div>`;
  }
  return '';
}

module.exports = {
  escapeHtml, titleFontSize,
  heroMarkup, logoMarkup, titleMarkup, ctaMarkup, priceMarkup, contactFooterMarkup, decorationMarkup,
};
