// Component Library — catálogo de tipos de componente visual reutilizable.
// Solo la lista de tipos vive aquí (mismo patrón que patterns.js exporta
// PATTERNS y icons.js exporta ICONS): las variantes concretas de cada
// tipo están en variants.js, y CÓMO se pinta cada variante en
// renderers.js — tres responsabilidades separadas, ninguna decide
// posición (layout-intelligence/) ni contenido (viene del brief).

const COMPONENT_TYPES = [
  'priceBadge', 'ctaButton', 'logoChip', 'contactFooter',
  'frameDecoration', 'heroCard', 'divider', 'iconSystem', 'titleAccent',
];

module.exports = { COMPONENT_TYPES };
