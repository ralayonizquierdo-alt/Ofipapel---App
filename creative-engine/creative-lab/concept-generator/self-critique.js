// Director de Arte Senior — autocrítica obligatoria del Director Creativo
// sobre cada concepto, ANTES de componer ningún prompt (norma explícita
// del propietario). Determinista: responde a partir de los datos que el
// propio concepto ya trae (nada de IA real, mismo criterio que el resto
// del repo). Dos de las 7 respuestas son el filtro real de descarte
// automático; las otras 5 son diagnóstico/trazabilidad para quien revise
// después por qué un concepto sobrevivió o no.

const { getEntryByField } = require('../libraries/index.js');

// Mismo umbral que creative-validator/config.js (check "espacioTextos":
// "Reducir la jerarquía visual a 4 elementos como máximo") — no se
// importa porque ese fichero no lo exporta como constante; se replica el
// mismo número a propósito, documentado aquí para no perder la relación.
const MAX_HIERARCHY_ELEMENTS = 4;

// Combinación que se lee como "ficha de producto de catálogo", no como
// campaña — las 3 a la vez, sin ningún matiz de iluminación/composición/
// escenario que la distinga. Basta con que la variación propia del
// director (obligatoria en todo concepto) haya movido UNA de las tres
// para dejar de calificar como genérica.
const GENERIC_CATALOG_SIGNATURE = {
  scenarioId: ['estudio-fondo-blanco', 'flotando-sin-escenario'],
  lightingId: ['softbox-estudio', 'high-key-luminosa'],
  compositionId: ['simetria-centrada'],
};

function isGenericCatalogLook(concept) {
  return Object.entries(GENERIC_CATALOG_SIGNATURE).every(
    ([dimension, blandValues]) => blandValues.includes(concept[dimension])
  );
}

function hierarchyOf(brief) {
  return (brief.artDirection && brief.artDirection.hierarchy) || [];
}

/**
 * Las 7 preguntas del Director Creativo, respondidas de forma
 * determinista sobre un concepto ya generado (concept-generator/service.js)
 * y el CreativeBrief original. Se ejecuta ANTES de master-prompt-composer/.
 *
 * @param {object} concept
 * @param {object} brief - CreativeBrief
 * @returns {object} { answers: {...7 respuestas}, looksProfessional, discardReasons }
 */
function evaluateConcept(concept, brief) {
  const hierarchy = hierarchyOf(brief);
  const hierarchyOverloaded = hierarchy.length > MAX_HIERARCHY_ELEMENTS;
  const genericCatalogLook = isGenericCatalogLook(concept);

  const answers = {
    emocionPrincipal: concept.emotion,
    queDetieneElScroll: `${getEntryByField('styleId', concept.styleId).label} + variación propia del director: ${concept.directorVariation.value}`,
    protagonistaAbsoluto: hierarchy[0] || 'no declarado en brief.artDirection.hierarchy',
    queEliminarParaSimplificar: hierarchyOverloaded
      ? `Jerarquía con ${hierarchy.length} elementos (máx. recomendado ${MAX_HIERARCHY_ELEMENTS}) — sobra al menos ${hierarchy.length - MAX_HIERARCHY_ELEMENTS}.`
      : `Nada — la jerarquía ya tiene ${hierarchy.length} elemento(s), dentro del máximo recomendado.`,
    dondeViviraElTexto: getEntryByField('textSpaceId', concept.textSpaceId).label,
    queHistoriaCuenta: concept.narrative,
    veredictoPremiumOFicha: genericCatalogLook
      ? 'Ficha de producto de catálogo — escenario, luz y composición son las tres más neutras posibles a la vez, sin ningún matiz que la distinga.'
      : 'Campaña — al menos una de escenario/luz/composición aporta un matiz que una ficha de catálogo no tendría.',
  };

  const discardReasons = [];
  if (hierarchyOverloaded) discardReasons.push(answers.queEliminarParaSimplificar);
  if (genericCatalogLook) discardReasons.push(answers.veredictoPremiumOFicha);

  return {
    answers,
    looksProfessional: discardReasons.length === 0,
    discardReasons,
  };
}

/**
 * Filtra los conceptos que no parecen una campaña profesional. Devuelve
 * SOLO los supervivientes, cada uno con su `selfCritique` adjunto — el
 * resto se pierde aquí, antes de que master-prompt-composer/ los toque
 * (nunca se compone un prompt para un concepto descartado).
 * @param {object[]} concepts
 * @param {object} brief
 * @returns {{survivors: object[], discarded: object[]}}
 */
function filterProfessionalConcepts(concepts, brief) {
  const survivors = [];
  const discarded = [];
  for (const concept of concepts) {
    const selfCritique = evaluateConcept(concept, brief);
    if (selfCritique.looksProfessional) {
      survivors.push({ concept, selfCritique });
    } else {
      discarded.push({ concept, selfCritique });
    }
  }
  return { survivors, discarded };
}

module.exports = { evaluateConcept, filterProfessionalConcepts, MAX_HIERARCHY_ELEMENTS, GENERIC_CATALOG_SIGNATURE };
