// Contrato de entrada/salida de Control de Calidad — el último agente del
// pipeline, y el único (junto a 03-guardian-marca) con permiso para
// devolver el job a un agente anterior.

const { JOB_INPUT_SHAPE } = require('../../core/contracts/job.contract.js');
const { OUTPUT_SHAPE: GUARDIAN_MARCA_OUTPUT } = require('../03-guardian-marca/interface.js');
const { OUTPUT_SHAPE: COPYWRITER_OUTPUT } = require('../06-copywriter/interface.js');
const { OUTPUT_SHAPE: MAQUETADOR_OUTPUT } = require('../07-maquetador/interface.js');
const { arrayOf } = require('../../core/contracts/shapes.js');

const INPUT_SHAPE = {
  input: JOB_INPUT_SHAPE,
  state: {
    'guardian-marca': GUARDIAN_MARCA_OUTPUT,
    copywriter: COPYWRITER_OUTPUT,
    maquetador: MAQUETADOR_OUTPUT,
  },
};

const CHECK_SHAPE = {
  name: 'string',
  passed: 'boolean',
  detail: 'string',
};

const OUTPUT_SHAPE = {
  checklist: arrayOf(CHECK_SHAPE),
  approved: 'boolean',
};

module.exports = { INPUT_SHAPE, OUTPUT_SHAPE, CHECK_SHAPE };
