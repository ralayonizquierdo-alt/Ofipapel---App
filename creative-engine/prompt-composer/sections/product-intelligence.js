// Sección "product-intelligence" — refleja marketing-engine/intelligence/
// (Product Intelligence). TRADUCE señal de negocio a lenguaje visual
// corto — nunca vuelca objeciones, ticket o argumentos de venta tal
// cual: un modelo de imagen no sabe qué hacer con "objeción: consume
// mucha electricidad". Si se amplía esta sección en el futuro, mantener
// esa regla — es la que evita que el prompt se llene de copy de ventas
// que degrada el resultado visual.

function build(brief) {
  const pi = brief.productIntelligence;
  if (!pi) return null;

  const parts = [];
  if (pi.audienceSegment) parts.push(`Entorno y estilismo coherentes con el público: ${pi.audienceSegment}`);
  if ((pi.emotions || []).length > 0) parts.push(`Sensación a transmitir: ${pi.emotions.slice(0, 2).join(', ')}`);

  if (parts.length === 0) return null;
  return { id: 'product-intelligence', label: 'Inteligencia de producto', text: parts.join('. ') };
}

module.exports = { build };
