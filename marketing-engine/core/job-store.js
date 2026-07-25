// Persistencia del estado de un job en disco — un JSON por job en
// marketing-engine/jobs/<jobId>/job.json. Generado, en .gitignore
// (marketing-engine/jobs/).

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const JOBS_DIR = path.join(REPO_ROOT, 'marketing-engine', 'jobs');

function jobDir(jobId) {
  return path.join(JOBS_DIR, jobId);
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

module.exports = { JOBS_DIR, jobDir, jobFilePath, saveJob, loadJob };
