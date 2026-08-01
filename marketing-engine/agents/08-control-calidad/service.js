// Control de Calidad — revisa absolutamente todo, detecta errores e
// incoherencias, y puede devolver el job al agente correspondiente. Junto
// a 03-guardian-marca, es el único agente con permiso para hacerlo.
//
// A DIFERENCIA de la mayoría (simulados), este ejecuta un checklist
// determinista real (config.js) — no hace falta IA para comprobar "¿existe
// el archivo?" o "¿el CTA no está vacío?". El juicio subjetivo
// complementario (¿se ve bien de verdad?) queda documentado como capa
// futura en prompts/quality-review.prompt.md.

const { INPUT_SHAPE, OUTPUT_SHAPE } = require('./interface.js');
const { assertShape } = require('../../core/contracts/shapes.js');
const { CHECKS } = require('./config.js');

const AGENT_ID = 'control-calidad';

async function run(job) {
  assertShape(job, INPUT_SHAPE, 'job');

  const checklist = CHECKS.map((check) => {
    let passed = false;
    let detail = '';
    try {
      passed = Boolean(check.evaluate(job));
      detail = passed ? 'ok' : 'no cumple';
    } catch (err) {
      passed = false;
      detail = `error evaluando: ${err.message}`;
    }
    return { name: check.name, passed, detail };
  });

  const approved = checklist.every((c) => c.passed);
  const output = { checklist, approved };
  assertShape(output, OUTPUT_SHAPE, 'output');

  if (!approved) {
    const firstFailed = CHECKS.find((check, i) => !checklist[i].passed);
    return {
      status: 'needs_revision',
      agentId: AGENT_ID,
      output,
      returnTo: firstFailed.returnTo,
      reason: `Checklist de calidad no superado: ${checklist.filter((c) => !c.passed).map((c) => c.name).join(', ')}`,
    };
  }

  return { status: 'ok', agentId: AGENT_ID, output, returnTo: null, reason: null };
}

module.exports = { run };
