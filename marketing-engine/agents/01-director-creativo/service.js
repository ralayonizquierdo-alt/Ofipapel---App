// Director Creativo — analiza el producto y decide estrategia, tipo de
// publicación, tono, canal y familia gráfica.
//
// NUNCA genera imágenes. NUNCA escribe el copy final (eso es 07-copywriter).
// Es el primer agente del pipeline: no depende de ningún otro.
//
// MODO ACTUAL: simulado (reglas deterministas por categoría, ver config.js).
// Punto de enganche futuro: sustituir simulateDecision() por una llamada
// real a un LLM usando prompts/strategy.prompt.md como system prompt —
// interface.js (el contrato) no cambia al hacerlo.

const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { CATEGORY_RULES, DEFAULT_CHANNEL } = require('./config.js');

const AGENT_ID = 'director-creativo';

/**
 * @param {object} job - cumple INPUT_SHAPE
 * @returns {Promise<import('../../core/contracts/job.contract.js').AGENT_RESULT_SHAPE>}
 */
async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  // === INICIO: LÓGICA SIMULADA (reemplazar por llamada real más adelante) ===
  const output = simulateDecision(job);
  // === FIN: LÓGICA SIMULADA ===
  //
  // Punto de enganche futuro:
  //   const output = await callLLM(loadPrompt('strategy.prompt.md'), job);

  assertShape(output, OUTPUT_SHAPE, 'output');
  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function simulateDecision(job) {
  const rule = CATEGORY_RULES[job.input.category] || CATEGORY_RULES.default;
  return {
    strategy: `Mostrar "${job.input.productName}" destacando su beneficio principal para el público de ${job.input.brand}.`,
    postType: rule.postType,
    tone: rule.tone,
    channel: job.input.channel || DEFAULT_CHANNEL,
    graphicFamily: rule.graphicFamily,
  };
}

module.exports = { run };
