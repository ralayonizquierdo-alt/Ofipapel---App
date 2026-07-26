// Helpers compartidos por los 6 arquetipos — evita repetir escapeHtml y
// la lógica de énfasis tipográfico 6 veces.

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Multiplicador de tamaño de título según config.js#TEXT_EMPHASIS_BY_TEXTSPACE.
const TITLE_SIZE_FACTOR = { dominante: 0.078, equilibrado: 0.06, minimo: 0.04 };

function titleFontSize(width, textEmphasis) {
  return Math.round(width * (TITLE_SIZE_FACTOR[textEmphasis] || TITLE_SIZE_FACTOR.equilibrado));
}

// En énfasis "mínimo" el título cede protagonismo — puede incluso omitirse
// si no hay copy real, dejando solo el logo (mismo principio que
// "sin-texto-solo-marca" en la biblioteca de jerarquías tipográficas).
function shouldShowTitle(textEmphasis, hasCopy) {
  if (textEmphasis === 'minimo') return hasCopy;
  return true;
}

function logoChip(brand, sizeHeightPx) {
  if (!brand.logoPath) return '';
  return `<div class="logo-chip"><img src="file://${brand.logoPath}" style="height:${sizeHeightPx}px;display:block;"></div>`;
}

// Estilo inline completo (no depende de una clase .cta-btn que cada
// arquetipo tendría que declarar por separado — se detectó como bug real
// durante la verificación visual: el botón salía sin padding ni forma).
function ctaButton(cta, accent, width) {
  if (!cta) return '';
  const fontSize = Math.max(14, Math.round((width || 1080) * 0.028));
  const padding = Math.max(10, Math.round((width || 1080) * 0.013));
  return `<div style="display:inline-block;margin-top:18px;background:${accent};color:#1a1a1a;font-weight:800;font-size:${fontSize}px;padding:${padding}px ${padding * 2.4}px;border-radius:999px;">${escapeHtml(cta)}</div>`;
}

// Precio en badge fijo, esquina superior derecha — mismo criterio en los
// 6 arquetipos (no depende de la composición del concepto ganador, a
// diferencia del título/CTA, porque es un dato de negocio, no creativo).
function priceBadge(price, accent, width) {
  if (!price) return '';
  const fontSize = Math.max(16, Math.round(width * 0.032));
  const padding = Math.max(12, Math.round(width * 0.018));
  return `<div style="position:absolute;z-index:4;top:${Math.round(width * 0.03)}px;right:${Math.round(width * 0.03)}px;background:${accent};color:#1a1a1a;font-weight:800;font-size:${fontSize}px;padding:${padding}px ${Math.round(padding * 1.6)}px;border-radius:16px;box-shadow:0 10px 24px rgba(0,0,0,0.35);">${escapeHtml(price)}</div>`;
}

// Rutas de iconos Facebook/Instagram (viewBox 0 0 24 24, monocromo,
// hereda color vía `fill`) — genéricos, no enlazan a ningún perfil real
// (no hay handles verificados de Ofipapel todavía, ver brand-kit.json#contact).
const SOCIAL_ICON_PATHS = {
  facebook: '<path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.45 2.91h-2.33v7.03C18.34 21.24 22 17.08 22 12.06z"/>',
  instagram: '<path d="M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.25.64-.42 1.37-.47 2.43C2 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.06.22 1.79.47 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.64.25 1.37.42 2.43.47C8.94 22 9.28 22 12 22s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.06-.22-1.79-.47-2.43-.26-.66-.6-1.22-1.16-1.77-.55-.56-1.11-.9-1.77-1.16-.64-.25-1.37-.42-2.43-.47C15.06 2.01 14.72 2 12 2zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.51.21 1.86.35.47.18.8.4 1.15.75.35.35.57.68.75 1.15.14.35.31.88.35 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.21 1.51-.35 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.35.14-.88.31-1.86.35-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.51-.21-1.86-.35-.47-.18-.8-.4-1.15-.75-.35-.35-.57-.68-.75-1.15-.14-.35-.31-.88-.35-1.86C3.81 14.99 3.8 14.67 3.8 12s.01-2.99.06-4.04c.04-.98.21-1.51.35-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.35-.14.88-.31 1.86-.35C9.01 3.81 9.33 3.8 12 3.8zm0 3.05a5.15 5.15 0 100 10.3 5.15 5.15 0 000-10.3zm0 8.5a3.35 3.35 0 110-6.7 3.35 3.35 0 010 6.7zm5.35-8.7a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z"/>',
};

function socialIconSvg(id, size, color) {
  const iconPath = SOCIAL_ICON_PATHS[id];
  if (!iconPath) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">${iconPath}</svg>`;
}

// Franja fija inferior con teléfono/web/dirección + iconos de redes —
// mismo footer en los 6 arquetipos, altura pequeña (~5% del alto) para no
// competir con el título/CTA del concepto ganador (ver checks
// legibilidad/espacioTextos de creative-validator/).
function contactFooter(contact, width, height) {
  if (!contact) return '';
  const fontSize = Math.max(12, Math.round(width * 0.022));
  const iconSize = Math.max(16, Math.round(width * 0.026));
  const parts = [contact.phoneDisplay, contact.website, contact.address].filter(Boolean).map(escapeHtml);
  const text = parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const icons = (contact.socialIcons || [])
    .map((id) => socialIconSvg(id, iconSize, '#ffffff'))
    .join('<span style="display:inline-block;width:10px;"></span>');
  return `<div style="position:absolute;z-index:5;left:0;right:0;bottom:0;width:100%;background:rgba(0,0,0,0.55);padding:${Math.round(height * 0.014)}px ${Math.round(width * 0.04)}px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div style="color:#fff;font-size:${fontSize}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${text}</div>
    <div style="display:flex;align-items:center;flex-shrink:0;">${icons}</div>
  </div>`;
}

module.exports = { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton, priceBadge, contactFooter };
