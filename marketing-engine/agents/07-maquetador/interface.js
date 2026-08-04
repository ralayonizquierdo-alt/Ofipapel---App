// Contrato de entrada/salida del Maquetador.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: DIRECTOR_ARTE_OUTPUT } = require('../02-director-arte/interface.js');
const { OUTPUT_SHAPE: COPYWRITER_OUTPUT } = require('../06-copywriter/interface.js');
const { GENERATION_RESULT_SHAPE } = require('../../core/providers/provider.interface.js');

// El orquestador guarda el resultado del proveedor de IA en
// job.state['proveedor-ia'] justo antes de invocar a este agente (ver
// core/orchestrator.js) — no es la salida de ningún agente con carpeta
// propia, ver la nota en 05-especialista-prompts/README.md.
const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'director-arte': DIRECTOR_ARTE_OUTPUT,
    copywriter: COPYWRITER_OUTPUT,
    'proveedor-ia': GENERATION_RESULT_SHAPE,
  },
};

const OUTPUT_SHAPE = {
  renderedAssetPath: 'string',
  templateUsed: 'string',
  width: 'number',
  height: 'number',
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE };
