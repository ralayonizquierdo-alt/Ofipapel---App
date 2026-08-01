// Biblioteca de Referencias — la capa de "recetas" curadas encima de las
// 9 bibliotecas atómicas. Diseñada para escalar a decenas de miles de
// entradas SIN cambiar de arquitectura:
//
//   entries/<id>.json  — un fichero por referencia (nunca un array
//                         gigante: añadir la entrada 10.000 es añadir
//                         un fichero, cero cambios de código).
//   manifest.json       — índice ligero (solo los campos necesarios para
//                         FILTRAR: ids de biblioteca + idealProducts +
//                         impacto), leído entero en cada consulta — barato
//                         incluso con miles de filas porque no lleva los
//                         campos de texto largo (whenToUse, whatMakesItSpecial...).
//                         Los campos completos solo se leen para las
//                         POCAS referencias que de verdad hacen match.
//
// Mismo criterio de recarga en caliente que design-studio/brand-kit.json
// vía asset-pipeline/service.js: el manifest se relee en cada llamada
// (nunca cacheado a nivel de módulo), porque la biblioteca puede crecer
// mientras el proceso sigue vivo (Netlify Functions de larga duración).

const fs = require('node:fs');
const path = require('node:path');
const { createReferenceEntry } = require('./schema.js');
const { getEntry } = require('../libraries/index.js');

const DIR = __dirname;
const ENTRIES_DIR = path.join(DIR, 'entries');
const MANIFEST_PATH = path.join(DIR, 'manifest.json');

const MANIFEST_FIELDS = [
  'id', 'label', 'idealProducts',
  'styleId', 'compositionId', 'artDirectionId', 'lightingId', 'scenarioId',
  'paletteHarmonyId', 'angleLensId', 'textSpaceId',
  'visualImpactLevel', 'curatedAt',
];

// Los 8 ids referenciados que sí deben existir en una biblioteca atómica
// (emotion/whenToUse/whenToAvoid/whatMakesItSpecial/whyItWorksOnSocial
// son texto libre, no referencian nada).
const REFERENCED_LIBRARY_FIELDS = {
  styleId: 'style',
  compositionId: 'composition',
  artDirectionId: 'artDirection',
  lightingId: 'lighting',
  scenarioId: 'scenario',
  paletteHarmonyId: 'paletteHarmony',
  angleLensId: 'angleLens',
  textSpaceId: 'textSpace',
};

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

function toManifestRow(entry) {
  const row = {};
  for (const field of MANIFEST_FIELDS) row[field] = entry[field] ?? null;
  return row;
}

function assertLibraryIdsExist(entry) {
  for (const [field, dimension] of Object.entries(REFERENCED_LIBRARY_FIELDS)) {
    getEntry(dimension, entry[field]); // lanza si no existe — falla rápido al registrar, no al usar
  }
}

/**
 * Da de alta una referencia nueva: valida forma, valida que sus ids
 * apunten a entradas reales de las bibliotecas atómicas, escribe
 * entries/<id>.json y actualiza manifest.json. Es la MISMA función que
 * siembra las ~15 entradas iniciales y la que en el futuro usará el
 * importador automático desde campañas propias aprobadas (ver
 * ARCHITECTURE.md, sección "Importar referencias desde campañas
 * propias") — un solo punto de entrada, sin lógica duplicada.
 */
function registerEntry(input) {
  const entry = createReferenceEntry(input);
  assertLibraryIdsExist(entry);

  fs.mkdirSync(ENTRIES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ENTRIES_DIR, `${entry.id}.json`), JSON.stringify(entry, null, 2), 'utf8');

  const manifest = readManifest().filter((row) => row.id !== entry.id);
  manifest.push(toManifestRow(entry));
  writeManifest(manifest);

  return entry;
}

function readFullEntry(id) {
  const filePath = path.join(ENTRIES_DIR, `${id}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listAll() {
  return readManifest();
}

/**
 * Cuenta cuántos tags de `wanted` aparecen en `idealProducts` — score de
 * afinidad simple, determinista, sin ningún componente probabilístico.
 */
function overlapScore(idealProducts, wanted) {
  if (!Array.isArray(idealProducts)) return 0;
  return idealProducts.reduce((sum, tag) => sum + (wanted.includes(tag) ? 1 : 0), 0);
}

/**
 * Devuelve hasta `limit` referencias relevantes para el CreativeBrief,
 * con el contenido COMPLETO (no solo el manifest) — son pocas, así que
 * leer sus ficheros individuales es barato.
 *
 * Filtro: coincidencia de tags entre `idealProducts` de la referencia y
 * {categoría del producto, segmento de audiencia, familia gráfica},
 * priorizadas primero. concept-generator/ necesita bastantes más que 2
 * para poder generar 8-12 conceptos genuinamente distintos (cada uno
 * mezcla `REFERENCES_PER_CONCEPT` referencias; con solo 2-3 candidatas el
 * número de combinaciones posibles se agota mucho antes de llegar a 8 —
 * bug real detectado al conectar esta ruta al flujo de producción,
 * sprint "Cierre de arquitectura", DT-15) — por eso se completa SIEMPRE
 * con referencias 'general' hasta alcanzar `limit`, no solo cuando hay
 * menos de 2 matches directos.
 */
function findRelevantReferences(brief, { limit = 6 } = {}) {
  const wanted = [
    brief.product && brief.product.category,
    brief.productIntelligence && brief.productIntelligence.audienceSegment,
    brief.creativeDirection && brief.creativeDirection.graphicFamily,
  ].filter(Boolean);

  const manifest = readManifest();
  let scored = manifest
    .map((row) => ({ row, score: overlapScore(row.idealProducts, wanted) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.row.visualImpactLevel || 0) - (a.row.visualImpactLevel || 0));

  if (scored.length < limit) {
    const generalRows = manifest.filter((row) => Array.isArray(row.idealProducts) && row.idealProducts.includes('general'));
    const alreadyIn = new Set(scored.map((x) => x.row.id));
    for (const row of generalRows) {
      if (scored.length >= limit) break;
      if (!alreadyIn.has(row.id)) {
        scored.push({ row, score: 0 });
        alreadyIn.add(row.id);
      }
    }
  }

  const picked = scored.slice(0, limit).map((x) => x.row.id);
  return picked.map(readFullEntry);
}

module.exports = { registerEntry, listAll, findRelevantReferences, readFullEntry };
