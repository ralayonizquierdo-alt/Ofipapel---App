// Especialista en Prompts — convierte todas las decisiones anteriores en
// prompts optimizados para motores de generación de imágenes. Debe
// soportar múltiples proveedores, no depender nunca de uno único.
//
// MODO ACTUAL: simulado — construye un prompt genérico a partir de la
// plantilla (prompts/image-prompt-template.prompt.md) y siempre elige el
// proveedor "simulated" (config.js). Punto de enganche futuro: variar el
// prompt por proveedor y/o elegir providerId dinámicamente — interface.js
// no cambia.
//
// El orquestador es quien realmente invoca al proveedor (ver
// core/orchestrator.js) usando el `generationRequest` + `providerId` que
// este agente produce — así el diagrama del propietario
// (Especialista en Prompts → Proveedor de IA → Maquetador) queda
// representado sin que el proveedor sea un agente con carpeta propia.

const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { DEFAULT_PROVIDER_ID, DIMENSIONS_BY_STRUCTURE } = require('./config.js');

const AGENT_ID = 'especialista-prompts';

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  // === INICIO: LÓGICA SIMULADA (reemplazar por llamada real más adelante) ===
  const output = simulateDecision(job);
  // === FIN: LÓGICA SIMULADA ===

  assertShape(output, OUTPUT_SHAPE, 'output');
  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function simulateDecision(job) {
  const { strategy } = job.state['director-creativo'];
  const { composition, structure } = job.state['director-arte'];
  const { photoSpec, fidelityRules } = job.state['fotografo-publicitario'];

  const promptText = [
    `${job.input.productName}, ${photoSpec.angle}, ${photoSpec.background}, ${photoSpec.lighting}.`,
    `Composición: ${composition}.`,
    `Tono/estrategia: ${strategy}.`,
    `Reglas de fidelidad (obligatorias, no negociables): ${fidelityRules.join(' ')}`,
  ].join(' ');

  const dims = DIMENSIONS_BY_STRUCTURE[structure] || DIMENSIONS_BY_STRUCTURE.default;

  return {
    prompts: [{ purpose: 'generacion-imagen-principal', text: promptText }],
    providerId: DEFAULT_PROVIDER_ID,
    generationRequest: {
      prompt: promptText,
      width: dims.width,
      height: dims.height,
      contentClass: 'photo',
    },
  };
}

module.exports = { run };
