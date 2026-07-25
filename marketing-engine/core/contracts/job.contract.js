// Forma del objeto "Job" que viaja por todo el pipeline de marketing-engine,
// y del sobre de respuesta uniforme que devuelve CUALQUIER agente
// (agents/0N-*/service.js). Ver marketing-engine/ARCHITECTURE.md.
//
// `job.state` y `job.retryCount` son mapas dinámicos indexados por agentId
// (p.ej. state['director-creativo']) — cada agente valida SU PROPIA porción
// de `state` con su propio interface.js; este contrato solo valida la forma
// exterior del Job, no el contenido interno de cada agente (eso rompería el
// principio de "cada agente evoluciona independientemente").

const { assertShape, enumOf, arrayOf, maybe } = require('./shapes.js');

const JOB_STATUS = enumOf('running', 'completed', 'failed_needs_human');

// Brief de entrada: lo que aporta el propietario/RAX al arrancar un job.
const JOB_INPUT_SHAPE = {
  productName: 'string',
  category: 'string',
  brand: enumOf('ofipapel', 'canarias-ink', 'falcontrol'),
  description: 'string',
  channel: maybe(enumOf('instagram', 'facebook', 'whatsapp', 'ambas')),
  images: arrayOf('string'),
};

const JOB_SHAPE = {
  id: 'string',
  createdAt: 'string',
  input: JOB_INPUT_SHAPE,
  state: 'object',
  retryCount: 'object',
  currentAgentIndex: 'number',
  status: JOB_STATUS,
};

// Sobre uniforme que devuelve CUALQUIER agents/0N-*/service.js. El
// orquestador solo entiende este sobre — nunca mira el contenido de
// `output` directamente (eso es responsabilidad de cada agente/su
// interface.js propio).
const AGENT_RESULT_SHAPE = {
  status: enumOf('ok', 'blocked', 'needs_revision'),
  agentId: 'string',
  output: 'object',
  returnTo: maybe('string'),
  reason: maybe('string'),
};

/**
 * Crea un Job bien formado a partir de un brief de entrada ya validado.
 * @param {object} input - debe cumplir JOB_INPUT_SHAPE
 * @returns {object} Job — cumple JOB_SHAPE
 */
function createJob(input) {
  assertShape(input, JOB_INPUT_SHAPE, 'input');

  const job = {
    id: require('node:crypto').randomUUID(),
    createdAt: new Date().toISOString(),
    input,
    state: {},
    retryCount: {},
    currentAgentIndex: 0,
    status: 'running',
  };

  assertShape(job, JOB_SHAPE, 'job');
  return job;
}

module.exports = {
  JOB_STATUS,
  JOB_INPUT_SHAPE,
  JOB_SHAPE,
  AGENT_RESULT_SHAPE,
  createJob,
};
