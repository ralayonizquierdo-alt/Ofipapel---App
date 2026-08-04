// Sección "photography" — refleja 04-fotografo-publicitario:
// ángulo/fondo/iluminación + fidelityRules. fidelityRules es crítico: es
// lo que evita que el producto salga deformado o irreconocible, y lo que
// creative-validator/ inspecciona para el check "presenciaProducto".

function build(brief) {
  const p = brief.photography || {};
  const parts = [];

  if (p.angle) parts.push(`Ángulo de cámara: ${p.angle}`);
  if (p.background) parts.push(`Fondo: ${p.background}`);
  if (p.lighting) parts.push(`Iluminación: ${p.lighting}`);
  if (p.notes) parts.push(p.notes);
  if ((p.fidelityRules || []).length > 0) {
    parts.push(`Fidelidad al producto real (obligatorio): ${p.fidelityRules.join('; ')}`);
  }

  if (parts.length === 0) return null;
  return { id: 'photography', label: 'Fotografía', text: parts.join('. ') };
}

module.exports = { build };
