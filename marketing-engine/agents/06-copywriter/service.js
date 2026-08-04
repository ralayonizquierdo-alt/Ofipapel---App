// Copywriter — genera título, cuerpo, CTA, hashtags y descripción,
// adaptado a cada red social.
//
// MODO ACTUAL: simulado — plantillas de texto parametrizadas por
// tono/canal/marca (config.js). Punto de enganche futuro: sustituir
// simulateDecision() por una llamada real a un LLM usando
// prompts/copy.prompt.md — interface.js no cambia.

const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { CTA_BY_CHANNEL, BRAND_HASHTAGS } = require('./config.js');

const AGENT_ID = 'copywriter';

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  // === INICIO: LÓGICA SIMULADA (reemplazar por llamada real más adelante) ===
  const output = simulateDecision(job);
  // === FIN: LÓGICA SIMULADA ===

  assertShape(output, OUTPUT_SHAPE, 'output');
  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

function simulateDecision(job) {
  const { tone, channel } = job.state['director-creativo'];
  const { productName, description, brand } = job.input;

  const cta = CTA_BY_CHANNEL[channel] || CTA_BY_CHANNEL.ambas;
  const hashtags = [...(BRAND_HASHTAGS[brand] || []), `#${slugify(productName)}`];

  return {
    title: productName,
    body: description,
    cta,
    hashtags,
    description: `${description} ${cta}. ${hashtags.join(' ')}`,
  };
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
}

module.exports = { run };
