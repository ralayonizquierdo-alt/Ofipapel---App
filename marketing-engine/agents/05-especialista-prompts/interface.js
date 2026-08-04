// Contrato de entrada/salida del Especialista en Prompts.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: DIRECTOR_ARTE_OUTPUT } = require('../02-director-arte/interface.js');
const { OUTPUT_SHAPE: FOTOGRAFO_OUTPUT } = require('../04-fotografo-publicitario/interface.js');
const { GENERATION_REQUEST_SHAPE } = require('../../core/providers/provider.interface.js');
const { arrayOf } = require('../../core/contracts/shapes.js');

const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'director-creativo': 'object',
    'director-arte': DIRECTOR_ARTE_OUTPUT,
    'fotografo-publicitario': FOTOGRAFO_OUTPUT,
  },
};

const OUTPUT_SHAPE = {
  prompts: arrayOf({ purpose: 'string', text: 'string' }),
  providerId: 'string',
  generationRequest: GENERATION_REQUEST_SHAPE,
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE };
