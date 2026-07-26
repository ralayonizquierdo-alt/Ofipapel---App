// Generador de Conceptos — 8 a 12 conceptos, cada uno mezclando 2-3
// referencias de la Biblioteca de Referencias + una variación propia del
// Director Creativo. Norma obligatoria del propietario, aplicada como
// INVARIANTE ESTRUCTURAL (no una esperanza): "ningún concepto podrá
// parecer una copia de una referencia" (assertNoReferenceIsFullyCopied) y
// "cada concepto deberá mezclar elementos de varias referencias y,
// además, introducir una variación propia" (mixDimensions +
// applyDirectorVariation, siempre las dos cosas, siempre en ese orden).

const { getLibrary } = require('../libraries/index.js');
const {
  CONCEPT_COUNT_MIN, CONCEPT_COUNT_MAX, CONCEPT_COUNT_DEFAULT,
  REFERENCES_PER_CONCEPT, ATOMIC_DIMENSIONS, DIMENSION_TO_LIBRARY,
  DIRECTOR_VARIATION_DIMENSIONS, ORIGINAL_EMOTION_TWISTS, ORIGINAL_NARRATIVE_ANGLES,
} = require('./config.js');

function assertValidCount(count) {
  if (!Number.isInteger(count) || count < CONCEPT_COUNT_MIN || count > CONCEPT_COUNT_MAX) {
    throw new Error(`concept-generator: count debe ser un entero entre ${CONCEPT_COUNT_MIN} y ${CONCEPT_COUNT_MAX} (recibido: ${count})`);
  }
}

// Hash determinista (no Math.random) — se usa para "barajar" referencias
// y dimensiones por concepto sin caer en periodicidades modulares simples
// (una primera versión con módulos pequeños producía conceptos idénticos
// cada `references.length` iteraciones — ver historial del commit).
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Selecciona 2-3 referencias distintas para el concepto `index` — orden
 * pseudo-barajado determinista por hash(id, index, salt). `salt` permite
 * a generateConcepts() volver a barajar el MISMO concepto si su primer
 * resultado colisiona con uno anterior (ver assertDistinctConcepts más
 * abajo) sin dejar de ser determinista: mismo brief + misma biblioteca =
 * siempre el mismo resultado final, con o sin reintentos internos.
 */
function pickReferencesForConcept(references, index, salt) {
  const size = Math.min(REFERENCES_PER_CONCEPT, references.length);
  return references
    .map((ref) => ({ ref, key: hashString(`${ref.id}::${index}::${salt}`) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, size)
    .map((x) => x.ref);
}

/** Asigna cada una de las 8 dimensiones atómicas a una de las referencias mezcladas — la referencia fuente por dimensión se decide por hash(dimensión, concepto, salt), no por módulo simple, para que el patrón de mezcla no se repita entre conceptos. */
function mixDimensions(refsForConcept, conceptIndex, salt) {
  const mixed = {};
  const sourceByDimension = {};
  ATOMIC_DIMENSIONS.forEach((dimension) => {
    const idx = hashString(`${dimension}::${conceptIndex}::${salt}`) % refsForConcept.length;
    const ref = refsForConcept[idx];
    mixed[dimension] = ref[dimension];
    sourceByDimension[dimension] = ref.id;
  });
  return { mixed, sourceByDimension };
}

/** Busca en la biblioteca atómica de `dimension` una entrada que NINGUNA de las referencias mezcladas usó — determinista (hash de dimensión+concepto+salt elige CUÁL de las candidatas no usadas, no siempre la primera). */
function pickUnusedLibraryEntry(dimension, usedIds, wantedTags, conceptIndex, salt) {
  const libraryName = DIMENSION_TO_LIBRARY[dimension];
  const entries = getLibrary(libraryName);
  const notUsed = entries.filter((e) => !usedIds.has(e.id));
  const pool = notUsed.length > 0 ? notUsed : entries; // si se agotaran (biblioteca muy pequeña), no bloquear

  const tagged = pool.filter((e) => e.tags.some((t) => wantedTags.includes(t)));
  const candidates = tagged.length > 0 ? tagged : pool;
  const idx = hashString(`${dimension}::${conceptIndex}::${salt}::variation`) % candidates.length;
  return candidates[idx].id;
}

/**
 * Aplica la variación propia obligatoria del director sobre UNA dimensión
 * (rotando por concepto entre las 6 permitidas). Para las 4 dimensiones
 * respaldadas por biblioteca (encuadre/iluminación/composición/escenario)
 * el valor elegido NO puede ser el de ninguna referencia mezclada. Para
 * emoción/narrativa es una frase original del director (config.js),
 * nunca copiada de una referencia.
 */
function applyDirectorVariation(mixed, sourceByDimension, refsForConcept, conceptIndex, wantedTags, salt) {
  const dimension = DIRECTOR_VARIATION_DIMENSIONS[conceptIndex % DIRECTOR_VARIATION_DIMENSIONS.length];

  if (dimension === 'emotion' || dimension === 'narrative') {
    const twists = dimension === 'emotion' ? ORIGINAL_EMOTION_TWISTS : ORIGINAL_NARRATIVE_ANGLES;
    const value = twists[(conceptIndex + salt) % twists.length];
    return { dimension, value, reason: `Variación propia del director en "${dimension}" — no proviene de ninguna referencia ni biblioteca atómica.` };
  }

  const usedIds = new Set(refsForConcept.map((ref) => ref[dimension]));
  const value = pickUnusedLibraryEntry(dimension, usedIds, wantedTags, conceptIndex, salt);
  mixed[dimension] = value; // sobreescribe la asignación mezclada
  sourceByDimension[dimension] = 'director-creativo';
  return { dimension, value, reason: `Variación propia del director en "${dimension}" — valor distinto al de todas las referencias mezcladas (${[...usedIds].join(', ')}).` };
}

function conceptKey(concept) {
  return ATOMIC_DIMENSIONS.map((d) => concept[d]).join('|');
}

/** Invariante: dos conceptos no pueden compartir la misma combinación exacta de las 8 dimensiones atómicas. Se usa al final como red de seguridad — generateConcepts() ya evita la colisión con reintentos internos (salt) antes de llegar aquí. */
function assertDistinctConcepts(concepts) {
  const seen = new Set();
  for (const concept of concepts) {
    const key = conceptKey(concept);
    if (seen.has(key)) {
      throw new Error(`concept-generator: dos conceptos comparten la misma combinación exacta (${key}) — violación del invariante de diversidad.`);
    }
    seen.add(key);
  }
}

/** Invariante — la norma obligatoria: ningún concepto puede coincidir con NINGUNA de sus referencias fuente en las 8 dimensiones a la vez. */
function assertNoReferenceIsFullyCopied(concept, refsForConcept) {
  for (const ref of refsForConcept) {
    const identical = ATOMIC_DIMENSIONS.every((d) => concept[d] === ref[d]);
    if (identical) {
      throw new Error(`concept-generator: el concepto "${concept.conceptId}" es idéntico a la referencia "${ref.id}" — viola la norma "ningún concepto podrá parecer una copia de una referencia".`);
    }
  }
}

/**
 * @param {{brief: object, references: object[]}} analysis - salida de analysis/service.js#analyzeBrief
 * @param {object} [options]
 * @param {number} [options.count=10] - entre CONCEPT_COUNT_MIN y CONCEPT_COUNT_MAX
 * @returns {object[]} concepts
 */
const MAX_SALT_ATTEMPTS = 25;

function buildConcept(references, wantedTags, index, salt) {
  const refsForConcept = pickReferencesForConcept(references, index, salt);
  const { mixed, sourceByDimension } = mixDimensions(refsForConcept, index, salt);
  const directorVariation = applyDirectorVariation(mixed, sourceByDimension, refsForConcept, index, wantedTags, salt);

  const concept = {
    conceptId: `concept-${index + 1}`,
    sourceReferenceIds: refsForConcept.map((r) => r.id),
    sourceByDimension,
    ...mixed,
    emotion: directorVariation.dimension === 'emotion' ? directorVariation.value : refsForConcept[0].emotion,
    narrative: directorVariation.dimension === 'narrative' ? directorVariation.value : ORIGINAL_NARRATIVE_ANGLES[(index + 6 + salt) % ORIGINAL_NARRATIVE_ANGLES.length],
    directorVariation,
    label: `${getLibrary('style').find((e) => e.id === mixed.styleId).label} · ${getLibrary('scenario').find((e) => e.id === mixed.scenarioId).label}`,
  };

  assertNoReferenceIsFullyCopied(concept, refsForConcept);
  return concept;
}

/**
 * @param {{brief: object, references: object[]}} analysis - salida de analysis/service.js#analyzeBrief
 * @param {object} [options]
 * @param {number} [options.count=10] - entre CONCEPT_COUNT_MIN y CONCEPT_COUNT_MAX
 * @returns {object[]} concepts
 */
function generateConcepts(analysis, options = {}) {
  const count = options.count || CONCEPT_COUNT_DEFAULT;
  assertValidCount(count);

  const { brief, references } = analysis;
  const wantedTags = [brief.product.category, 'general'].filter(Boolean);

  const concepts = [];
  const seenKeys = new Set();

  for (let i = 0; i < count; i++) {
    let concept = null;
    // Reintento determinista y acotado: si el concepto i colisiona con uno
    // ya aceptado (posible con pocas referencias elegibles todavía), se
    // vuelve a barajar CON UN SALT DISTINTO — mismo brief + misma
    // biblioteca siempre produce el mismo resultado final, el reintento
    // no introduce aleatoriedad, solo explora más combinaciones.
    for (let salt = 0; salt < MAX_SALT_ATTEMPTS; salt++) {
      const candidate = buildConcept(references, wantedTags, i, salt);
      if (!seenKeys.has(conceptKey(candidate))) {
        concept = candidate;
        break;
      }
    }
    if (!concept) {
      throw new Error(
        `concept-generator: no se encontró una combinación distinta para el concepto ${i + 1} tras ${MAX_SALT_ATTEMPTS} intentos — ` +
        'la Biblioteca de Referencias tiene muy poca variedad todavía para esta categoría. Añade más entradas (ver reference-library/service.js#registerEntry).'
      );
    }
    seenKeys.add(conceptKey(concept));
    concepts.push(concept);
  }

  assertDistinctConcepts(concepts); // red de seguridad final
  return concepts;
}

module.exports = { generateConcepts, assertDistinctConcepts, assertNoReferenceIsFullyCopied };
