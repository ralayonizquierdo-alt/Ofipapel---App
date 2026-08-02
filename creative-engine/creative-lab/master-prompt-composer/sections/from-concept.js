// Los 12 bloques obligatorios del Prompt Composer Cinematográfico (el
// 13º, negative prompt, se compone aparte en service.js). Cada builder
// devuelve {id, label, text}. El `id` de "Espacio reservado para
// textos" es literalmente 'copy' — no es un nombre libre: 3 de los 6
// checks de creative-engine/creative-validator/ (legibilidad,
// espacioLogo, espacioTextos) buscan exactamente
// `sections.some(s => s.id === 'copy')` para confirmar que se reservó
// espacio de texto. Cambiar ese id rompería esos 3 checks sin haber
// tocado el fichero del validador — se documenta aquí a propósito.

const { getEntryByField } = require('../../libraries/index.js');
const { DEPTH_OF_FIELD_BY_ANGLE_LENS, TEXTURES_BY_ART_DIRECTION, MATERIALS_BY_SCENARIO } = require('../config.js');

// Anota, dentro del bloque que corresponda, la variación propia
// obligatoria del Director Creativo (concept-generator/self-critique.js
// y concept-generator/config.js#DIRECTOR_VARIATION_DIMENSIONS) — sin
// crear un bloque nuevo, solo una frase de trazabilidad en el bloque que
// esa variación tocó de verdad.
function annotateIfDirectorVariation(text, concept, dimensionField) {
  if (concept.directorVariation.dimension !== dimensionField) return text;
  return `${text} (variación propia del director creativo — no proviene de ninguna referencia mezclada).`;
}

function buildStorySection(concept) {
  const text = annotateIfDirectorVariation(
    `Historia visual: ${concept.narrative}.`,
    concept,
    'narrative'
  );
  return { id: 'story', label: 'Historia visual', text };
}

function buildEmotionSection(concept) {
  const text = annotateIfDirectorVariation(
    `Emoción principal a transmitir: ${concept.emotion}.`,
    concept,
    'emotion'
  );
  return { id: 'emotion', label: 'Emoción principal', text };
}

function buildArtDirectionSection(concept, brief, preparedAssets) {
  const artDirection = getEntryByField('artDirectionId', concept.artDirectionId);
  const brand = preparedAssets.brand;
  const primaryHex = (brand.palette && brand.palette.primary) || '';
  // FASE 8: brief.creativeDirection.graphicFamily (decidida por
  // director-creativo, marketing-engine) es un ancla de consistencia
  // entre campañas distinta de la familia oficial de art-direction-engine
  // (esa se elige más tarde, sobre la foto ya generada — no existe
  // todavía en este punto del pipeline) — se menciona aquí solo cuando
  // hay valor, nunca se inventa uno.
  const graphicFamily = brief.creativeDirection.graphicFamily
    ? ` Familia gráfica de campaña: ${brief.creativeDirection.graphicFamily}.`
    : '';
  return {
    id: 'art-direction',
    label: 'Dirección de arte',
    text: `Dirección de arte: ${artDirection.text}. Coherente con la identidad de ${brand.label} (color ancla ${primaryHex}). Tono: ${brief.creativeDirection.tone || 'sin especificar'}.${graphicFamily}`,
  };
}

function buildCinematographySection(concept, brief) {
  const style = getEntryByField('styleId', concept.styleId);
  const fidelityRules = brief.photography.fidelityRules || [];
  const fidelityText = fidelityRules.length > 0
    ? `Fidelidad obligatoria al producto real: ${fidelityRules.join('; ')}.`
    : 'Fidelidad obligatoria al producto real: mismas proporciones, materiales y colores, sin inventar piezas.';
  // FASE 8: brief.product.description es el texto libre real del producto
  // (lo escribe quien crea la campaña) — antes nunca llegaba al prompt de
  // imagen, solo nombre+categoría. Es la señal más precisa disponible
  // sobre el producto concreto, así que se añade tal cual cuando existe.
  const descriptionText = brief.product.description
    ? ` Descripción del producto: ${brief.product.description}.`
    : '';
  return {
    id: 'cinematography',
    label: 'Dirección de fotografía',
    text: `Dirección de fotografía: ${style.text}. Sujeto: ${brief.product.name} (${brief.product.category}).${descriptionText} ${fidelityText} Calidad de producción profesional, nitidez de campaña, no de foto casera.`,
  };
}

function buildLightingSection(concept) {
  const text = annotateIfDirectorVariation(
    `Iluminación: ${getEntryByField('lightingId', concept.lightingId).text}.`,
    concept,
    'lightingId'
  );
  return { id: 'lighting', label: 'Iluminación', text };
}

function buildLensAngleSection(concept) {
  const text = annotateIfDirectorVariation(
    `Lente y ángulo: ${getEntryByField('angleLensId', concept.angleLensId).text}.`,
    concept,
    'angleLensId'
  );
  return { id: 'lens-angle', label: 'Lente y ángulo', text };
}

function buildCompositionSection(concept) {
  const text = annotateIfDirectorVariation(
    `Composición: ${getEntryByField('compositionId', concept.compositionId).text}.`,
    concept,
    'compositionId'
  );
  return { id: 'composition', label: 'Composición', text };
}

function buildDepthOfFieldSection(concept) {
  return {
    id: 'depth-of-field',
    label: 'Profundidad de campo',
    text: `Profundidad de campo: ${DEPTH_OF_FIELD_BY_ANGLE_LENS[concept.angleLensId]}.`,
  };
}

function buildTexturesSection(concept) {
  return {
    id: 'textures',
    label: 'Texturas',
    text: `Texturas: ${TEXTURES_BY_ART_DIRECTION[concept.artDirectionId]}.`,
  };
}

function buildMaterialsSection(concept) {
  return {
    id: 'materials',
    label: 'Materiales',
    text: `Materiales: ${MATERIALS_BY_SCENARIO[concept.scenarioId]}.`,
  };
}

function buildAmbianceSection(concept) {
  const text = annotateIfDirectorVariation(
    `Ambiente: ${getEntryByField('scenarioId', concept.scenarioId).text}.`,
    concept,
    'scenarioId'
  );
  return { id: 'ambiance', label: 'Ambiente', text };
}

// id: 'copy' a propósito — ver cabecera del fichero.
function buildTextSpaceSection(concept, brief) {
  const textSpace = getEntryByField('textSpaceId', concept.textSpaceId);
  const hasCopy = Boolean(brief.copy.title || brief.copy.cta);
  const copyNote = hasCopy
    ? `Titular: "${brief.copy.title || ''}". CTA: "${brief.copy.cta || ''}".`
    : 'Esta pieza no lleva titular ni CTA.';
  return {
    id: 'copy',
    label: 'Espacio reservado para textos',
    text: `Espacio reservado para textos: ${textSpace.text}. NO renderizar ningún texto ni letra dentro de la imagen — el texto y el logo se componen después. ${copyNote}`,
  };
}

function buildConceptSections(concept, brief, preparedAssets) {
  return [
    buildStorySection(concept),
    buildEmotionSection(concept),
    buildArtDirectionSection(concept, brief, preparedAssets),
    buildCinematographySection(concept, brief),
    buildLightingSection(concept),
    buildLensAngleSection(concept),
    buildCompositionSection(concept),
    buildDepthOfFieldSection(concept),
    buildTexturesSection(concept),
    buildMaterialsSection(concept),
    buildAmbianceSection(concept),
    buildTextSpaceSection(concept, brief),
  ];
}

module.exports = { buildConceptSections };
