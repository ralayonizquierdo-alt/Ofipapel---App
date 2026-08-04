// Generadores de estilo/markup por variante — reciben datos YA resueltos
// (texto YA escapado por el llamador, colores de marca, caja YA
// calculada) y devuelven un fragmento listo para insertar donde
// layout-composer/render-helpers.js ya posicionó el elemento. Este
// módulo nunca decide caja, nunca decide contenido, y nunca escapa HTML
// por su cuenta (el texto que recibe ya es seguro) — solo TRATAMIENTO
// VISUAL, misma frontera que el resto de la Component Library.

// Elevación consistente para los tratamientos de relleno sólido (badge
// flotando sobre la pieza, mismo lenguaje de profundidad en precio y
// CTA) — los tratamientos de contorno/texto se quedan planos a
// propósito, ese contraste plano/elevado es jerarquía visual real, no
// decoración porque sí. `font-weight:700` en todo el fichero (nunca
// 800): coincide exactamente con el Outfit-Bold embebido
// (layout-composer/render-plan.js) — pedir 800 fuerza un negrita
// sintético sobre un fichero que no lo tiene.
const ELEVATION = 'box-shadow:0 6px 20px rgba(0,0,0,0.16);';

function priceBadgeMarkup(variantId, { text, accent, primary, fontSize }) {
  switch (variantId) {
    case 'ribbon-corner':
      return `<div style="background:${accent};color:#12210f;font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;padding:9px 24px 9px 17px;clip-path:polygon(0 0, 100% 0, 88% 100%, 0 100%);white-space:nowrap;${ELEVATION}">${text}</div>`;
    case 'outline-tag':
      return `<div style="background:rgba(255,255,255,0.92);border:1.5px solid ${accent};color:${primary};font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;padding:6px 16px;border-radius:8px;white-space:nowrap;">${text}</div>`;
    case 'stacked-mini':
      return `<div style="background:${accent};color:#12210f;font-weight:700;font-size:${Math.round(fontSize * 0.82)}px;padding:6px 14px;border-radius:999px;white-space:nowrap;letter-spacing:0.01em;${ELEVATION}">${text}</div>`;
    case 'pill-solid':
    default:
      return `<div style="background:${accent};color:#12210f;font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;padding:8px 20px;border-radius:999px;white-space:nowrap;${ELEVATION}">${text}</div>`;
  }
}

function ctaButtonMarkup(variantId, { text, accent, primary, fontSize, padding }) {
  switch (variantId) {
    case 'underline-arrow':
      return `<div style="color:${primary};font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;border-bottom:2px solid ${accent};padding-bottom:5px;white-space:nowrap;">${text}&nbsp;&nbsp;→</div>`;
    case 'boxed-outline':
      return `<div style="background:transparent;border:1.5px solid ${primary};color:${primary};font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;padding:${padding}px ${Math.round(padding * 2)}px;white-space:nowrap;">${text}</div>`;
    case 'split-accent':
      return `<div style="display:flex;font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;border-radius:999px;overflow:hidden;white-space:nowrap;${ELEVATION}"><span style="background:${primary};color:#fff;padding:${padding}px ${Math.round(padding * 1.4)}px;">${text}</span><span style="background:${accent};color:#12210f;padding:${padding}px ${Math.round(padding * 0.9)}px;display:flex;align-items:center;">→</span></div>`;
    case 'pill-solid':
    default:
      return `<div style="background:${accent};color:#12210f;font-weight:700;font-size:${fontSize}px;letter-spacing:-0.01em;padding:${padding}px ${Math.round(padding * 2.2)}px;border-radius:999px;white-space:nowrap;${ELEVATION}">${text}</div>`;
  }
}

function logoChipMarkup(variantId, { imgTag, accent }) {
  switch (variantId) {
    case 'circle-badge':
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,0.8);box-shadow:0 2px 10px rgba(0,0,0,0.12);">${imgTag}</div>`;
    case 'underline-mark':
      return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">${imgTag}<div style="width:36%;height:3px;background:${accent};border-radius:2px;"></div></div>`;
    case 'plain':
    default:
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${imgTag}</div>`;
  }
}

function contactFooterBackground(variantId, primary) {
  switch (variantId) {
    case 'solid-bar':
      return `background:${primary};`;
    case 'glass-panel':
      return `background:linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.30) 100%);backdrop-filter:blur(2px);`;
    case 'gradient-band':
    default:
      return `background:linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.62) 100%);`;
  }
}

function frameDecorationStyle(variantId) {
  // 'corner-brackets' se resuelve con markup propio (4 esquinas, ver
  // cornerBracketsMarkup) — decorationMarkup en render-helpers.js
  // distingue por variantId antes de llamar a una función u otra.
  switch (variantId) {
    case 'double-line':
      return 'border:1px solid rgba(0,0,0,0.10);outline:1px solid rgba(0,0,0,0.06);outline-offset:6px;';
    case 'thin-line':
    default:
      return 'border:1px solid rgba(0,0,0,0.10);';
  }
}

/** Cuatro marcas en L en las esquinas de `box`, en vez de un borde completo — variante 'corner-brackets' de frameDecoration. */
function cornerBracketsMarkup(box) {
  const size = Math.round(Math.min(box.w, box.h) * 0.06);
  const corner = (top, left, borders) => `<div style="position:absolute;top:${top}px;left:${left}px;width:${size}px;height:${size}px;${borders}"></div>`;
  return [
    corner(box.y, box.x, 'border-top:1px solid rgba(0,0,0,0.35);border-left:1px solid rgba(0,0,0,0.35);'),
    corner(box.y, box.x + box.w - size, 'border-top:1px solid rgba(0,0,0,0.35);border-right:1px solid rgba(0,0,0,0.35);'),
    corner(box.y + box.h - size, box.x, 'border-bottom:1px solid rgba(0,0,0,0.35);border-left:1px solid rgba(0,0,0,0.35);'),
    corner(box.y + box.h - size, box.x + box.w - size, 'border-bottom:1px solid rgba(0,0,0,0.35);border-right:1px solid rgba(0,0,0,0.35);'),
  ].join('');
}

function heroCardStyle(variantId) {
  switch (variantId) {
    case 'inset-panel':
      return 'background:rgba(255,255,255,0.55);border-radius:18px;padding:3%;box-sizing:border-box;';
    case 'soft-shadow':
      return '';
    case 'thin-line-frame':
    default:
      return 'border:1px solid rgba(0,0,0,0.08);padding:2%;box-sizing:border-box;';
  }
}

function heroCardFilter(variantId) {
  return variantId === 'soft-shadow'
    ? 'filter:drop-shadow(0 22px 40px rgba(0,0,0,0.26));'
    : 'filter:drop-shadow(0 18px 34px rgba(0,0,0,0.20));';
}

/** Línea fina opcional justo encima del footer de contacto — 'none' es una variante real (ausencia deliberada, no un bug). */
function dividerMarkup(variantId, box, primary) {
  if (!variantId || variantId === 'none') return '';
  const style = variantId === 'dotted'
    ? `border-top:2px dotted ${primary};opacity:0.35;`
    : `border-top:1px solid ${primary};opacity:0.18;`;
  return `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;z-index:5;${style}"></div>`;
}

/** Círculo de fondo suave detrás de cada icono — variante 'filled-soft' de iconSystem (la variante 'outline-thin' no añade nada, es el tratamiento anterior a este sprint). */
function iconWrapperStyle(variantId, primary) {
  if (variantId !== 'filled-soft') return '';
  return `background:${primary}1A;border-radius:50%;padding:10px;`;
}

/** Barra de acento junto al título — variante 'accent-bar' de titleAccent. Puramente gráfico, nunca añade texto (ver variants.js: nunca se fabrica copy nuevo). */
function titleAccentMarkup(variantId, box, accent) {
  if (variantId !== 'accent-bar') return '';
  const barWidth = Math.max(3, Math.round(box.h * 0.03));
  const barHeight = box.h * 0.7;
  const left = Math.max(0, box.x - barWidth * 3);
  const top = box.y + (box.h - barHeight) / 2;
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${barWidth}px;height:${barHeight}px;background:${accent};border-radius:2px;"></div>`;
}

module.exports = {
  priceBadgeMarkup, ctaButtonMarkup, logoChipMarkup, contactFooterBackground,
  frameDecorationStyle, cornerBracketsMarkup, heroCardStyle, heroCardFilter,
  dividerMarkup, iconWrapperStyle, titleAccentMarkup,
};
