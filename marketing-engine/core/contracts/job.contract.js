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
//
// Los 4 campos "maybe" (postTypeOverride/objective/creativeStyleHint/
// targetDate) son opcionales por diseño: el pipeline decide esos mismos
// aspectos de forma autónoma (01-director-creativo) si no se proporcionan.
// Cuando la app permite al usuario elegirlos explícitamente en el
// formulario de "Nueva Campaña" (ver marketing-engine/INTEGRATION.md),
// pasan a tener prioridad sobre la simulación — nunca la sustituyen para
// otros agentes, se consumen en un único sitio
// (01-director-creativo/service.js). `targetDate` no lo consume ningún
// agente: es solo para que la app muestre "fecha prevista" en el Almacén.
const JOB_INPUT_SHAPE = {
  productName: 'string',
  category: 'string',
  brand: enumOf('ofipapel', 'canarias-ink', 'falcontrol'),
  description: 'string',
  channel: maybe(enumOf('instagram', 'facebook', 'whatsapp', 'ambas')),
  images: arrayOf('string'),
  postTypeOverride: maybe(enumOf('foto', 'carrusel', 'reel')),
  objective: maybe(enumOf('vender', 'emocionar', 'sorprender', 'minimalista')),
  creativeStyleHint: maybe('string'),
  targetDate: maybe('string'),
};

const JOB_SHAPE = {
  id: 'string',
  createdAt: 'string',
  input: JOB_INPUT_SHAPE,
  state: 'object',
  retryCount: 'object',
  currentAgentIndex: 'number',
  status: JOB_STATUS,
  // Lo adjunta core/orchestrator.js justo antes del primer agente (capa
  // marketing-engine/intelligence/). Opcional a propósito por dos motivos:
  // un Job recién salido de createJob() todavía no lo tiene, y si la capa
  // de inteligencia falla se queda en null — el pipeline debe funcionar
  // igual que antes de que existiera. La forma INTERNA la validan los
  // contratos de intelligence/contracts.js, no este fichero: mismo
  // criterio que `state`, aquí solo se valida la forma exterior del Job.
  intelligence: maybe('object'),
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
