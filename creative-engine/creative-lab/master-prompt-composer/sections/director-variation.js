// Sección dedicada a la variación propia del Director Creativo — norma
// obligatoria del propietario: "cada concepto deberá... introducir una
// variación propia generada por el Director Creativo". Se declara como
// sección aparte (no mezclada con el resto) para que quede trazable en
// el propio prompt qué parte de la pieza es genuinamente original y no
// viene de ninguna referencia — útil también para concept-score/ y para
// una futura auditoría humana.

function buildDirectorVariationSection(concept) {
  const { directorVariation } = concept;
  return {
    id: 'lab-director-variation',
    label: 'Variación propia del Director Creativo',
    text: `Toque original del director (no proviene de ninguna referencia): ${directorVariation.value}.`,
  };
}

module.exports = { buildDirectorVariationSection };
