// Sección "art-direction" — refleja 02-director-arte: composición,
// estructura, jerarquía visual declarada.

function build(brief) {
  const a = brief.artDirection || {};
  const parts = [];

  if (a.composition) parts.push(`Composición: ${a.composition}`);
  if (a.structure) parts.push(`Estructura: ${a.structure}`);
  if ((a.hierarchy || []).length > 0) parts.push(`Jerarquía visual (de más a menos protagonismo): ${a.hierarchy.join(' > ')}`);

  if (parts.length === 0) return null;
  return { id: 'art-direction', label: 'Dirección de arte', text: parts.join('. ') };
}

module.exports = { build };
