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

module.exports = { escapeHtml, titleFontSize, shouldShowTitle, logoChip, ctaButton };
