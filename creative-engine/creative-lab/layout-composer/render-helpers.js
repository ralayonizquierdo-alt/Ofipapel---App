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

/**
 * kind:'background-fill' cubre el canvas entero (cover, sin marco — es
 * el fondo). kind:'boxed' es la fotografía directamente sobre el fondo,
 * SIN placa ni sombra pesada detrás — solo un `drop-shadow` sutil sobre
 * la propia imagen para que no quede "pegada". `allowCard` (solo 2
 * patrones, ver art-direction-engine/patterns.js) añade una línea fina
 * alrededor, nunca una tarjeta con degradado.
 */
function heroMarkup(el, heroImagePath, allowCard) {
  if (!heroImagePath) return '';
  if (el.kind === 'background-fill') {
    return positionedDiv(el.box, `<img src="file://${heroImagePath}" style="width:100%;height:100%;object-fit:cover;display:block;">`, 'z-index:1;overflow:hidden;');
  }
  const frameStyle = allowCard ? 'border:1px solid rgba(0,0,0,0.08);padding:2%;box-sizing:border-box;' : '';
  return positionedDiv(
    el.box,
    `<img src="file://${heroImagePath}" style="width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 18px 34px rgba(0,0,0,0.20));">`,
    `z-index:2;${frameStyle}`
  );
}

/** Sin tarjeta blanca — el logo se apoya en el fondo tal cual, con una sombra ligera sobre la propia imagen para legibilidad en cualquier fondo. */
function logoMarkup(el, brand) {
  if (!brand.logoPath) return '';
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
       <img src="file://${brand.logoPath}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.25));">
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
  const fontSize = Math.max(14, Math.round(canvasWidth * 0.026));
  const padding = Math.max(9, Math.round(canvasWidth * 0.011));
  return positionedDiv(
    el.box,
    `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;">
       <div style="background:${accent};color:#1a1a1a;font-weight:800;font-size:${fontSize}px;padding:${padding}px ${Math.round(padding * 2.2)}px;border-radius:999px;white-space:nowrap;">${escapeHtml(cta)}</div>
     </div>`,
    'z-index:4;'
  );
}

/** Badge fino — sin la sombra pesada de antes, solo peso tipográfico y el color de acento de marca en el numeral. */
function priceMarkup(el, price, accent, canvasWidth) {
  if (!price) return '';
  const fontSize = Math.max(16, Math.round(canvasWidth * 0.03));
  return positionedDiv(
    el.box,
    `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;">
       <div style="background:${accent};color:#1a1a1a;font-weight:800;font-size:${fontSize}px;padding:6px 16px;border-radius:10px;white-space:nowrap;">${escapeHtml(price)}</div>
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

/**
 * Franja inferior más ligera que antes: degradado (transparente arriba,
 * oscuro abajo) en vez de un bloque sólido plano — se lee como un
 * recurso editorial (mismo lenguaje que `gradient-bottom` en
 * cinematico-fullbleed), no como una caja pegada encima de la pieza.
 */
function contactFooterMarkup(el, contact, canvasWidth) {
  if (!contact) return '';
  const fontSize = Math.max(12, Math.round(canvasWidth * 0.021));
  const iconSize = Math.max(15, Math.round(canvasWidth * 0.024));
  const parts = [contact.phoneDisplay, contact.website, contact.address].filter(Boolean).map(escapeHtml);
  const text = parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const icons = (contact.socialIcons || [])
    .map((id) => socialIconSvg(id, iconSize, '#ffffff'))
    .join('<span style="display:inline-block;width:10px;"></span>');
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;background:linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.62) 100%);padding:0 ${Math.round(canvasWidth * 0.04)}px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;box-sizing:border-box;padding-bottom:${Math.round(canvasWidth * 0.012)}px;">
       <div style="color:#fff;font-size:${fontSize}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${text}</div>
       <div style="display:flex;align-items:center;flex-shrink:0;">${icons}</div>
     </div>`,
    'z-index:6;'
  );
}

/**
 * Fila de iconos "documentación técnica premium" (Apple/Bosch/Sony/JBL/
 * Logitech/Brother): mismo tamaño, mismo grosor de trazo (1.75, fijado
 * UNA vez aquí para los 6, nunca por icono), misma separación —
 * estructuralmente imposible que salgan inconsistentes entre sí. Cada
 * icono lleva su etiqueta corta debajo, perfectamente centrada.
 */
function iconRowMarkup(el, icons, primary, canvasWidth) {
  if (!icons || icons.length === 0) return '';
  const iconSize = Math.max(20, Math.round(canvasWidth * 0.032));
  const labelSize = Math.max(10, Math.round(canvasWidth * 0.015));
  const items = icons
    .map(
      (icon) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0;">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icon.markup}</svg>
        <span style="font-size:${labelSize}px;font-weight:600;color:${primary};text-align:center;line-height:1.2;">${escapeHtml(icon.label)}</span>
      </div>`
    )
    .join('');
  return positionedDiv(
    el.box,
    `<div style="width:100%;height:100%;display:flex;align-items:flex-start;justify-content:space-between;gap:${Math.round(canvasWidth * 0.02)}px;">${items}</div>`,
    'z-index:4;'
  );
}

function decorationMarkup(deco, primary, accent) {
  if (deco.type === 'frame-border') {
    return positionedDiv(deco.box, '', `border:1px solid rgba(0,0,0,0.10);z-index:1;pointer-events:none;`);
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
  heroMarkup, logoMarkup, titleMarkup, ctaMarkup, priceMarkup, contactFooterMarkup, iconRowMarkup, decorationMarkup,
};
