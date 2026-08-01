// Almacén de creatividades — mismo patrón exacto que
// marketing-engine/core/job-store.js, escrito de forma independiente
// (creative-engine/ no importa nada de marketing-engine/). Cualquier
// módulo que escriba ficheros de una creatividad DEBE usar estas
// funciones, nunca recalcular la ruta por su cuenta.
//
// Por creatividad:
//   assets/<creativeId>/
//     creative.json          — marca/producto/formato/fecha (para listar sin abrir cada versión)
//     latest.json             — { currentVersion, approvedVersion, versions[], updatedAt }
//     versions/v<N>/
//       image.png | video.mp4 — el asset generado (ausente si el proveedor todavía no está activo)
//       thumbnail.png
//       layers/               — capas editables futuras (PSD-like), vacío hoy
//       prompt.json            — el ComposedPrompt usado para esta versión
//       metadata.json          — proveedor, dimensiones, parámetros, resultado de validación
//
// `currentVersion` (última escrita) y `approvedVersion` (la que el
// propietario aprobó) son campos DISTINTOS a propósito: divergen en
// cuanto una v2 se genera tras un fallo de validación de la v1 — v2 es la
// "current" pero v1 sigue siendo la "approved" hasta que alguien decida
// lo contrario.
//
// LIMITACIÓN CONOCIDA (mismo motivo que marketing-engine/intelligence/learning-engine/store.js):
// en producción, CREATIVE_ENGINE_ASSETS_DIR apuntaría a /tmp en Lambda —
// efímero por contenedor. Documentado, no resuelto en este sprint (no hay
// todavía ningún despliegue serverless de creative-engine).

const fs = require('node:fs');
const path = require('node:path');

function creativesBaseDir() {
  return process.env.CREATIVE_ENGINE_ASSETS_DIR || path.join(__dirname, 'assets');
}

function creativeDir(creativeId) {
  return path.join(creativesBaseDir(), creativeId);
}

function versionsDir(creativeId) {
  return path.join(creativeDir(creativeId), 'versions');
}

function versionDir(creativeId, versionNumber) {
  return path.join(versionsDir(creativeId), `v${versionNumber}`);
}

function creativeInfoPath(creativeId) {
  return path.join(creativeDir(creativeId), 'creative.json');
}

function pointerPath(creativeId) {
  return path.join(creativeDir(creativeId), 'latest.json');
}

/** Crea la carpeta de la creatividad y escribe creative.json. */
function createCreative(creativeId, info) {
  fs.mkdirSync(creativeDir(creativeId), { recursive: true });
  const record = { creativeId, createdAt: new Date().toISOString(), ...info };
  fs.writeFileSync(creativeInfoPath(creativeId), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

/**
 * Reserva el directorio de la siguiente versión (numeración incremental,
 * nunca lexicográfica — v10 no puede ordenar antes que v2). Lo crea junto
 * con layers/ para que un proveedor pueda escribir directamente en él
 * (ver provider.generate() → req.metadata.outputDir).
 */
function beginVersion(creativeId) {
  const versionNumber = nextVersionNumber(creativeId);
  const dir = versionDir(creativeId, versionNumber);
  fs.mkdirSync(path.join(dir, 'layers'), { recursive: true });
  return { versionNumber, dir };
}

function nextVersionNumber(creativeId) {
  const existing = listVersions(creativeId);
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/**
 * Escribe prompt.json/metadata.json de una versión ya reservada
 * (beginVersion) y actualiza el puntero latest.json. El asset en sí
 * (image.png/video.mp4) lo escribe el proveedor directamente en el mismo
 * directorio — este método no copia bytes de imagen, solo registra el
 * resultado.
 * @param {string} creativeId
 * @param {number} versionNumber
 * @param {{prompt?: object, metadata?: object}} data
 */
function saveVersion(creativeId, versionNumber, data) {
  const dir = versionDir(creativeId, versionNumber);
  fs.mkdirSync(dir, { recursive: true });

  if (data.prompt) {
    fs.writeFileSync(path.join(dir, 'prompt.json'), JSON.stringify(data.prompt, null, 2), 'utf8');
  }
  if (data.metadata) {
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(data.metadata, null, 2), 'utf8');
  }

  updatePointer(creativeId, versionNumber);
  return { versionNumber, dir };
}

function updatePointer(creativeId, versionNumber) {
  const current = readPointer(creativeId) || { currentVersion: null, approvedVersion: null, versions: [] };
  const versions = current.versions.includes(versionNumber) ? current.versions : [...current.versions, versionNumber].sort((a, b) => a - b);

  const pointer = {
    creativeId,
    currentVersion: versionNumber,
    approvedVersion: current.approvedVersion,
    versions,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(creativeDir(creativeId), { recursive: true });
  fs.writeFileSync(pointerPath(creativeId), JSON.stringify(pointer, null, 2), 'utf8');
  return pointer;
}

/** Marca una versión como aprobada por el propietario — independiente de cuál sea la "current". */
function markApproved(creativeId, versionNumber) {
  const current = readPointer(creativeId);
  if (!current) throw new Error(`No existe latest.json para la creatividad "${creativeId}" — llama a saveVersion() primero.`);
  const pointer = { ...current, approvedVersion: versionNumber, updatedAt: new Date().toISOString() };
  fs.writeFileSync(pointerPath(creativeId), JSON.stringify(pointer, null, 2), 'utf8');
  return pointer;
}

function readPointer(creativeId) {
  try {
    return JSON.parse(fs.readFileSync(pointerPath(creativeId), 'utf8'));
  } catch {
    return null;
  }
}

function getLatestVersion(creativeId) {
  const pointer = readPointer(creativeId);
  if (!pointer || pointer.currentVersion === null) return null;
  return getVersion(creativeId, pointer.currentVersion);
}

function getVersion(creativeId, versionNumber) {
  const dir = versionDir(creativeId, versionNumber);
  if (!fs.existsSync(dir)) return null;

  const read = (file) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      return null;
    }
  };

  const files = fs.readdirSync(dir);
  const assetFile = files.find((f) => /^image\.|^video\./.test(f));

  return {
    versionNumber,
    dir,
    prompt: read('prompt.json'),
    metadata: read('metadata.json'),
    assetPath: assetFile ? path.join(dir, assetFile) : null,
  };
}

/** Números de versión existentes, ordenados numéricamente ascendente. */
function listVersions(creativeId) {
  const dir = versionsDir(creativeId);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.slice(1)))
    .sort((a, b) => a - b);
}

module.exports = {
  creativesBaseDir,
  creativeDir,
  createCreative,
  beginVersion,
  saveVersion,
  markApproved,
  readPointer,
  getLatestVersion,
  getVersion,
  listVersions,
};
