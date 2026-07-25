// Contrato de entrada/salida del Guardián de Marca.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: DIRECTOR_ARTE_OUTPUT } = require('../02-director-arte/interface.js');
const { arrayOf } = require('../../core/contracts/shapes.js');

const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'director-creativo': 'object',
    'director-arte': DIRECTOR_ARTE_OUTPUT,
  },
};

const CHECK_SHAPE = {
  name: 'string',
  passed: 'boolean',
  detail: 'string',
};

const OUTPUT_SHAPE = {
  approved: 'boolean',
  brandKey: 'string',
  checks: arrayOf(CHECK_SHAPE),
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE, CHECK_SHAPE };
