// Persistencia del Learning Engine — mismo patrón exacto que
// core/job-store.js, a propósito: cualquier módulo que escriba aquí DEBE
// usar estas funciones, nunca recalcular la ruta por su cuenta (ver la
// regla equivalente en la cabecera de job-store.js).
//
// Un fichero por jobId (record.json + outcome.json), no JSONL append-only:
// el resultado real (clics, ventas, alcance) casi siempre llega días
// después de la campaña, así que hace falta poder CARGAR y REESCRIBIR un
// registro existente — JSONL solo sirve bien para lo que nunca se edita.
//
// LIMITACIÓN CONOCIDA, documentada a propósito: en producción,
// MARKETING_ENGINE_LEARNING_DIR (igual que MARKETING_ENGINE_JOBS_DIR) se
// fija a una ruta bajo /tmp — y /tmp en AWS Lambda es efímero por
// contenedor. Los registros de aprendizaje escritos así NO sobreviven más
// allá de la vida del contenedor. Mecánicamente esto es correcto (mismo
// patrón que ya funciona para jobs/), pero como almacén de aprendizaje a
// largo plazo es un no-op real en producción hasta que se sustituya por un
// datastore de verdad (Supabase, ya en la pila del proyecto) — ver
// ROADMAP_V2.md, Fase 2. Con ~1000 registros, listRecords() (recorrido
// completo de directorio) es además la señal concreta de que toca migrar.

const fs = require('node:fs');
const path = require('node:path');

function learningBaseDir() {
  return process.env.MARKETING_ENGINE_LEARNING_DIR || path.join(__dirname, 'records');
}

function recordDir(jobId) {
  return path.join(learningBaseDir(), jobId);
}

function recordFilePath(jobId) {
  return path.join(recordDir(jobId), 'record.json');
}

function outcomeFilePath(jobId) {
  return path.join(recordDir(jobId), 'outcome.json');
}

function recordCampaign(record) {
  fs.mkdirSync(recordDir(record.jobId), { recursive: true });
  fs.writeFileSync(recordFilePath(record.jobId), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

function recordOutcome(jobId, outcome) {
  fs.mkdirSync(recordDir(jobId), { recursive: true });
  const existing = getOutcome(jobId) || {};
  const merged = { ...existing, ...outcome, jobId, recordedAt: new Date().toISOString() };
  fs.writeFileSync(outcomeFilePath(jobId), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function getRecord(jobId) {
  try {
    return JSON.parse(fs.readFileSync(recordFilePath(jobId), 'utf8'));
  } catch {
    return null;
  }
}

function getOutcome(jobId) {
  try {
    return JSON.parse(fs.readFileSync(outcomeFilePath(jobId), 'utf8'));
  } catch {
    return null;
  }
}

// O(n) sobre el directorio de registros — a propósito simple mientras el
// volumen sea bajo (ver limitación arriba). Cada entrada devuelta ya trae
// su outcome fusionado si existe, para que quien agregue no tenga que
// hacer una segunda pasada.
function listRecords() {
  const base = learningBaseDir();
  if (!fs.existsSync(base)) return [];

  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getRecord(entry.name))
    .filter(Boolean)
    .map((record) => ({ ...record, outcome: getOutcome(record.jobId) }));
}

module.exports = {
  learningBaseDir,
  recordDir,
  recordCampaign,
  recordOutcome,
  getRecord,
  getOutcome,
  listRecords,
};
