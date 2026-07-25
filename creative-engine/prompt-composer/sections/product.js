// Sección "product" — el sujeto literal. Siempre primera, prácticamente
// nunca null (solo si el brief no trae ni un nombre de producto).

function build(brief) {
  const { name, description, category } = brief.product || {};
  if (!name) return null;

  const text = `Producto: ${name}${category ? ` (categoría: ${category})` : ''}. ${description || ''}`.trim();
  return { id: 'product', label: 'Producto', text };
}

module.exports = { build };
