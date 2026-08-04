// Las 9 bibliotecas atómicas — el "vocabulario" del lenguaje visual de
// Creative Lab. Cada una es un array plano de entradas {id, label, text,
// tags}: datos puros, sin llamadas de red, sin dependencias — mismo
// criterio que VISUAL_ANGLES (creative-engine/variant-generator/config.js)
// o CATEGORY_RULES (marketing-engine/), solo que aquí hay 9 en vez de 1.
//
// `text` es la frase lista para el Prompt Maestro (composeMasterPrompt).
// `tags` es una lista abierta de afinidad (categoría de producto, mood,
// contentClass) usada por analysis/ y reference-library/ para filtrar —
// no es un enum cerrado: una entrada puede llevar tags que hoy no usa
// nadie, para no bloquear el crecimiento futuro de la biblioteca.
//
// La Biblioteca de Referencias (reference-library/) NO duplica este
// texto — cada entrada de referencia apunta a estas por `id`.

const styles = require('./styles.js');
const compositions = require('./compositions.js');
const artDirections = require('./art-directions.js');
const lighting = require('./lighting.js');
const scenarios = require('./scenarios.js');
const typographicHierarchies = require('./typographic-hierarchies.js');
const palettesHarmonies = require('./palettes-harmonies.js');
const anglesLenses = require('./angles-lenses.js');
const trends = require('./trends.js');

// Nombre de dimensión -> array de entradas. Estas son las mismas 9 claves
// que usan reference-library/schema.js y concept-generator/service.js —
// un solo vocabulario de nombres de dimensión en todo Creative Lab.
const LIBRARIES = {
  style: styles,
  composition: compositions,
  artDirection: artDirections,
  lighting,
  scenario: scenarios,
  textSpace: typographicHierarchies,
  paletteHarmony: palettesHarmonies,
  angleLens: anglesLenses,
  trend: trends,
};

function assertLibrary(entries, dimensionName) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Biblioteca "${dimensionName}" vacía o inválida`);
  }
  const seenIds = new Set();
  for (const entry of entries) {
    if (!entry.id || typeof entry.id !== 'string') {
      throw new Error(`Biblioteca "${dimensionName}": entrada sin id válido: ${JSON.stringify(entry)}`);
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`Biblioteca "${dimensionName}": id duplicado "${entry.id}"`);
    }
    seenIds.add(entry.id);
    if (!entry.label || typeof entry.label !== 'string') {
      throw new Error(`Biblioteca "${dimensionName}": entrada "${entry.id}" sin label`);
    }
    if (!entry.text || typeof entry.text !== 'string') {
      throw new Error(`Biblioteca "${dimensionName}": entrada "${entry.id}" sin text`);
    }
    if (!Array.isArray(entry.tags)) {
      throw new Error(`Biblioteca "${dimensionName}": entrada "${entry.id}" sin tags[]`);
    }
  }
}

// Validación eager al cargar — mismo criterio que provider-manager/registry.js:
// un typo en una biblioteca falla al hacer require(), no en producción.
for (const [dimensionName, entries] of Object.entries(LIBRARIES)) {
  assertLibrary(entries, dimensionName);
}

function getLibrary(dimensionName) {
  const entries = LIBRARIES[dimensionName];
  if (!entries) {
    throw new Error(`Dimensión de biblioteca desconocida: "${dimensionName}". Válidas: ${Object.keys(LIBRARIES).join(', ')}`);
  }
  return entries;
}

function getEntry(dimensionName, id) {
  const entry = getLibrary(dimensionName).find((e) => e.id === id);
  if (!entry) {
    throw new Error(`Entrada "${id}" no encontrada en la biblioteca "${dimensionName}"`);
  }
  return entry;
}

const DIMENSION_NAMES = Object.keys(LIBRARIES);

// Nombre de CAMPO (como se usa en reference-library/schema.js y en un
// concepto de concept-generator/, ej. "styleId") -> nombre de DIMENSIÓN
// (clave de LIBRARIES, ej. "style"). Único sitio donde vive este mapa —
// concept-generator/, moodboard/ y master-prompt-composer/ lo importan de
// aquí en vez de redeclararlo cada uno (se detectó la duplicación durante
// la implementación y se centralizó antes de añadir una tercera copia).
const FIELD_TO_DIMENSION = {
  styleId: 'style',
  compositionId: 'composition',
  artDirectionId: 'artDirection',
  lightingId: 'lighting',
  scenarioId: 'scenario',
  paletteHarmonyId: 'paletteHarmony',
  angleLensId: 'angleLens',
  textSpaceId: 'textSpace',
};

function getEntryByField(field, id) {
  return getEntry(FIELD_TO_DIMENSION[field], id);
}

module.exports = { LIBRARIES, DIMENSION_NAMES, FIELD_TO_DIMENSION, getLibrary, getEntry, getEntryByField };
