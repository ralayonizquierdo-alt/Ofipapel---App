// Contrato de entrada/salida del Director de Arte.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: DIRECTOR_CREATIVO_OUTPUT } = require('../01-director-creativo/interface.js');
const { enumOf, arrayOf } = require('../../core/contracts/shapes.js');

const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'director-creativo': DIRECTOR_CREATIVO_OUTPUT,
  },
};

const OUTPUT_SHAPE = {
  composition: 'string',
  hierarchy: arrayOf('string'),
  structure: 'string',
  layoutId: enumOf('layout-centrado', 'layout-diagonal', 'layout-collage'),
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE };
