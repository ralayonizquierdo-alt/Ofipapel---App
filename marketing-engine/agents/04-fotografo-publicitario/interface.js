// Contrato de entrada/salida del Fotógrafo Publicitario.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: DIRECTOR_ARTE_OUTPUT } = require('../02-director-arte/interface.js');
const { OUTPUT_SHAPE: GUARDIAN_MARCA_OUTPUT } = require('../03-guardian-marca/interface.js');
const { arrayOf } = require('../../core/contracts/shapes.js');

const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'director-arte': DIRECTOR_ARTE_OUTPUT,
    'guardian-marca': GUARDIAN_MARCA_OUTPUT,
  },
};

const PHOTO_SPEC_SHAPE = {
  angle: 'string',
  background: 'string',
  lighting: 'string',
  notes: 'string',
};

const OUTPUT_SHAPE = {
  photoSpec: PHOTO_SPEC_SHAPE,
  fidelityRules: arrayOf('string'),
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE, PHOTO_SPEC_SHAPE };
