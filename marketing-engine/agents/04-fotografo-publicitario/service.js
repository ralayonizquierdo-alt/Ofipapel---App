// Fotógrafo Publicitario — genera ÚNICAMENTE las instrucciones para
// obtener fotografías profesionales. Nunca modifica el producto, nunca
// inventa piezas, nunca altera colores. Máxima fidelidad.
//
// MODO ACTUAL: simulado — ficha técnica por defecto según el layout
// (config.js). Punto de enganche futuro: sustituir simulateDecision() por
// una llamada real a un LLM usando prompts/photo-spec.prompt.md —
// interface.js no cambia.

const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { FIDELITY_RULES, PHOTO_SPEC_BY_LAYOUT } = require('./config.js');

const AGENT_ID = 'fotografo-publicitario';

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  // === INICIO: LÓGICA SIMULADA (reemplazar por llamada real más adelante) ===
  const output = simulateDecision(job);
  // === FIN: LÓGICA SIMULADA ===

  assertShape(output, OUTPUT_SHAPE, 'output');
  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function simulateDecision(job) {
  const { layoutId } = job.state['director-arte'];
  const base = PHOTO_SPEC_BY_LAYOUT[layoutId] || PHOTO_SPEC_BY_LAYOUT.default;

  return {
    photoSpec: {
      ...base,
      notes: `Producto: "${job.input.productName}". ${job.input.description}`,
    },
    fidelityRules: FIDELITY_RULES,
  };
}

module.exports = { run };
