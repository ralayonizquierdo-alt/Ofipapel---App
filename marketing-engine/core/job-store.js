// Persistencia del estado de un job en disco — un JSON por job en
// marketing-engine/jobs/<jobId>/job.json. Generado, en .gitignore
// (marketing-engine/jobs/).
//
// La ruta base es configurable vía MARKETING_ENGINE_JOBS_DIR (leída en
// cada llamada, no cacheada al cargar el módulo) — necesario para
// invocaciones serverless (Netlify Function/Lambda), donde el único
// directorio realmente escribible es /tmp y el filesystem del propio
// repo es de solo lectura. Sin variable definida, se usa la ruta actual
// relativa al repo (comportamiento del CLI, sin cambios).
//
// IMPORTANTE: cualquier otro módulo que necesite escribir ficheros de un
// job (proveedores, agentes) DEBE usar jobDir() de aquí — nunca recalcular
// la ruta por su cuenta. Ver marketing-engine/INTEGRATION.md.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function jobsBaseDir() {
  return process.env.MARKETING_ENGINE_JOBS_DIR || path.join(REPO_ROOT, 'marketing-engine', 'jobs');
}

function jobDir(jobId) {
  return path.join(jobsBaseDir(), jobId);
}

function jobFilePath(jobId) {
  return path.join(jobDir(jobId), 'job.json');
}

/**
 * @param {object} job
 */
function saveJob(job) {
  fs.mkdirSync(jobDir(job.id), { recursive: true });
  fs.writeFileSync(jobFilePath(job.id), JSON.stringify(job, null, 2), 'utf8');
}

/**
 * @param {string} jobId
 * @returns {object}
 */
function loadJob(jobId) {
  const raw = fs.readFileSync(jobFilePath(jobId), 'utf8');
  return JSON.parse(raw);
}

module.exports = { jobsBaseDir, jobDir, jobFilePath, saveJob, loadJob };
