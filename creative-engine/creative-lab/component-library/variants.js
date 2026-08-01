// Variantes reales por tipo de componente — "cada componente deberá
// tener múltiples variantes, nunca repetir siempre la misma" (instrucción
// explícita del propietario, sprint "Design Evolution v2"). El primer id
// de cada lista es el tratamiento anterior a este sprint (nunca se pierde
// la opción "clásica", solo deja de ser la única).
//
// `priceBadge` cubre a la vez "badges de precio", "cintas" (ribbon-corner)
// y "etiquetas" (outline-tag) — son tres lenguajes visuales del MISMO
// elemento de negocio (el precio/promo ya real del brief), no tres
// elementos nuevos sin dato detrás.
//
// `iconSystem` cubre también "cajas de beneficios": en este repo cada
// fila de iconos con etiqueta YA es la caja de beneficios (ver
// layout-composer/render-helpers.js#iconRowMarkup) — variar su
// tratamiento (contorno vs. relleno suave) es variar la caja de
// beneficios, no un componente aparte sin dato real que mostrar.
//
// `titleAccent` cubre "bloques editoriales" sin fabricar texto nuevo
// (nunca se inventa una etiqueta/kicker que no venga del brief) — el
// acento es puramente gráfico (una barra de color), nunca copy.

const VARIANT_IDS = {
  priceBadge: ['pill-solid', 'ribbon-corner', 'outline-tag', 'stacked-mini'],
  ctaButton: ['pill-solid', 'underline-arrow', 'boxed-outline', 'split-accent'],
  logoChip: ['plain', 'circle-badge', 'underline-mark'],
  contactFooter: ['gradient-band', 'solid-bar', 'glass-panel'],
  frameDecoration: ['thin-line', 'corner-brackets', 'double-line'],
  heroCard: ['thin-line-frame', 'soft-shadow', 'inset-panel'],
  divider: ['none', 'thin-line', 'dotted'],
  iconSystem: ['outline-thin', 'filled-soft'],
  titleAccent: ['plain', 'accent-bar'],
};

module.exports = { VARIANT_IDS };
