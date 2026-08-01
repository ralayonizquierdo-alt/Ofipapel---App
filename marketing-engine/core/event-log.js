// Log de decisiones/transiciones, append-only (JSON Lines), uno por job en
// marketing-engine/jobs/<jobId>/events.log. Es la traza que permite a una
// sesión de Claude (o al propio propietario) auditar qué decidió cada
// agente y por qué el pipeline avanzó, rebotó o falló.

const fs = require('node:fs');
const path = require('node:path');
const { jobDir } = require('./job-store.js');

function eventLogPath(jobId) {
  return path.join(jobDir(jobId), 'events.log');
}

/**
 * @param {string} jobId
 * @param {object} event - objeto arbitrario, se le añade `at` (timestamp ISO) automáticamente
 */
function appendEvent(jobId, event) {
  fs.mkdirSync(jobDir(jobId), { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  fs.appendFileSync(eventLogPath(jobId), line + '\n', 'utf8');
}

/**
 * @param {string} jobId
 * @returns {object[]}
 */
function readEvents(jobId) {
  const filePath = eventLogPath(jobId);
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = { eventLogPath, appendEvent, readEvents };
