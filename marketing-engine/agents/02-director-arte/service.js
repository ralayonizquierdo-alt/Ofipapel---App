// Director de Arte — diseña composición, jerarquía, estructura y
// distribución. NUNCA crea fotografías (eso es 04-fotografo-publicitario
// para la ficha técnica, y el proveedor de IA para generarlas de verdad).
//
// MODO ACTUAL: simulado — elige entre layouts predefinidos (config.js)
// según la familia gráfica decidida por el Director Creativo. Punto de
// enganche futuro: sustituir simulateDecision() por una llamada real a un
// LLM usando prompts/composition.prompt.md — interface.js no cambia.

const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { LAYOUTS_BY_GRAPHIC_FAMILY } = require('./config.js');

const AGENT_ID = 'director-arte';

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  // === INICIO: LÓGICA SIMULADA (reemplazar por llamada real más adelante) ===
  const output = simulateDecision(job);
  // === FIN: LÓGICA SIMULADA ===

  assertShape(output, OUTPUT_SHAPE, 'output');
  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function simulateDecision(job) {
  const { graphicFamily } = job.state['director-creativo'];
  const layout = LAYOUTS_BY_GRAPHIC_FAMILY[graphicFamily] || LAYOUTS_BY_GRAPHIC_FAMILY.default;
  return { ...layout };
}

module.exports = { run };
